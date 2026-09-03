import assert from 'node:assert/strict';
import { AccessScope } from '../src/common/enums/access-scope.enum';
import { BranchesService } from '../src/branches/branches.service';
import { VacanciesService } from '../src/vacancies/vacancies.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const branchActor = {
  sub: 'actor-1',
  scope: AccessScope.BRANCH,
  isSuperAdmin: false,
  allowedBranchIds: ['branch-a'],
  activeTenantId: 'tenant-active',
  tenantId: 'tenant-origin',
} as any;

async function testBranchReadScope() {
  let capturedWhere: any;
  const prisma = {
    branch: {
      findMany: ({ where }: any) => {
        capturedWhere = where;
        return Promise.resolve([]);
      },
      count: () => Promise.resolve(0),
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  } as any;

  await new BranchesService(prisma).findAll('tenant-active', branchActor, {} as any);
  assert.deepEqual(capturedWhere.id, { in: ['branch-a'] });
  assert.equal(capturedWhere.tenantId, 'tenant-active');
}

async function testVacancyWriteScope() {
  const prisma = {
    branch: {
      findFirst: () => Promise.resolve({ id: 'branch-b' }),
    },
  } as any;

  await assert.rejects(
    () =>
      new VacanciesService(prisma).create('tenant-active', branchActor, {
        branchId: 'branch-b',
        title: 'Blocked',
      } as any),
    /outside the actor access scope/,
  );
}

async function testNotificationUsesActiveTenant() {
  let capturedWhere: any;
  const prisma = {
    notification: {
      findMany: ({ where }: any) => {
        capturedWhere = where;
        return Promise.resolve([]);
      },
      count: () => Promise.resolve(0),
    },
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
  } as any;

  await new NotificationsService(prisma).findAll(branchActor, {} as any);
  assert.equal(capturedWhere.tenantId, 'tenant-active');
  assert.notEqual(capturedWhere.tenantId, 'tenant-origin');
}

async function main() {
  await testBranchReadScope();
  await testVacancyWriteScope();
  await testNotificationUsesActiveTenant();
  console.log('Authorization boundary tests passed');
}

void main();
