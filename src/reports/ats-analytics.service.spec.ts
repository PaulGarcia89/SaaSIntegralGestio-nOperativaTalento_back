import { ApplicationStatus } from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { RoleScope } from '../common/enums/role-scope.enum';
import { AtsAnalyticsService } from './ats-analytics.service';

describe('AtsAnalyticsService', () => {
  const prisma = {
    branch: { findFirst: jest.fn() },
    vacancy: { findFirst: jest.fn(), findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    vacancyApplication: { findMany: jest.fn() },
    applicationInterview: { findMany: jest.fn() },
    jobOffer: { findMany: jest.fn() },
  };
  const service = new AtsAnalyticsService(prisma as never);
  const actor = {
    sub: 'user-1', userId: 'user-1', tenantId: 'tenant-1', activeTenantId: 'tenant-1',
    allowedTenantIds: ['tenant-1'], tenantSlug: 'empresa', tenantName: 'Empresa',
    email: 'rrhh@example.com', firstName: 'Ana', lastName: 'RRHH', role: 'HR_MANAGER',
    scope: AccessScope.TENANT, isSuperAdmin: false, roleScope: RoleScope.TENANT_ADMIN,
    allowedBranchIds: [], activeBranchId: null, roles: ['HR_MANAGER'], permissions: ['metrics.read'],
    enabledModules: [], isGlobalContext: false,
    impersonation: { active: false, tenantId: null, startedAt: null, reason: null },
    subscriptionStatus: 'ACTIVE', subscriptionGraceEndsAt: null,
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.vacancy.findMany.mockResolvedValue([
      { id: 'vacancy-1', title: 'Analista', status: 'OPEN', openings: 2, createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-07-31T00:00:00Z') },
    ]);
    prisma.applicationInterview.findMany.mockResolvedValue([
      { status: 'COMPLETED', completedAt: new Date('2026-07-15T00:00:00Z'), createdAt: new Date('2026-07-05T00:00:00Z'), startsAt: new Date('2026-08-07T00:00:00Z'), endsAt: new Date('2026-08-07T01:00:00Z'), scorecards: [{ overallRating: 4.5, signedAt: new Date() }] },
    ]);
    prisma.jobOffer.findMany.mockResolvedValue([
      { status: 'ACCEPTED', createdAt: new Date('2026-07-10T00:00:00Z'), updatedAt: new Date('2026-07-12T00:00:00Z'), acceptedAt: new Date('2026-07-12T00:00:00Z'), rejectedAt: null, expiredAt: null, approvals: [{ status: 'APPROVED', decidedAt: new Date('2026-07-11T00:00:00Z') }], versions: [{ source: 'EMPLOYER' }] },
    ]);
    prisma.vacancyApplication.findMany
      .mockResolvedValueOnce([
        application('app-1', ApplicationStatus.HIRED, 'LinkedIn'),
        application('app-2', ApplicationStatus.REJECTED, 'Referido'),
      ])
      .mockResolvedValueOnce([]);
  });

  it('calcula embudo, fuentes, SLA, ofertas y rendimiento por vacante', async () => {
    const result = await service.overview(actor, {
      from: '2026-07-01',
      to: '2026-07-31',
      scope: 'tenant',
      granularity: 'week',
    });

    expect(result.summary).toMatchObject({
      applications: 2,
      uniqueCandidates: 2,
      hires: 1,
      rejected: 1,
      conversionRate: 50,
    });
    expect(result.funnel.map((item) => item.stageCode)).toEqual(['APPLIED', 'INTERVIEW', 'HIRED']);
    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'LinkedIn', hires: 1, conversionRate: 100 }),
      expect.objectContaining({ source: 'Referido', rejected: 1 }),
    ]));
    expect(result.interviews).toMatchObject({ completed: 1, completionRate: 100, averageScore: 4.5 });
    expect(prisma.applicationInterview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Object) }),
        ]),
      }),
    }));
    expect(result.offers).toMatchObject({ accepted: 1, acceptanceRate: 100 });
    expect(result.vacancies[0]).toMatchObject({ applications: 2, hires: 1, conversionRate: 50 });
  });

  it('obliga a un rol de sucursal a permanecer dentro de sus sucursales autorizadas', async () => {
    const branchActor = {
      ...(actor as object),
      scope: AccessScope.BRANCH,
      activeBranchId: 'branch-1',
      allowedBranchIds: ['branch-1'],
    } as never;

    await expect(service.overview(branchActor, {
      from: '2026-07-01',
      to: '2026-07-31',
      branchId: 'branch-2',
      scope: 'tenant',
    })).rejects.toThrow('Sucursal fuera del alcance autorizado');
    expect(prisma.vacancyApplication.findMany).not.toHaveBeenCalled();
  });
});

