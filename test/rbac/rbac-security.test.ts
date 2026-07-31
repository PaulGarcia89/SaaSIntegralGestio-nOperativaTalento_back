import assert from 'node:assert/strict';
import { HttpException } from '@nestjs/common';
import { ModuleCode, SubscriptionStatus } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from '../../src/access-control/access-control.service';
import { SubscriptionAccessState } from '../../src/common/auth/subscription-access-state.enum';
import {
  ACCESS_MODULE_KEY,
  REQUIRED_PERMISSIONS_KEY,
  TENANT_HEADER,
} from '../../src/common/constants/auth.constants';
import { BranchAccessGuard } from '../../src/common/guards/branch-access.guard';
import { ModuleAccessGuard } from '../../src/common/guards/module-access.guard';
import { PermissionGuard } from '../../src/common/guards/permission.guard';
import { SubscriptionGuard } from '../../src/common/guards/subscription.guard';
import { TenantGuard } from '../../src/common/guards/tenant.guard';
import { DomainEventSecurityService } from '../../src/domain-events/domain-event-security.service';
import { JwtStrategy } from '../../src/auth/strategies/jwt.strategy';
import { ApplicationsService } from '../../src/applications/applications.service';
import { VacanciesService } from '../../src/vacancies/vacancies.service';
import { EmployeesService } from '../../src/employees/employees.service';
import { BranchesService } from '../../src/branches/branches.service';
import { RolesService } from '../../src/roles/roles.service';
import { deriveAccessScope, deriveRoleScope } from '../../src/common/auth/role-scope.util';
import { AccessScope } from '../../src/common/enums/access-scope.enum';
import { RoleScope } from '../../src/common/enums/role-scope.enum';
import { RecruitmentService } from '../../src/recruitment/recruitment.service';
import { WorkflowsService } from '../../src/workflows/workflows.service';
import { actorFixture, actorsByRole, rbacFixtures } from './rbac.fixtures';

type AsyncTest = { name: string; run: () => void | Promise<void> };
const tests: AsyncTest[] = [];
const test = (name: string, run: AsyncTest['run']) => tests.push({ name, run });

function context(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as any;
}

