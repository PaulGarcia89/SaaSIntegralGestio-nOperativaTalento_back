import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessScope } from '../../src/common/enums/access-scope.enum';
import { RoleScope } from '../../src/common/enums/role-scope.enum';
import { SubscriptionAccessState } from '../../src/common/auth/subscription-access-state.enum';
import { JwtPayload } from '../../src/common/interfaces/jwt-payload.interface';

/**
 * Actor autenticado por defecto: usuario de sucursal, sin privilegios especiales.
 * Cada prueba parte de aqui y sobreescribe solo lo que quiere ejercitar.
 */
export function actor(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    userId: 'user-1',
    sessionId: 'session-1',
    tenantId: 'tenant-a',
    allowedTenantIds: ['tenant-a'],
    activeTenantId: 'tenant-a',
    tenantSlug: 'tenant-a',
    tenantName: 'Tenant A',
    email: 'user@example.test',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'USER',
    scope: AccessScope.BRANCH,
    isSuperAdmin: false,
    roleScope: RoleScope.BRANCH_USER,
    allowedBranchIds: ['branch-1'],
    activeBranchId: 'branch-1',
    roles: ['USER'],
    permissions: [],
    enabledModules: [],
    isGlobalContext: false,
    impersonation: { active: false, tenantId: null, startedAt: null, reason: null },
    subscriptionStatus: SubscriptionAccessState.ACTIVE,
    subscriptionGraceEndsAt: null,
    ...overrides,
  };
}

export function superAdmin(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return actor({
    sub: 'root-1',
    userId: 'root-1',
    role: 'SUPERADMIN',
    roles: ['SUPERADMIN'],
    scope: AccessScope.GLOBAL,
    roleScope: RoleScope.PLATFORM_ADMIN,
    isSuperAdmin: true,
    isGlobalContext: true,
    activeTenantId: null,
    allowedTenantIds: [],
    ...overrides,
  });
}

export function platformAdmin(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return actor({
    sub: 'platform-1',
    userId: 'platform-1',
    role: 'PLATFORM_ADMIN',
    roles: ['PLATFORM_ADMIN'],
    scope: AccessScope.TENANT,
    roleScope: RoleScope.PLATFORM_ADMIN,
    allowedTenantIds: ['tenant-a', 'tenant-b'],
    activeTenantId: 'tenant-a',
    ...overrides,
  });
}

export function tenantAdmin(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return actor({
    role: 'TENANT_ADMIN',
    roles: ['TENANT_ADMIN'],
    scope: AccessScope.TENANT,
    roleScope: RoleScope.TENANT_ADMIN,
    ...overrides,
  });
}

export function branchAdmin(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return actor({
    role: 'BRANCH_ADMIN',
    roles: ['BRANCH_ADMIN'],
    roleScope: RoleScope.BRANCH_ADMIN,
    ...overrides,
  });
}

export interface FakeRequest extends Record<string, unknown> {
  user?: JwtPayload;
  headers: Record<string, string | string[] | undefined>;
  method: string;
  tenant?: { id: string; slug: string; name: string; status: string };
  branch?: { id: string; tenantId: string; name: string; location: string };
  branchScope?: { allowedBranchIds: string[]; activeBranchId: string | null };
  subscription?: {
    id: string;
    planId: string;
    status: string;
    modules: unknown[];
    accessStatus?: string;
    graceEndsAt?: string | null;
  };
  accessContext?: {
    actorScope: AccessScope;
    isGlobalRoute: boolean;
    resolvedTenantId: string | null;
  };
}

export function request(overrides: Partial<FakeRequest> = {}): FakeRequest {
  return {
    method: 'GET',
    headers: {},
    ...overrides,
  };
}

/** `Reflector` falso: devuelve el valor asociado a cada clave de metadatos. */
export function reflectorWith(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
    get: (key: string) => metadata[key],
    getAll: (key: string) => metadata[key],
    getAllAndMerge: (key: string) => metadata[key],
  } as unknown as Reflector;
}

export function executionContext(req: FakeRequest): ExecutionContext {
  return {
    getType: () => 'http',
    getHandler: () => function handler() { return undefined; },
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as unknown as ExecutionContext;
}
