import { AccessScope } from '../common/enums/access-scope.enum';
import { JobOffersService } from './job-offers.service';

const actor = {
  sub: 'user-1', firstName: 'Laura', lastName: 'RRHH', email: 'laura@example.test',
  scope: AccessScope.TENANT, allowedBranchIds: ['branch-1'], isSuperAdmin: false,
} as any;

const application = {
  id: 'application-1', tenantId: 'tenant-1', candidateId: 'candidate-1', status: 'APPROVED',
  candidate: { id: 'candidate-1', fullName: 'Ana Pérez', email: 'ana@example.test', accountId: 'account-1' },
  vacancy: { id: 'vacancy-1', branchId: 'branch-1', title: 'Analista', tenant: { name: 'Empresa Demo' }, branch: { id: 'branch-1' } },
};

describe('JobOffersService', () => {
  it('creates version one with separate financial and managerial approvals', async () => {
    const employmentStartDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const validUntil = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const created = { id: 'offer-1', currentVersion: 1, status: 'PENDING_APPROVAL' };
    const tx = {
      jobOffer: { create: jest.fn().mockResolvedValue(created), findUniqueOrThrow: jest.fn().mockResolvedValue(created) },
      applicationTimelineEvent: { create: jest.fn() },
    };
    const prisma = {
      vacancyApplication: { findFirst: jest.fn().mockResolvedValue(application) },
      jobOffer: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn((callback: any) => callback(tx)),
    } as any;
    const service = new JobOffersService(prisma, {} as any, {} as any);

    await service.create('tenant-1', actor, application.id, {
      salaryAmount: 60000, currency: 'usd', periodicity: 'ANNUAL', benefits: ['Seguro'],
      jobTitle: 'Analista', employmentStartDate, validUntil,
    } as any);

    const data = tx.jobOffer.create.mock.calls[0][0].data;
    expect(data.status).toBe('PENDING_APPROVAL');
    expect(data.versions.create.currency).toBe('USD');
    expect(data.approvals.create.map((item: any) => item.type)).toEqual(['FINANCIAL', 'MANAGERIAL']);
    expect(tx.applicationTimelineEvent.create).toHaveBeenCalled();
  });

  it('marks the offer approved only after both approvals are approved', async () => {
    const offer = {
      id: 'offer-1', tenantId: 'tenant-1', branchId: 'branch-1', applicationId: application.id,
      status: 'PENDING_APPROVAL', currentVersion: 1, application, versions: [{ id: 'version-1', version: 1 }],
      approvals: [{ id: 'financial', version: 1, type: 'FINANCIAL', status: 'PENDING', approverId: null }, { id: 'managerial', version: 1, type: 'MANAGERIAL', status: 'APPROVED', approverId: null }],
    };
    const tx = {
      jobOfferApproval: { update: jest.fn(), findMany: jest.fn().mockResolvedValue([{ id: 'financial', status: 'APPROVED' }, { id: 'managerial', status: 'APPROVED' }]) },
      jobOffer: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...offer, status: 'APPROVED' }) },
      applicationTimelineEvent: { create: jest.fn() },
    };
    const prisma = { jobOffer: { findFirst: jest.fn().mockResolvedValue(offer) }, $transaction: jest.fn((callback: any) => callback(tx)) } as any;
    const service = new JobOffersService(prisma, {} as any, {} as any);

    await service.decideApproval('tenant-1', actor, offer.id, { type: 'FINANCIAL', approved: true } as any);

    expect(tx.jobOffer.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'APPROVED' } }));
    expect(tx.applicationTimelineEvent.create).toHaveBeenCalled();
  });

  it('starts the hiring workflow automatically after the signed version is accepted', async () => {
    const offer = {
      id: 'offer-1', tenantId: 'tenant-1', branchId: 'branch-1', applicationId: application.id,
      createdById: 'user-1', status: 'SENT', currentVersion: 1, application,
      versions: [{ id: 'version-1', version: 1 }], approvals: [], conversionWorkflowId: null,
    };
    const version = { id: 'version-1', version: 1, jobTitle: 'Analista', employmentStartDate: new Date('2026-09-01T12:00:00.000Z'), offer };
    const tx = { jobOffer: { update: jest.fn() }, applicationTimelineEvent: { create: jest.fn() } };
    const prisma = {
      jobOfferVersion: { findUnique: jest.fn().mockResolvedValue(version) },
      jobOffer: { update: jest.fn() },
      $transaction: jest.fn((callback: any) => callback(tx)),
    } as any;
    const workflows = { createHiringWorkflow: jest.fn().mockResolvedValue({ id: 'workflow-1' }) } as any;
    const service = new JobOffersService(prisma, {} as any, workflows);

    await service.completeSignedOffer(version.id);

    expect(workflows.createHiringWorkflow).toHaveBeenCalledWith('tenant-1', expect.any(Object), expect.objectContaining({ applicationId: application.id, jobTitle: 'Analista' }));
    expect(prisma.jobOffer.update).toHaveBeenCalledWith(expect.objectContaining({ data: { conversionWorkflowId: 'workflow-1', conversionError: null } }));
  });
});
