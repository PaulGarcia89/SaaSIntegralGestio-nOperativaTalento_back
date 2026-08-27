import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import {
  deriveAccessScope,
  derivePrimaryRole,
  deriveRoleScope,
} from './role-scope.util';
import { RoleScope } from '../enums/role-scope.enum';
import { PlatformAccessService } from '../../platform/platform-access.service';
import { SubscriptionAccessState } from './subscription-access-state.enum';
import { SessionTokenPayload } from '../interfaces/session-token-payload.interface';

export const authorizedUserInclude = {
  tenant: {
    include: {
      subscription: true,
    },
  },
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
  activeBranch: true,
  platformTenantAccesses: {
    include: {
      tenant: true,
    },
  },
  sessions: {
    where: { revokedAt: null },
    orderBy: { createdAt: 'desc' },
  },
} as const;

type LoadedUser = Awaited<ReturnType<AuthContextService['loadUserById']>>;

@Injectable()
export class AuthContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async buildAuthorizedPayload(
    user: NonNullable<LoadedUser>,
    options?: {
      requestedActiveTenantId?: string | null;
      requestedActiveBranchId?: string | null;
      sessionId?: string | null;
      sessionContext?: {
        activeTenantId?: string | null;
        impersonationTenantId?: string | null;
        impersonationStartedAt?: Date | null;
        impersonationReason?: string | null;
      };
    },
  ): Promise<JwtPayload> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User is not active');
    }

    if (user.tenant.status !== 'ACTIVE' && !user.isSuperAdmin) {
      throw new ForbiddenException('Tenant is not active');
    }

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
    const accessScope = deriveAccessScope(roleScope, user.isSuperAdmin);
    const allowedTenantIds = user.isSuperAdmin
      ? (
          await this.prisma.tenant.findMany({
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })
        ).map((tenant) => tenant.id)
      : roleCodes.includes('PLATFORM_ADMIN')
        ? user.platformTenantAccesses
            .filter((entry) => entry.tenant.status === 'ACTIVE')
            .map((entry) => entry.tenantId)
        : [user.tenantId];

    const impersonationTenantId =
      user.isSuperAdmin ? options?.sessionContext?.impersonationTenantId ?? null : null;
    const isImpersonating = Boolean(impersonationTenantId);
    const requestedActiveTenantId = options?.requestedActiveTenantId ?? options?.sessionContext?.activeTenantId ?? null;
    const activeTenantId = this.resolveActiveTenantId({
      userTenantId: user.tenantId,
      roleCodes,
      isSuperAdmin: user.isSuperAdmin,
      allowedTenantIds,
      requestedActiveTenantId,
      impersonationTenantId,
    });
    const effectiveTenantId = impersonationTenantId ?? activeTenantId;

    const allowedBranchIds =
      effectiveTenantId === null
        ? []
        : roleScope === RoleScope.TENANT_ADMIN
          ? (
              await this.prisma.branch.findMany({
                where: { tenantId: effectiveTenantId },
                select: { id: true },
                orderBy: { createdAt: 'asc' },
              })
            ).map((branch) => branch.id)
          : user.branchAccesses
              .filter((entry) => entry.branch.tenantId === effectiveTenantId)
              .map((entry) => entry.branchId);
    const allowedBranchIdSet = new Set(allowedBranchIds);

    const resolvedActiveBranchId = this.resolveActiveBranchId({
      roleScope,
      requestedActiveBranchId: options?.requestedActiveBranchId ?? undefined,
      currentActiveBranchId:
        user.activeBranch?.tenantId === effectiveTenantId ? user.activeBranchId : null,
      allowedBranchIds: [...allowedBranchIdSet],
    });

    if (resolvedActiveBranchId && resolvedActiveBranchId !== user.activeBranchId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { activeBranchId: resolvedActiveBranchId },
      });
    }

    const activeTenant =
      effectiveTenantId === null
        ? null
        : effectiveTenantId === user.tenantId
          ? user.tenant
          : await this.prisma.tenant.findUnique({
              where: { id: effectiveTenantId },
              include: { subscription: true },
            });
    const tenantCapabilities =
      effectiveTenantId === null
        ? { enabledModules: [] as never[], plan: null, inventoryCapabilities: [] }
        : await this.platformAccessService.getTenantCapabilities(effectiveTenantId);
    const subscriptionState =
      activeTenant?.subscription
        ? this.resolveSubscriptionState(activeTenant.subscription)
        : SubscriptionAccessState.ACTIVE;

    return {
      sub: user.id,
      userId: user.id,
      ...(options?.sessionId ? { sessionId: options.sessionId } : {}),
      tenantId: user.tenantId,
      allowedTenantIds,
      activeTenantId: effectiveTenantId,
      tenantSlug: activeTenant?.slug ?? user.tenant.slug,
      tenantName: activeTenant?.name ?? user.tenant.name,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: derivePrimaryRole(roleCodes, user.isSuperAdmin),
      scope: accessScope,
      isSuperAdmin: user.isSuperAdmin,
      roleScope,
      allowedBranchIds,
      activeBranchId: resolvedActiveBranchId,
      roles: roleCodes,
      permissions: [...permissions],
      enabledModules: tenantCapabilities.enabledModules,
      isGlobalContext: effectiveTenantId === null,
      impersonation: {
        active: isImpersonating,
        tenantId: impersonationTenantId,
        startedAt: options?.sessionContext?.impersonationStartedAt?.toISOString() ?? null,
        reason: options?.sessionContext?.impersonationReason ?? null,
      },
      subscriptionStatus: subscriptionState,
      subscriptionGraceEndsAt:
        subscriptionState === SubscriptionAccessState.GRACE_PERIOD
          ? activeTenant?.subscription?.endsAt?.toISOString() ?? null
          : null,
    };
  }

  async hydrateFromJwt(
    tokenPayload: Pick<SessionTokenPayload, 'sub' | 'sessionId'>,
  ): Promise<JwtPayload> {
    if (!tokenPayload.sessionId) {
      throw new UnauthorizedException('Session is missing');
    }

    const user = await this.loadUserById(tokenPayload.sub);
    if (!user) {
      throw new UnauthorizedException('User does not exist');
    }

    const session = user.sessions.find((entry) => entry.id === tokenPayload.sessionId);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    return this.buildAuthorizedPayload(user, {
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
  }

  async serializeAuthUser(payload: JwtPayload) {
    const [availableBranches, tenantCapabilities, currentUsage] = await Promise.all([
      payload.activeTenantId && payload.allowedBranchIds.length
        ? this.prisma.branch.findMany({
            where: {
              tenantId: payload.activeTenantId,
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
      payload.activeTenantId
        ? this.platformAccessService.getTenantCapabilities(payload.activeTenantId)
        : Promise.resolve({
            enabledModules: [] as never[],
            planModules: [] as never[],
            inventoryCapabilities: [],
            plan: null,
            subscription: null,
            featureFlags: [],
            navigation: [],
            dashboard: [],
          }),
      payload.activeTenantId
        ? Promise.all([
            this.prisma.user.count({ where: { tenantId: payload.activeTenantId } }),
            this.prisma.branch.count({ where: { tenantId: payload.activeTenantId } }),
            this.prisma.employee.count({ where: { tenantId: payload.activeTenantId } }),
          ]).then(([users, branches, employees]) => ({ users, branches, employees }))
        : Promise.resolve({ users: 0, branches: 0, employees: 0 }),
    ]);
    const preferences = await this.loadPreferences(payload.sub, payload.activeTenantId);

    const featureFlags = new Set<string>([
      'module.dashboard',
      'module.notifications',
      'module.profile',
      ...payload.enabledModules.map((moduleCode) => `module.${moduleCode.toLowerCase()}`),
    ]);

    // Platform administrators govern the SaaS even when no tenant is selected.
    const canAccessGlobalGovernance =
      (payload.role === 'SUPERADMIN' || payload.role === 'PLATFORM_ADMIN') &&
      payload.isGlobalContext;

    if (canAccessGlobalGovernance) {
      featureFlags.add('module.admin');
    }

    const planLimits = this.resolvePlanLimits(tenantCapabilities.plan?.code);
    const currentBranch =
      availableBranches.find((branch) => branch.id === payload.activeBranchId) ?? null;

    return {
      user: {
        id: payload.sub,
        tenantId: payload.activeTenantId,
        fullName: [payload.firstName, payload.lastName].filter(Boolean).join(' ').trim(),
        email: payload.email,
        status: 'active',
      },
      role: payload.role,
      roles: payload.roles,
      permissions: payload.permissions,
      effectivePermissions: payload.permissions,
      enabledModules: payload.enabledModules,
      allowedTenantIds: payload.allowedTenantIds,
      allowedBranchIds: payload.allowedBranchIds,
      activeTenantId: payload.activeTenantId,
      activeBranchId: payload.activeBranchId,
      isGlobalContext: payload.isGlobalContext,
      impersonation: payload.impersonation,
      subscriptionStatus: payload.subscriptionStatus.toLowerCase(),
      subscriptionGraceEndsAt: payload.subscriptionGraceEndsAt,
      plan: tenantCapabilities.plan,
      subscription: tenantCapabilities.subscription,
      featureFlags: [...featureFlags],
      inventoryCapabilities: tenantCapabilities.inventoryCapabilities,
      canAccessGlobalGovernance,
      preferences,
      menu: tenantCapabilities.navigation,
      tenant: payload.activeTenantId
        ? {
            id: payload.activeTenantId,
            slug: payload.tenantSlug,
            name: payload.tenantName,
            plan: tenantCapabilities.plan?.code?.toLowerCase() ?? null,
            enabledModules: payload.enabledModules.map((moduleCode) => moduleCode.toLowerCase()),
            branding: {
              accent: '#2563EB',
              supportEmail: process.env.DEFAULT_SUPPORT_EMAIL ?? '',
              productName: process.env.DEFAULT_PRODUCT_NAME ?? null,
              logoUrl: null,
            },
          }
        : null,
      availableBranches,
      allowedBranches: availableBranches,
      currentBranch,
      limits: planLimits,
      currentUsage,
      id: payload.sub,
      userId: payload.userId,
      sessionId: payload.sessionId ?? null,
      email: payload.email,
      tenantId: payload.tenantId,
      tenantSlug: payload.tenantSlug,
      tenantName: payload.tenantName,
      scope: payload.scope,
      roleScope: payload.roleScope,
      firstName: payload.firstName,
      lastName: payload.lastName,
      isSuperAdmin: payload.isSuperAdmin,
    };
  }

  async loadPreferences(userId: string, tenantId: string | null) {
    const rows = await this.prisma.userPreference.findMany({
      where: {
        userId,
        OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      },
      orderBy: [{ updatedAt: 'desc' }],
    });

    return rows.reduce<Record<string, unknown>>((acc, row) => {
      acc[row.namespace] = row.value;
      return acc;
    }, {});
  }

  async upsertPreference(userId: string, tenantId: string | null, namespace: string, value: Prisma.InputJsonValue) {
    const existing = await this.prisma.userPreference.findFirst({
      where: { userId, tenantId, namespace },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.userPreference.update({
        where: { id: existing.id },
        data: { value },
      });
    }

    return this.prisma.userPreference.create({
      data: { tenantId, userId, namespace, value },
    });
  }

  private resolvePlanLimits(planCode?: string | null) {
    if (planCode === 'BASIC') {
      return { users: 25, branches: 3, employees: 100 };
    }

    if (planCode === 'PRO') {
      return { users: 250, branches: 25, employees: 2_500 };
    }

    if (planCode === 'ENTERPRISE') {
      return { users: null, branches: null, employees: null };
    }

    return { users: 0, branches: 0, employees: 0 };
  }

  async updateActiveBranch(payload: JwtPayload, branchId: string) {
    if (payload.isGlobalContext) {
      throw new ForbiddenException('Global context does not allow branch switching');
    }

    if (!payload.permissions.includes('branch.switch')) {
      throw new ForbiddenException('User does not have permission to switch branch context');
    }

    if (!payload.allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('Requested branch is outside the user scope');
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId: payload.activeTenantId ?? payload.tenantId,
      },
      select: { id: true },
    });

    if (!branch) {
      throw new ForbiddenException('Branch does not belong to the active tenant');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: authorizedUserInclude,
    });

    if (!user) {
      throw new UnauthorizedException('User does not exist');
    }

    if (payload.sessionId) {
      await this.prisma.userSession.update({
        where: { id: payload.sessionId },
        data: { activeTenantId: payload.activeTenantId ?? payload.tenantId },
      });
    }

    return this.buildAuthorizedPayload(user, {
      requestedActiveTenantId: payload.activeTenantId,
      requestedActiveBranchId: branchId,
      sessionId: payload.sessionId ?? null,
      sessionContext: {
        activeTenantId: payload.activeTenantId,
        impersonationTenantId: payload.impersonation.tenantId,
        impersonationStartedAt: payload.impersonation.startedAt
          ? new Date(payload.impersonation.startedAt)
          : null,
        impersonationReason: payload.impersonation.reason,
      },
    });
  }

  async getTenantCapabilities(tenantId: string) {
    return this.platformAccessService.getTenantCapabilities(tenantId);
  }

  loadUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: authorizedUserInclude,
    });
  }

  loadUserByEmail(email: string, tenantSlug?: string) {
    return this.prisma.user.findFirst({
      where: {
        email,
        ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
      },
      include: authorizedUserInclude,
    });
  }

  resolveSubscriptionState(subscription: { status: SubscriptionStatus; endsAt: Date | null } | null) {
    if (!subscription) {
      return SubscriptionAccessState.SUSPENDED;
    }

    switch (subscription.status) {
      case SubscriptionStatus.ACTIVE:
        return SubscriptionAccessState.ACTIVE;
      case SubscriptionStatus.TRIALING:
        return SubscriptionAccessState.TRIALING;
      case SubscriptionStatus.PAST_DUE:
        return subscription.endsAt && subscription.endsAt >= new Date()
          ? SubscriptionAccessState.GRACE_PERIOD
          : SubscriptionAccessState.PAST_DUE;
      case SubscriptionStatus.CANCELED:
      case SubscriptionStatus.EXPIRED:
      default:
        return SubscriptionAccessState.SUSPENDED;
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

  private resolveActiveTenantId(input: {
    userTenantId: string;
    roleCodes: string[];
    isSuperAdmin: boolean;
    allowedTenantIds: string[];
    requestedActiveTenantId: string | null;
    impersonationTenantId: string | null;
  }) {
    const {
      userTenantId,
      roleCodes,
      isSuperAdmin,
      allowedTenantIds,
      requestedActiveTenantId,
      impersonationTenantId,
    } = input;

    if (impersonationTenantId) {
      return impersonationTenantId;
    }

    if (isSuperAdmin) {
      return null;
    }

    if (roleCodes.includes('PLATFORM_ADMIN')) {
      if (requestedActiveTenantId && allowedTenantIds.includes(requestedActiveTenantId)) {
        return requestedActiveTenantId;
      }

      return allowedTenantIds[0] ?? null;
    }

    return userTenantId;
  }
}
