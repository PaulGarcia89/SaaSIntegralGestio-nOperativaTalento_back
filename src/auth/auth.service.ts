import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthContextService } from '../common/auth/auth-context.service';
import { SessionTokenPayload } from '../common/interfaces/session-token-payload.interface';
import { CreateWorkspaceViewDto, UpdateWorkspaceViewDto } from './dto/workspace-view.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authContextService: AuthContextService,
  ) {}

  async login(dto: LoginDto, request?: Request) {
    const user = await this.authContextService.loadUserByEmail(dto.email, dto.tenantSlug);

    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new AppException(
        'Invalid credentials',
        ErrorCode.AUTH_REQUIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppException(
        'Invalid credentials',
        ErrorCode.AUTH_REQUIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const session = await this.createSession(user.id, user.tenantId, request);
    const basePayload = await this.authContextService.buildAuthorizedPayload(user, {
      requestedActiveTenantId: session.activeTenantId,
      requestedActiveBranchId: dto.activeBranchId,
      sessionId: session.id,
      sessionContext: {
        activeTenantId: session.activeTenantId,
        impersonationTenantId: session.impersonationTenantId,
        impersonationStartedAt: session.impersonationStartedAt,
        impersonationReason: session.impersonationReason,
      },
    });
    const tokens = await this.generateTokens(basePayload, session.id);
    const now = new Date();

    await Promise.all([
      this.storeRefreshToken(session.id, tokens.refreshToken),
      this.markUserActivity(user.id, { lastLoginAt: now, lastSeenAt: now }),
    ]);

    return {
      user: await this.authContextService.serializeAuthUser(basePayload),
      accessToken: tokens.accessToken,
      expiresIn: this.resolveAccessTokenTtlSeconds(),
      refreshToken: tokens.refreshToken,
    };
  }

  async refresh(dto: RefreshTokenDto, request?: Request) {
    const refreshToken = dto.refreshToken ?? '';
    const refreshPayload = await this.verifyRefreshToken(refreshToken);
    if (!refreshPayload.sessionId) {
      throw new AppException(
        'Refresh token session is missing',
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: refreshPayload.sessionId },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new AppException(
        'Session is no longer active',
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const matches = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!matches) {
      await this.prisma.userSession.updateMany({
        where: {
          userId: session.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      throw new AppException(
        'Refresh token reuse detected',
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.authContextService.loadUserById(refreshPayload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new AppException(
        'User is not active',
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    const basePayload = await this.authContextService.buildAuthorizedPayload(user, {
      requestedActiveTenantId: session.activeTenantId,
      requestedActiveBranchId: user.activeBranchId,
      sessionId: session.id,
      sessionContext: {
        activeTenantId: session.activeTenantId,
        impersonationTenantId: session.impersonationTenantId,
        impersonationStartedAt: session.impersonationStartedAt,
        impersonationReason: session.impersonationReason,
      },
    });
    const tokens = await this.generateTokens(basePayload, session.id);

    await Promise.all([
      this.storeRefreshToken(session.id, tokens.refreshToken),
      this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: new Date(),
          ipAddress: this.resolveIp(request) ?? session.ipAddress,
          userAgent: this.resolveUserAgent(request) ?? session.userAgent,
        },
      }),
      this.markUserActivity(user.id, { lastSeenAt: new Date() }),
    ]);

    return {
      user: await this.authContextService.serializeAuthUser(basePayload),
      accessToken: tokens.accessToken,
      expiresIn: this.resolveAccessTokenTtlSeconds(),
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(payload: JwtPayload) {
    if (!payload.sessionId) {
      return { revoked: false };
    }

    await this.prisma.userSession.updateMany({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { revoked: true };
  }

  async getCurrentUser(payload: JwtPayload) {
    return this.authContextService.serializeAuthUser(payload);
  }

  async getPreferences(payload: JwtPayload) {
    return this.authContextService.loadPreferences(payload.userId, payload.activeTenantId ?? payload.tenantId);
  }

  async updatePreference(payload: JwtPayload, namespace: string, value: unknown) {
    if (!namespace.trim()) {
      throw new BadRequestException('Preference namespace is required');
    }
    return this.authContextService.upsertPreference(
      payload.userId,
      payload.activeTenantId ?? payload.tenantId,
      namespace.trim(),
      value as never,
    );
  }

  async listWorkspaceViews(payload: JwtPayload, module: string, screen: string, workspaceKey?: string) {
    if (!module?.trim() || !screen?.trim()) throw new BadRequestException('Module and screen are required');
    const tenantId = payload.activeTenantId ?? payload.tenantId;
    return this.prisma.workspaceView.findMany({
      where: { tenantId, module: module.trim(), screen: screen.trim(), workspaceKey: workspaceKey?.trim() || null, OR: [{ userId: payload.sub }, { isShared: true }] },
      orderBy: [{ isDefault: 'desc' }, { isShared: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async createWorkspaceView(payload: JwtPayload, input: CreateWorkspaceViewDto) {
    if (!input.module?.trim() || !input.screen?.trim() || !input.name?.trim()) throw new BadRequestException('Module, screen and name are required');
    const tenantId = payload.activeTenantId ?? payload.tenantId;
    if (input.isDefault) await this.prisma.workspaceView.updateMany({ where: { tenantId, userId: payload.sub, module: input.module.trim(), screen: input.screen.trim(), workspaceKey: input.workspaceKey?.trim() || null }, data: { isDefault: false } });
    return this.prisma.workspaceView.create({ data: { tenantId, userId: payload.sub, module: input.module.trim(), screen: input.screen.trim(), workspaceKey: input.workspaceKey?.trim() || null, name: input.name.trim().slice(0, 80), config: input.config as Prisma.InputJsonValue, isShared: input.isShared ?? false, isDefault: input.isDefault ?? false } });
  }

  async updateWorkspaceView(payload: JwtPayload, id: string, input: UpdateWorkspaceViewDto) {
    const view = await this.prisma.workspaceView.findFirst({ where: { id, tenantId: payload.activeTenantId ?? payload.tenantId, userId: payload.sub } });
    if (!view) throw new NotFoundException('Workspace view not found');
    if (!input.name?.trim()) throw new BadRequestException('View name is required');
    if (input.isDefault) await this.prisma.workspaceView.updateMany({ where: { tenantId: view.tenantId, userId: payload.sub, module: view.module, screen: view.screen, workspaceKey: view.workspaceKey, id: { not: id } }, data: { isDefault: false } });
    return this.prisma.workspaceView.update({ where: { id }, data: { name: input.name.trim().slice(0, 80), config: input.config as Prisma.InputJsonValue, isShared: input.isShared ?? false, isDefault: input.isDefault ?? false } });
  }

  async deleteWorkspaceView(payload: JwtPayload, id: string) {
    const result = await this.prisma.workspaceView.deleteMany({ where: { id, tenantId: payload.activeTenantId ?? payload.tenantId, userId: payload.sub } });
    if (!result.count) throw new NotFoundException('Workspace view not found');
    return { deleted: true };
  }

  async updateActiveBranch(payload: JwtPayload, branchId: string) {
    const updatedPayload = await this.authContextService.updateActiveBranch(payload, branchId);
    return this.authContextService.serializeAuthUser(updatedPayload);
  }

  async updateActiveTenant(payload: JwtPayload, tenantId: string) {
    if (payload.role !== 'PLATFORM_ADMIN') {
      throw new AppException(
        'Role cannot switch tenant context',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!payload.permissions.includes('platform.tenant.switch')) {
      throw new AppException('Permission denied', ErrorCode.PERMISSION_DENIED, HttpStatus.FORBIDDEN);
    }

    if (!payload.allowedTenantIds.includes(tenantId)) {
      throw new AppException('Tenant is outside the allowed scope', ErrorCode.TENANT_ACCESS_DENIED, HttpStatus.FORBIDDEN);
    }

    const targetTenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: true },
    });

    if (!targetTenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (targetTenant.status !== 'ACTIVE') {
      throw new AppException('Tenant is not active', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT);
    }

    if (!payload.sessionId) {
      throw new AppException('Session is required', ErrorCode.SESSION_EXPIRED, HttpStatus.UNAUTHORIZED);
    }

    const firstBranchAccess = await this.prisma.userBranchAccess.findFirst({
      where: {
        userId: payload.sub,
        branch: {
          tenantId,
        },
      },
      orderBy: { assignedAt: 'asc' },
      select: { branchId: true },
    });

    await this.prisma.userSession.update({
      where: { id: payload.sessionId },
      data: {
        activeTenantId: tenantId,
      },
    });

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: {
        activeBranchId: firstBranchAccess?.branchId ?? null,
      },
    });

    const user = await this.authContextService.loadUserById(payload.sub);
    if (!user) {
      throw new AppException('User does not exist', ErrorCode.AUTH_REQUIRED, HttpStatus.UNAUTHORIZED);
    }

    const updatedPayload = await this.authContextService.buildAuthorizedPayload(user, {
      requestedActiveTenantId: tenantId,
      requestedActiveBranchId: firstBranchAccess?.branchId ?? null,
      sessionId: payload.sessionId,
      sessionContext: {
        activeTenantId: tenantId,
      },
    });

    return this.authContextService.serializeAuthUser(updatedPayload);
  }

  async startImpersonation(payload: JwtPayload, tenantId: string, reason: string) {
    if (payload.role !== 'SUPERADMIN') {
      throw new AppException(
        'Role cannot impersonate tenant context',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!payload.permissions.includes('platform.tenant.impersonate')) {
      throw new AppException('Permission denied', ErrorCode.PERMISSION_DENIED, HttpStatus.FORBIDDEN);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (!payload.sessionId) {
      throw new AppException('Session is required', ErrorCode.SESSION_EXPIRED, HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.userSession.update({
      where: { id: payload.sessionId },
      data: {
        activeTenantId: tenantId,
        impersonationTenantId: tenantId,
        impersonationStartedAt: new Date(),
        impersonationReason: reason,
      },
    });

    const user = await this.authContextService.loadUserById(payload.sub);
    if (!user) {
      throw new AppException('User does not exist', ErrorCode.AUTH_REQUIRED, HttpStatus.UNAUTHORIZED);
    }

    const updatedPayload = await this.authContextService.buildAuthorizedPayload(user, {
      requestedActiveTenantId: tenantId,
      sessionId: payload.sessionId,
      sessionContext: {
        activeTenantId: tenantId,
        impersonationTenantId: tenantId,
        impersonationStartedAt: new Date(),
        impersonationReason: reason,
      },
    });

    return this.authContextService.serializeAuthUser(updatedPayload);
  }

  async stopImpersonation(payload: JwtPayload) {
    if (payload.role !== 'SUPERADMIN') {
      throw new AppException(
        'Role cannot stop impersonation',
        ErrorCode.ROLE_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }

    if (!payload.sessionId) {
      throw new AppException('Session is required', ErrorCode.SESSION_EXPIRED, HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.userSession.update({
      where: { id: payload.sessionId },
      data: {
        activeTenantId: null,
        impersonationTenantId: null,
        impersonationStartedAt: null,
        impersonationReason: null,
      },
    });

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { activeBranchId: null },
    });

    const user = await this.authContextService.loadUserById(payload.sub);
    if (!user) {
      throw new AppException('User does not exist', ErrorCode.AUTH_REQUIRED, HttpStatus.UNAUTHORIZED);
    }

    const updatedPayload = await this.authContextService.buildAuthorizedPayload(user, {
      sessionId: payload.sessionId,
      sessionContext: {
        activeTenantId: null,
        impersonationTenantId: null,
        impersonationStartedAt: null,
        impersonationReason: null,
      },
    });

    return this.authContextService.serializeAuthUser(updatedPayload);
  }

  async getSessions(payload: JwtPayload) {
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId: payload.sub,
        revokedAt: null,
      },
      orderBy: { lastUsedAt: 'desc' },
    });

    return sessions.map((session) => ({
      id: session.id,
      current: session.id === payload.sessionId,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
    }));
  }

  async revokeSession(payload: JwtPayload, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: payload.sub,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });

    return { revoked: true };
  }

  private async generateTokens(payload: JwtPayload, sessionId: string) {
    const baseTokenPayload = {
      sub: payload.sub,
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({
        ...baseTokenPayload,
        tokenType: 'access',
      } satisfies SessionTokenPayload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync({
        ...baseTokenPayload,
        tokenType: 'refresh',
      } satisfies SessionTokenPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private resolveAccessTokenTtlSeconds() {
    const ttl = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m').trim().toLowerCase();
    const match = ttl.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 900;
    }

    const value = Number(match[1]);
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
    };

    return value * (multipliers[match[2]] ?? 60);
  }

  private async createSession(userId: string, tenantId: string, request?: Request) {
    const ttl = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = this.resolveExpiryFromNow(ttl);
    const user = await this.authContextService.loadUserById(userId);
    const roleCodes = user?.userRoles.map((entry) => entry.role.code) ?? [];
    const activeTenantId =
      user?.isSuperAdmin
        ? null
        : roleCodes.includes('PLATFORM_ADMIN')
          ? user?.platformTenantAccesses[0]?.tenantId ?? null
          : tenantId;

    return this.prisma.userSession.create({
      data: {
        userId,
        tenantId,
        refreshTokenHash: 'pending',
        activeTenantId,
        expiresAt,
        ipAddress: this.resolveIp(request),
        userAgent: this.resolveUserAgent(request),
      },
    });
  }

  private async storeRefreshToken(sessionId: string, refreshToken: string) {
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { refreshTokenHash },
    });
  }

  private async markUserActivity(
    userId: string,
    data: { lastLoginAt?: Date; lastSeenAt?: Date },
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  private async verifyRefreshToken(refreshToken: string) {
    if (!refreshToken) {
      throw new AppException(
        'Refresh token is required',
        ErrorCode.AUTH_REQUIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<SessionTokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      if (payload.tokenType !== 'refresh') {
        throw new Error('Unexpected token type');
      }

      return payload;
    } catch {
      throw new AppException(
        'Invalid refresh token',
        ErrorCode.SESSION_EXPIRED,
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  private resolveExpiryFromNow(ttl: string) {
    const normalized = ttl.trim().toLowerCase();
    const match = normalized.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = Number(match[1]);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  private resolveIp(request?: Request) {
    if (!request) {
      return null;
    }

    const forwardedFor = request.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor[0]) {
      return forwardedFor[0];
    }

    return request.ip ?? null;
  }

  private resolveUserAgent(request?: Request) {
    if (!request) {
      return null;
    }

    const userAgent = request.headers['user-agent'];
    if (Array.isArray(userAgent)) {
      return userAgent[0] ?? null;
    }

    return userAgent ?? null;
  }
}
