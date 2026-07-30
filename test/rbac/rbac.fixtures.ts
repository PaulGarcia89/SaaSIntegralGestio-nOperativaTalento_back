import { ModuleCode } from '@prisma/client';
import { SubscriptionAccessState } from '../../src/common/auth/subscription-access-state.enum';
import { AccessScope } from '../../src/common/enums/access-scope.enum';
import { RoleScope } from '../../src/common/enums/role-scope.enum';
import { JwtPayload } from '../../src/common/interfaces/jwt-payload.interface';

export const rbacFixtures = {
  tenants: {
    a: { id: 'test-tenant-a', slug: 'tenant-a', name: 'Tenant A', status: 'ACTIVE' as const },
    b: { id: 'test-tenant-b', slug: 'tenant-b', name: 'Tenant B', status: 'ACTIVE' as const },
  },
  branches: {
    a1: { id: 'test-branch-a1', tenantId: 'test-tenant-a', name: 'A Norte', location: 'Test' },
    a2: { id: 'test-branch-a2', tenantId: 'test-tenant-a', name: 'A Sur', location: 'Test' },
    b1: { id: 'test-branch-b1', tenantId: 'test-tenant-b', name: 'B Centro', location: 'Test' },
  },
  vacancies: {
    a: { id: 'test-vacancy-a', tenantId: 'test-tenant-a', branchId: 'test-branch-a1' },
    b: { id: 'test-vacancy-b', tenantId: 'test-tenant-b', branchId: 'test-branch-b1' },
  },
  candidates: {
    a: { id: 'test-candidate-a', tenantId: 'test-tenant-a', accountId: 'candidate-account-a' },
    b: { id: 'test-candidate-b', tenantId: 'test-tenant-b', accountId: 'candidate-account-b' },
  },
  interviews: {
    assigned: { id: 'test-interview-assigned', tenantId: 'test-tenant-a', interviewerId: 'test-interviewer' },
    unassigned: { id: 'test-interview-unassigned', tenantId: 'test-tenant-a', interviewerId: null },
  },
  courses: {
    a: { id: 'test-course-a', tenantId: 'test-tenant-a' },
    b: { id: 'test-course-b', tenantId: 'test-tenant-b' },
  },
  onboarding: {
    a: { id: 'test-onboarding-a', tenantId: 'test-tenant-a', employeeId: 'test-employee-a' },
    b: { id: 'test-onboarding-b', tenantId: 'test-tenant-b', employeeId: 'test-employee-b' },
  },
  inventory: {
    a: { id: 'test-inventory-a', tenantId: 'test-tenant-a', branchId: 'test-branch-a1' },
    b: { id: 'test-inventory-b', tenantId: 'test-tenant-b', branchId: 'test-branch-b1' },
  },
  assets: {
    own: { id: 'test-asset-own', tenantId: 'test-tenant-a', assignedUserId: 'test-employee-a' },
    foreign: { id: 'test-asset-foreign', tenantId: 'test-tenant-a', assignedUserId: 'test-employee-other' },
    tenantB: { id: 'test-asset-b', tenantId: 'test-tenant-b', assignedUserId: 'test-employee-b' },
  },
  subscriptions: {
    active: { tenantId: 'test-tenant-a', state: SubscriptionAccessState.ACTIVE },
    expired: { tenantId: 'test-tenant-b', state: SubscriptionAccessState.PAST_DUE },
  },
  modules: {
    enabled: [ModuleCode.ATS, ModuleCode.ONBOARDING, ModuleCode.TRAINING],
    disabled: [ModuleCode.INVENTORY],
  },
} as const;

const roleDefinitions = {
  SUPERADMIN: { scope: AccessScope.GLOBAL, roleScope: RoleScope.PLATFORM_ADMIN },
  PLATFORM_ADMIN: { scope: AccessScope.TENANT, roleScope: RoleScope.PLATFORM_ADMIN },
  TENANT_ADMIN: { scope: AccessScope.TENANT, roleScope: RoleScope.TENANT_ADMIN },
  HR_MANAGER: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_ADMIN },
  RECRUITER: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_USER },
  INTERVIEWER: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_USER },
  INSTRUCTOR: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_USER },
  SUPERVISOR: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_ADMIN },
  INVENTORY_MANAGER: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_USER },
  BRANCH_USER: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_USER },
  CANDIDATE: { scope: AccessScope.BRANCH, roleScope: RoleScope.BRANCH_USER },
} as const;

export type TestRole = keyof typeof roleDefinitions;

export function actorFixture(
  role: TestRole,
  overrides: Partial<JwtPayload> = {},
): JwtPayload {
  const definition = roleDefinitions[role];
  const isSuperAdmin = role === 'SUPERADMIN';
  return {
    sub: `test-user-${role.toLowerCase()}`,
    userId: `test-user-${role.toLowerCase()}`,
    sessionId: `test-session-${role.toLowerCase()}`,
    tenantId: rbacFixtures.tenants.a.id,
    allowedTenantIds: isSuperAdmin
      ? [rbacFixtures.tenants.a.id, rbacFixtures.tenants.b.id]
      : [rbacFixtures.tenants.a.id],
    activeTenantId: isSuperAdmin ? null : rbacFixtures.tenants.a.id,
    tenantSlug: rbacFixtures.tenants.a.slug,
    tenantName: rbacFixtures.tenants.a.name,
    email: `${role.toLowerCase()}@example.test`,
    firstName: 'Test',
    lastName: role,
    role,
    scope: definition.scope,
    isSuperAdmin,
    roleScope: definition.roleScope,
    allowedBranchIds: isSuperAdmin ? [] : [rbacFixtures.branches.a1.id],
    activeBranchId: isSuperAdmin ? null : rbacFixtures.branches.a1.id,
    roles: [role],
    permissions: [],
    enabledModules: [...rbacFixtures.modules.enabled],
    isGlobalContext: isSuperAdmin,
    impersonation: { active: false, tenantId: null, startedAt: null, reason: null },
    subscriptionStatus: SubscriptionAccessState.ACTIVE,
    subscriptionGraceEndsAt: null,
    ...overrides,
  };
}

export const actorsByRole = Object.fromEntries(
  (Object.keys(roleDefinitions) as TestRole[]).map((role) => [role, actorFixture(role)]),
) as Record<TestRole, JwtPayload>;
