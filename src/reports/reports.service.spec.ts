import {
  ApplicationStatus,
  TrainingProgressStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { RoleScope } from '../common/enums/role-scope.enum';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const prisma = {
    vacancyApplication: { findMany: jest.fn() },
    vacancy: { count: jest.fn() },
    onboardingFlow: { findMany: jest.fn() },
    onboardingTask: { findMany: jest.fn() },
    trainingAssignment: { findMany: jest.fn() },
    inventoryAsset: { findMany: jest.fn() },
  };
  const service = new ReportsService(prisma as never);
  const actor = {
    sub: 'user-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    activeTenantId: 'tenant-1',
    allowedTenantIds: ['tenant-1'],
    tenantSlug: 'tenant',
    tenantName: 'Tenant',
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'ADMIN_EMPRESA',
    scope: AccessScope.TENANT,
    isSuperAdmin: false,
    roleScope: RoleScope.TENANT_ADMIN,
    allowedBranchIds: [],
    activeBranchId: null,
    roles: ['ADMIN_EMPRESA'],
    permissions: ['metrics.read', 'applications.export'],
    enabledModules: [],
    isGlobalContext: false,
    impersonation: { active: false, tenantId: null, startedAt: null, reason: null },
    subscriptionStatus: 'ACTIVE',
    subscriptionGraceEndsAt: null,
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vacancyApplication.findMany.mockResolvedValue([
      {
        status: ApplicationStatus.HIRED,
        appliedAt: new Date('2026-07-01T00:00:00Z'),
        reviewedAt: new Date('2026-07-02T00:00:00Z'),
        contactedAt: new Date('2026-07-03T00:00:00Z'),
        interviewScheduledAt: new Date('2026-07-04T00:00:00Z'),
        interviewCompletedAt: new Date('2026-07-05T00:00:00Z'),
        updatedAt: new Date('2026-07-06T00:00:00Z'),
      },
    ]);
    prisma.vacancy.count.mockResolvedValue(2);
    prisma.onboardingFlow.findMany.mockResolvedValue([
      { status: WorkflowTaskStatus.COMPLETED, startedAt: new Date(), completedAt: new Date() },
    ]);
    prisma.onboardingTask.findMany.mockResolvedValue([
      { status: WorkflowTaskStatus.COMPLETED, progressPercent: 100, dueDate: null, blockingReason: null },
    ]);
    prisma.trainingAssignment.findMany.mockResolvedValue([
      { status: TrainingProgressStatus.COMPLETED, progressPercent: 100, dueAt: null, completedAt: new Date() },
    ]);
    prisma.inventoryAsset.findMany.mockResolvedValue([{ status: 'ASSIGNED' }]);
  });

  it('calculates all operational domains from persisted records', async () => {
    const result = await service.overview(actor, {
      from: '2026-07-01',
      to: '2026-07-31',
      scope: 'tenant',
    });

    expect(result.ats.totals).toMatchObject({
      applications: 1,
      activeVacancies: 2,
      hired: 1,
      conversionRate: 100,
      averageTimeToHireHours: 120,
    });
    expect(result.onboarding.completionRate).toBe(100);
    expect(result.training.complianceRate).toBe(100);
    expect(result.inventory.assigned).toBe(1);
  });

  it('exports a CSV generated from the same filtered overview', async () => {
    const result = await service.exportCsv(actor, {
      from: '2026-07-01',
      to: '2026-07-31',
      scope: 'tenant',
    });

    expect(result.mimeType).toContain('text/csv');
    expect(result.content).toContain('"ATS","Postulaciones","1"');
    expect(result.filename).toContain('2026-07-01');
  });
});