function reflector(metadata: Record<string, unknown> = {}) {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

async function expectStatus(action: () => unknown | Promise<unknown>, status: number) {
  await assert.rejects(
    async () => action(),
    (error: unknown) => error instanceof HttpException && error.getStatus() === status,
  );
}

test('fixtures include every required role and synthetic resource family', () => {
  assert.equal(Object.keys(actorsByRole).length, 11);
  assert.equal(rbacFixtures.branches.a1.tenantId, rbacFixtures.tenants.a.id);
  assert.equal(rbacFixtures.branches.a2.tenantId, rbacFixtures.tenants.a.id);
  assert.equal(rbacFixtures.branches.b1.tenantId, rbacFixtures.tenants.b.id);
  assert.notEqual(rbacFixtures.candidates.a.tenantId, rbacFixtures.candidates.b.tenantId);
  assert.equal(rbacFixtures.interviews.unassigned.interviewerId, null);
  assert.equal(rbacFixtures.subscriptions.expired.state, SubscriptionAccessState.PAST_DUE);
});

test('business branch administrators resolve to branch scope consistently', () => {
  for (const role of ['HR_MANAGER', 'SUPERVISOR']) {
    const roleScope = deriveRoleScope([role], false);
    assert.equal(roleScope, RoleScope.BRANCH_ADMIN);
    assert.equal(deriveAccessScope(roleScope, false), AccessScope.BRANCH);
  }
});

test('401 when tenant guard has no authenticated actor', async () => {
  const guard = new TenantGuard({} as any, reflector(), new AccessControlService());
  await expectStatus(() => guard.canActivate(context({ headers: {} })), 401);
});

test('403 when a granular permission is absent', async () => {
  const guard = new PermissionGuard(
    reflector({ [REQUIRED_PERMISSIONS_KEY]: ['vacancies.update'] }),
  );
  await expectStatus(
    () => guard.canActivate(context({ user: actorFixture('RECRUITER', { permissions: ['vacancies.read'] }) })),
    403,
  );
});

test('allows an operation only when its granular permission exists', () => {
  const guard = new PermissionGuard(
    reflector({ [REQUIRED_PERMISSIONS_KEY]: ['vacancies.update'] }),
  );
  assert.equal(
    guard.canActivate(
      context({ user: actorFixture('RECRUITER', { permissions: ['vacancies.update'] }) }),
    ),
    true,
  );
});

test('rejects a manually supplied tenant B for an actor in tenant A', async () => {
  const guard = new TenantGuard({} as any, reflector(), new AccessControlService());
  const request = {
    user: actorFixture('TENANT_ADMIN'),
    headers: { [TENANT_HEADER]: rbacFixtures.tenants.b.id },
  };
  await expectStatus(() => guard.canActivate(context(request)), 403);
});

test('returns 404 without leaking data when the resolved tenant does not exist', async () => {
  const guard = new TenantGuard(
    { tenant: { findUnique: async () => null } } as any,
    reflector(),
    new AccessControlService(),
  );
  const request = { user: actorFixture('TENANT_ADMIN'), headers: {} };
  await expectStatus(() => guard.canActivate(context(request)), 404);
});

test('blocks an unassigned branch and a branch from another tenant', async () => {
  const actor = actorFixture('RECRUITER', { activeBranchId: rbacFixtures.branches.a2.id });
  const guard = new BranchAccessGuard({} as any);
  await expectStatus(
    () =>
      guard.canActivate(
        context({
          user: actor,
          tenant: rbacFixtures.tenants.a,
          headers: {},
        }),
      ),
    403,
  );

  const tenantAdmin = actorFixture('TENANT_ADMIN', {
    activeBranchId: rbacFixtures.branches.b1.id,
    allowedBranchIds: [rbacFixtures.branches.b1.id],
  });
  const crossTenantGuard = new BranchAccessGuard({
    branch: { findFirst: async () => null },
  } as any);
  await expectStatus(
    () =>
      crossTenantGuard.canActivate(
        context({ user: tenantAdmin, tenant: rbacFixtures.tenants.a, headers: {} }),
      ),
    404,
  );
});

test('blocks a module that is not contracted', async () => {
  const guard = new ModuleAccessGuard(
    reflector({ [ACCESS_MODULE_KEY]: ModuleCode.INVENTORY }),
  );
  await expectStatus(
    () =>
      guard.canActivate(
        context({
          user: actorFixture('INVENTORY_MANAGER', {
            enabledModules: [ModuleCode.ATS],
          }),
        }),
      ),
    403,
  );
});

test('requires every module declared by a composite business flow', async () => {
  const guard = new ModuleAccessGuard(
    reflector({ [ACCESS_MODULE_KEY]: [ModuleCode.ATS, ModuleCode.ONBOARDING] }),
  );
  await expectStatus(
    () =>
      guard.canActivate(
        context({
          user: actorFixture('HR_MANAGER', {
            enabledModules: [ModuleCode.ATS],
          }),
        }),
      ),
    403,
  );
});

test('blocks an expired subscription before controller execution', async () => {
  const subscription = {
    id: 'test-subscription-expired',
    tenantId: rbacFixtures.tenants.a.id,
    planId: 'test-plan',
    status: SubscriptionStatus.EXPIRED,
    startsAt: new Date('2025-01-01'),
    endsAt: new Date('2025-12-31'),
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    plan: { planModules: [] },
  };
  const guard = new SubscriptionGuard(
    { subscription: { findUnique: async () => subscription } } as any,
    {
      resolveSubscriptionState: () => SubscriptionAccessState.PAST_DUE,
      getTenantCapabilities: async () => ({ enabledModules: [] }),
    } as any,
    reflector(),
  );
  await expectStatus(
    () =>
      guard.canActivate(
        context({
          user: actorFixture('TENANT_ADMIN'),
          tenant: rbacFixtures.tenants.a,
          headers: {},
        }),
      ),
    403,
  );
});

test('/me/context permissions are refreshed from persistence on each access token validation', async () => {
  const calls: unknown[] = [];
  const authContext = {
    hydrateFromJwt: async (payload: unknown) => {
      calls.push(payload);
      return actorFixture('RECRUITER', { permissions: ['vacancies.update'] });
    },
  };
  const strategy = new JwtStrategy(
    { getOrThrow: () => 'test-secret-with-sufficient-length' } as any,
    authContext as any,
  );
  const result = await strategy.validate({
    sub: 'test-user-recruiter',
    sessionId: 'test-session',
    tokenType: 'access',
  } as any);
  assert.ok(result);
  assert.deepEqual(result.permissions, ['vacancies.update']);
  assert.equal(calls.length, 1);
});

test('revoked or non-access token cannot retain stale authorization', async () => {
  let hydrated = false;
  const strategy = new JwtStrategy(
    { getOrThrow: () => 'test-secret-with-sufficient-length' } as any,
    { hydrateFromJwt: async () => { hydrated = true; } } as any,
  );
  assert.equal(
    await strategy.validate({ sub: 'test-user', sessionId: 'test-session', tokenType: 'refresh' } as any),
    null,
  );
  assert.equal(hydrated, false);
});

test('a job for tenant A cannot process a persisted event belonging to tenant B', async () => {
  const security = new DomainEventSecurityService({ get: () => 'test-domain-secret' } as any);
  await expectStatus(
    () =>
      security.validateQueuedJob(
        {
          outboxEventId: 'event-1',
          tenantId: rbacFixtures.tenants.a.id,
          branchId: rbacFixtures.branches.a1.id,
          eventName: 'candidate.hired',
          eventVersion: 1,
          correlationId: 'correlation-1',
        } as any,
        {
          id: 'event-1',
          tenantId: rbacFixtures.tenants.b.id,
          branchId: rbacFixtures.branches.b1.id,
          eventName: 'candidate.hired',
          eventVersion: 1,
          occurredAt: new Date(),
          correlationId: 'correlation-1',
          causationId: null,
          idempotencyKey: 'idempotency-1',
        } as any,
      ),
    403,
  );
});

test('cross-tenant read/update/delete/export/file operations use the same deny boundary', async () => {
  const access = new AccessControlService();
  const actor = actorFixture('TENANT_ADMIN');
  for (const operation of ['read', 'update', 'delete', 'export', 'file']) {
    await expectStatus(
      () =>
        Promise.resolve(
          access.assertTenantAccess(
            actor,
            rbacFixtures.tenants.b.id,
            `Blocked cross-tenant ${operation}`,
          ),
        ),
      403,
    );
  }
});

test('vacancy reads bind resource id, tenant id and assigned branch in one query', async () => {
  let capturedWhere: any;
  const service = new VacanciesService({
    vacancy: {
      findFirst: async ({ where }: any) => {
        capturedWhere = where;
        return null;
      },
    },
  } as any);
  await expectStatus(
    () =>
      service.findOne(
        rbacFixtures.vacancies.b.id,
        rbacFixtures.tenants.a.id,
        actorFixture('RECRUITER'),
      ),
    404,
  );
  assert.equal(capturedWhere.id, rbacFixtures.vacancies.b.id);
  assert.equal(capturedWhere.tenantId, rbacFixtures.tenants.a.id);
  assert.deepEqual(capturedWhere.branchId, { in: [rbacFixtures.branches.a1.id] });
});

test('recruitment vacancy setup is restricted to assigned branches', async () => {
  let capturedWhere: any;
  const service = new RecruitmentService({
    vacancy: {
      findFirst: async ({ where }: any) => {
        capturedWhere = where;
        return null;
      },
    },
  } as any);

  await expectStatus(
    () =>
      service.getVacancySetup(
        rbacFixtures.tenants.a.id,
        actorFixture('HR_MANAGER'),
        rbacFixtures.vacancies.a.id,
      ),
    404,
  );
  assert.equal(capturedWhere.id, rbacFixtures.vacancies.a.id);
  assert.equal(capturedWhere.tenantId, rbacFixtures.tenants.a.id);
  assert.deepEqual(capturedWhere.branchId, {
    in: [rbacFixtures.branches.a1.id],
  });
});

test('interview scheduling rejects applications outside the actor branch scope', async () => {
  let interviewerQueries = 0;
  const service = new RecruitmentService({
    vacancyApplication: {
      findFirst: async () => ({
        id: 'application-a2',
        vacancyId: 'vacancy-a2',
        vacancy: { branchId: rbacFixtures.branches.a2.id },
      }),
    },
    user: {
      findFirst: async () => {
        interviewerQueries += 1;
        return { id: 'interviewer-a2' };
      },
    },
  } as any);

  await expectStatus(
    () =>
      service.scheduleInterview(
        rbacFixtures.tenants.a.id,
        actorFixture('HR_MANAGER'),
        {
          applicationId: '00000000-0000-4000-8000-000000000001',
          interviewerUserId: '00000000-0000-4000-8000-000000000002',
          title: 'Interview',
          type: 'VIRTUAL',
          timezone: 'America/New_York',
          startsAt: '2026-08-01T14:00:00.000Z',
          endsAt: '2026-08-01T15:00:00.000Z',
        } as any,
      ),
    403,
  );
  assert.equal(interviewerQueries, 0);
});

test('candidate conversion cannot move an application to another branch', async () => {
  let employeeWrites = 0;
  const tx = {
    branch: {
      findFirst: async () => rbacFixtures.branches.a1,
    },
    vacancyApplication: {
      findFirst: async () => ({
        id: 'application-approved',
        tenantId: rbacFixtures.tenants.a.id,
        status: 'APPROVED',
        vacancyId: 'vacancy-a2',
        candidate: {
          id: 'candidate-a',
          fullName: 'Candidate A',
          email: 'candidate@example.test',
        },
        vacancy: {
          id: 'vacancy-a2',
          branchId: rbacFixtures.branches.a2.id,
        },
      }),
    },
    employee: {
      create: async () => {
        employeeWrites += 1;
      },
    },
  };
  const service = new WorkflowsService({
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
  } as any);

  await expectStatus(
    () =>
      service.createHiringWorkflow(
        rbacFixtures.tenants.a.id,
        actorFixture('HR_MANAGER'),
        {
          applicationId: '00000000-0000-4000-8000-000000000003',
          branchId: rbacFixtures.branches.a1.id,
          jobTitle: 'Analyst',
        },
      ),
    400,
  );
  assert.equal(employeeWrites, 0);
});

test('branch update binds id, tenant and actor branch assignment before write', async () => {
  let capturedReadWhere: any;
  let writes = 0;
  const service = new BranchesService({
    branch: {
      findFirst: async ({ where }: any) => {
        capturedReadWhere = where;
        return null;
      },
      update: async () => {
        writes += 1;
      },
    },
  } as any);

  await expectStatus(
    () =>
      service.update(
        rbacFixtures.branches.a2.id,
        rbacFixtures.tenants.a.id,
        actorFixture('HR_MANAGER'),
        { name: 'Blocked' },
      ),
    404,
  );

  assert.equal(capturedReadWhere.id, rbacFixtures.branches.a2.id);
  assert.equal(capturedReadWhere.tenantId, rbacFixtures.tenants.a.id);
  assert.deepEqual(capturedReadWhere.AND, [
    { id: { in: [rbacFixtures.branches.a1.id] } },
  ]);
  assert.equal(writes, 0);
});

test('tenant role administrators cannot grant permissions they do not own', async () => {
  const service = new RolesService(
    {
      permission: {
        count: async () => 1,
        findMany: async () => [{ code: 'subscriptions.delete' }],
      },
    } as any,
    new AccessControlService(),
  );
  const actor = actorFixture('TENANT_ADMIN', {
    permissions: ['roles.create'],
  });

  await expectStatus(
    () =>
      service.create(
        {
          code: 'CUSTOM_OPERATIONS',
          name: 'Custom operations',
          permissionIds: ['permission-subscriptions-delete'],
        },
        actor,
        rbacFixtures.tenants.a.id,
      ),
    403,
  );
});

test('candidate portal queries only applications owned by the authenticated candidate account', async () => {
  let capturedWhere: any;
  const service = new ApplicationsService({
    vacancyApplication: {
      findMany: async ({ where }: any) => {
        capturedWhere = where;
        return [];
      },
    },
  } as any);
  await service.listForCandidate(rbacFixtures.candidates.a.accountId);
  assert.deepEqual(capturedWhere, {
    candidate: { accountId: rbacFixtures.candidates.a.accountId },
  });
});

test('application update preflight binds tenant and branch before write', async () => {
  let capturedWhere: any;
  let writes = 0;
  const service = new ApplicationsService({
    vacancyApplication: {
      findFirst: async ({ where }: any) => {
        capturedWhere = where;
        return null;
      },
      update: async () => {
        writes += 1;
      },
    },
  } as any);
  await expectStatus(
    () =>
      service.updateStatus(
        'test-application-b',
        actorFixture('RECRUITER'),
        rbacFixtures.tenants.a.id,
        { status: 'REVIEWING' } as any,
      ),
    404,
  );
  assert.equal(capturedWhere.tenantId, rbacFixtures.tenants.a.id);
  assert.deepEqual(capturedWhere.vacancy.branchId, {
    in: [rbacFixtures.branches.a1.id],
  });
  assert.equal(writes, 0);
});

test('plain employees are owner-scoped even inside an assigned branch', async () => {
  let capturedWhere: any;
  const service = new EmployeesService({
    employee: {
      findFirst: async ({ where }: any) => {
        capturedWhere = where;
        return null;
      },
    },
  } as any);
  const employeeActor = actorFixture('BRANCH_USER', {
    email: 'employee.owner@example.test',
  });
  await expectStatus(
    () => service.findOne('coworker-id', employeeActor, rbacFixtures.tenants.a.id),
    404,
  );
  assert.equal(capturedWhere.email, employeeActor.email);
  assert.equal(capturedWhere.tenantId, rbacFixtures.tenants.a.id);
});

test('interviewer reads include assignment, tenant and branch constraints', async () => {
  let capturedWhere: any;
  const service = new ApplicationsService({
    vacancyApplication: {
      findMany: ({ where }: any) => {
        capturedWhere = where;
        return Promise.resolve([]);
      },
      count: () => Promise.resolve(0),
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  } as any);
  const interviewer = actorFixture('INTERVIEWER');
  await service.listForTenant(interviewer, rbacFixtures.tenants.a.id, {} as any);
  assert.equal(capturedWhere.tenantId, rbacFixtures.tenants.a.id);
  assert.equal(capturedWhere.interviewerUserId, interviewer.sub);
  assert.deepEqual(capturedWhere.vacancy.branchId, {
    in: [rbacFixtures.branches.a1.id],
  });
});

test('bulk application changes are all-or-nothing across tenant boundaries', async () => {
  let writes = 0;
  const service = new ApplicationsService({
    vacancyApplication: {
      findMany: async () => [{ id: 'application-a' }],
      updateMany: async () => {
        writes += 1;
        return { count: 2 };
      },
    },
  } as any);
  await expectStatus(
    () =>
      service.bulkUpdateStatus(actorFixture('RECRUITER'), rbacFixtures.tenants.a.id, {
        ids: ['application-a', 'application-b'],
        status: 'REVIEWING',
      } as any),
    404,
  );
  assert.equal(writes, 0);
});

test('an application cannot be marked hired without creating its employee workflow', async () => {
  let reads = 0;
  let writes = 0;
  const service = new ApplicationsService({
    vacancyApplication: {
      findFirst: async () => {
        reads += 1;
        return { id: 'application-approved' };
      },
      update: async () => {
        writes += 1;
      },
    },
  } as any);

  await expectStatus(
    () =>
      service.updateStatus(
        'application-approved',
        actorFixture('HR_MANAGER'),
        rbacFixtures.tenants.a.id,
        { status: 'HIRED' } as any,
      ),
    400,
  );
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

async function main() {
  let failed = 0;
  for (const entry of tests) {
    try {
      await entry.run();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error);
    }
  }
  console.log(`\nRBAC security: ${tests.length - failed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

void main();
