import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { deriveRoleScope } from '../common/auth/role-scope.util';
import { RoleScope } from '../common/enums/role-scope.enum';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { PlatformAccessService } from '../platform/platform-access.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async login(dto: LoginDto, request?: Request) {
    const user = await this.loadUserByEmail(dto.email, dto.tenantSlug);

    if (!user || user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const basePayload = await this.buildPayload(user, dto.activeBranchId);
    const session = await this.createSession(user.id, user.tenantId, request);
    const tokens = await this.generateTokens(basePayload, session.id);
    const now = new Date();

    await Promise.all([
      this.storeRefreshToken(session.id, tokens.refreshToken),
      this.markUserActivity(user.id, { lastLoginAt: now, lastSeenAt: now }),
    ]);

    return {
      user: await this.serializeAuthUser(basePayload, session.id),
      ...tokens,
    };
  }

  async refresh(dto: RefreshTokenDto, request?: Request) {
    const refreshPayload = await this.verifyRefreshToken(dto.refreshToken);
    if (!refreshPayload.sessionId) {
      throw new UnauthorizedException('Refresh token session is missing');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: refreshPayload.sessionId },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is no longer active');
    }

    const matches = await bcrypt.compare(dto.refreshToken, session.refreshTokenHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.loadUserById(refreshPayload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active');
    }

    const basePayload = await this.buildPayload(user);
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
      user: await this.serializeAuthUser(basePayload, session.id),
      ...tokens,
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
    return this.serializeAuthUser(payload, payload.sessionId);
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

  private async buildPayload(user: LoadedUser, requestedActiveBranchId?: string): Promise<JwtPayload> {
    const roleCodes = user.userRoles.map((entry) => entry.role.code);
    const permissions = new Set<string>();

    for (const userRole of user.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    for (const userPermission of user.userPermissions) {
      permissions.add(userPermission.permission.code);
    }

    const roleScope = deriveRoleScope(roleCodes, user.isSuperAdmin);
    const allowedBranchIds =
      roleScope === RoleScope.TENANT_ADMIN
        ? (
            await this.prisma.branch.findMany({
              where: { tenantId: user.tenantId },
              select: { id: true },
              orderBy: { createdAt: 'asc' },
            })
          ).map((branch) => branch.id)
        : user.branchAccesses.map((entry) => entry.branchId);

    const resolvedActiveBranchId = this.resolveActiveBranchId({
      roleScope,
      requestedActiveBranchId,
      currentActiveBranchId: user.activeBranchId,
      allowedBranchIds,
    });

    if (resolvedActiveBranchId && resolvedActiveBranchId !== user.activeBranchId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { activeBranchId: resolvedActiveBranchId },
      });
    }

    const tenantCapabilities = await this.platformAccessService.getTenantCapabilities(user.tenantId);

    return {
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: user.tenant.slug,
      tenantName: user.tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isSuperAdmin: user.isSuperAdmin,
      roleScope,
      allowedBranchIds,
      activeBranchId: resolvedActiveBranchId,
      roles: roleCodes,
      permissions: [...permissions],
      enabledModules: tenantCapabilities.enabledModules,
    };
  }

  private async generateTokens(payload: JwtPayload, sessionId: string) {
    const tokenPayload: JwtPayload = {
      ...payload,
      sessionId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(tokenPayload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async serializeAuthUser(payload: JwtPayload, sessionId?: string) {
    const [availableBranches, tenantCapabilities] = await Promise.all([
      payload.allowedBranchIds.length
        ? this.prisma.branch.findMany({
            where: {
              tenantId: payload.tenantId,
              id: { in: payload.allowedBranchIds },
            },
            select: {
              id: true,
              tenantId: true,
              name: true,
              location: true,
            },
            orderBy: { createdAt: 'asc' },
          })
        : Promise.resolve([]),
      this.platformAccessService.getTenantCapabilities(payload.tenantId),
    ]);

    return {
      id: payload.sub,
      userId: payload.userId,
      sessionId: sessionId ?? payload.sessionId ?? null,
      email: payload.email,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      tenantName: payload.tenantName,
      roleScope: payload.roleScope,
      allowedBranchIds: payload.allowedBranchIds,
      activeBranchId: payload.activeBranchId,
      availableBranches,
      firstName: payload.firstName,
      lastName: payload.lastName,
      isSuperAdmin: payload.isSuperAdmin,
      roles: payload.roles,
      permissions: payload.permissions,
      enabledModules: tenantCapabilities.enabledModules,
      tenantCapabilities,
    };
  }

  private async createSession(userId: string, tenantId: string, request?: Request) {
    const ttl = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = this.resolveExpiryFromNow(ttl);

    return this.prisma.userSession.create({
      data: {
        userId,
        tenantId,
        refreshTokenHash: 'pending',
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

  private verifyRefreshToken(refreshToken: string) {
    try {
      return this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private resolveActiveBranchId(input: {
    roleScope: RoleScope;
    requestedActiveBranchId?: string;
    currentActiveBranchId: string | null;
    allowedBranchIds: string[];
  }) {
    const {
      roleScope,
      requestedActiveBranchId,
      currentActiveBranchId,
      allowedBranchIds,
    } = input;

    if (roleScope === RoleScope.TENANT_ADMIN) {
      return requestedActiveBranchId ?? currentActiveBranchId ?? allowedBranchIds[0] ?? null;
    }

    if (requestedActiveBranchId && !allowedBranchIds.includes(requestedActiveBranchId)) {
      throw new ForbiddenException('Requested branch is outside the user scope');
    }

    if (currentActiveBranchId && allowedBranchIds.includes(currentActiveBranchId)) {
      return requestedActiveBranchId ?? currentActiveBranchId;
    }

    return requestedActiveBranchId ?? allowedBranchIds[0] ?? null;
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

  private loadUserByEmail(email: string, tenantSlug?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
      },
      include: userInclude,
    });
  }

  private loadUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: userInclude,
    });
  }
}

const userInclude = {
  tenant: true,
  userRoles: {
    include: {
      role: {
        include: {
          rolePermissions: {
            include: { permission: true },
          },
        },
      },
    },
  },
  userPermissions: {
    include: { permission: true },
  },
  branchAccesses: {
    include: {
      branch: true,
    },
  },
} as const;

type LoadedUser = NonNullable<Awaited<ReturnType<AuthService['loadUserById']>>>;