function application(id: string, status: ApplicationStatus, source: string) {
  const hired = status === ApplicationStatus.HIRED;
  const rejected = status === ApplicationStatus.REJECTED;
  return {
    id,
    tenantId: 'tenant-1',
    vacancyId: 'vacancy-1',
    candidateId: `candidate-${id}`,
    currentStageId: hired ? 'stage-hired' : 'stage-interview',
    stageEnteredAt: new Date('2026-07-10T00:00:00Z'),
    rejectionReason: rejected ? 'Perfil no alineado' : null,
    rejectionReasonId: rejected ? 'reason-1' : null,
    assignedRecruiterId: 'recruiter-1',
    slaWarningSentAt: null,
    slaEscalatedAt: null,
    slaReassignedAt: null,
    status,
    coverLetter: null,
    dynamicResponses: { source },
    notes: null,
    interviewType: null,
    interviewScheduledAt: null,
    interviewFollowUpAt: null,
    interviewObservations: null,
    interviewerUserId: null,
    contactedAt: null,
    interviewCompletedAt: null,
    appliedAt: new Date('2026-07-01T00:00:00Z'),
    reviewedAt: new Date('2026-07-02T00:00:00Z'),
    withdrawnAt: null,
    withdrawalReason: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-15T00:00:00Z'),
    candidate: { id: `candidate-${id}` },
    vacancy: {
      id: 'vacancy-1', title: 'Analista', status: 'OPEN', openings: 2,
      createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-07-31T00:00:00Z'),
      branchId: 'branch-1', branch: { id: 'branch-1', name: 'Principal' },
      stages: [
        { id: 'stage-applied', code: 'APPLIED', name: 'Postulación', position: 1, applicationStatus: ApplicationStatus.SUBMITTED, slaHours: 24 },
        { id: 'stage-interview', code: 'INTERVIEW', name: 'Entrevista', position: 2, applicationStatus: ApplicationStatus.INTERVIEW, slaHours: 72 },
        { id: 'stage-hired', code: 'HIRED', name: 'Contratado', position: 3, applicationStatus: ApplicationStatus.HIRED, slaHours: null },
      ],
    },
    currentStage: hired
      ? { id: 'stage-hired', code: 'HIRED', name: 'Contratado', position: 3, applicationStatus: ApplicationStatus.HIRED, slaHours: null }
      : { id: 'stage-interview', code: 'INTERVIEW', name: 'Entrevista', position: 2, applicationStatus: ApplicationStatus.INTERVIEW, slaHours: 72 },
    assignedRecruiter: { id: 'recruiter-1', firstName: 'Rosa', lastName: 'Reclutadora', email: 'rosa@example.com' },
    structuredRejectionReason: rejected ? { id: 'reason-1', code: 'SKILLS', label: 'Competencias insuficientes', category: 'QUALIFICATIONS' } : null,
    timelineEvents: [
      { type: 'STAGE_CHANGED', occurredAt: new Date('2026-07-05T00:00:00Z'), createdAt: new Date('2026-07-05T00:00:00Z'), previousValue: { stageCode: 'APPLIED', stageName: 'Postulación' }, newValue: { stageCode: 'INTERVIEW', stageName: 'Entrevista' } },
      ...(hired ? [{ type: 'STAGE_CHANGED', occurredAt: new Date('2026-07-12T00:00:00Z'), createdAt: new Date('2026-07-12T00:00:00Z'), previousValue: { stageCode: 'INTERVIEW', stageName: 'Entrevista' }, newValue: { stageCode: 'HIRED', stageName: 'Contratado' } }, { type: 'HIRED', occurredAt: new Date('2026-07-12T00:00:00Z'), createdAt: new Date('2026-07-12T00:00:00Z'), previousValue: null, newValue: null }] : []),
    ],
  };
}
