import { BadRequestException } from '@nestjs/common';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ApplicationsService } from './applications.service';
import { ApplicationTimelineEventType } from './dto/application-tracking.dto';

describe('ApplicationsService custom vacancy stages', () => {
  const actor = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    role: 'RECRUITER',
    roles: ['RECRUITER'],
    scope: AccessScope.TENANT,
    allowedBranchIds: ['branch-1'],
    isSuperAdmin: false,
  } as JwtPayload;

  const stage = {
    id: 'stage-decision',
    tenantId: 'tenant-1',
    vacancyId: 'vacancy-1',
    code: 'DECISION',
    name: 'Decisión final',
    position: 3,
    color: null,
    applicationStatus: 'APPROVED',
    isTerminal: false,
    allowedNextStageCodes: ['REJECTED', 'HIRED'],
    requiredFields: [],
    requiresApproval: false,
    requiredApprovals: 0,
    allowReopen: false,
    slaHours: 48,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const serializedApplication = {
    id: 'application-1',
    tenantId: 'tenant-1',
    vacancyId: 'vacancy-1',
    candidateId: 'candidate-1',
    currentStageId: stage.id,
    stageEnteredAt: new Date(),
    rejectionReason: null,
    status: 'APPROVED',
    coverLetter: null,
    dynamicResponses: null,
    notes: null,
    interviewType: null,
    interviewScheduledAt: null,
    interviewFollowUpAt: null,
    interviewObservations: null,
    interviewerUserId: null,
    contactedAt: null,
    interviewCompletedAt: null,
    appliedAt: new Date(),
    reviewedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    candidate: { id: 'candidate-1', fullName: 'Candidate' },
    vacancy: {
      id: 'vacancy-1',
      createdAt: new Date(),
      branch: { id: 'branch-1' },
      stages: [stage],
    },
    currentStage: stage,
    timelineEvents: [],
    interviews: [],
    transitionRequests: [],
  };

  function createService() {
    const tx = {
      vacancyApplication: { update: jest.fn().mockResolvedValue({ id: 'application-1' }) },
      applicationStageTransitionRequest: {
        updateMany: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'transition-1' }),
      },
      applicationTimelineEvent: {
        create: jest.fn().mockResolvedValue({ id: 'event-1' }),
        createMany: jest.fn(),
      },
    };
    const prisma = {
      vacancyApplication: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'application-1',
            vacancyId: 'vacancy-1',
            status: 'REVIEWING',
            currentStageId: 'stage-screening',
            currentStage: {
              ...stage,
              id: 'stage-screening',
              code: 'SCREENING',
              name: 'Revisión inicial',
              applicationStatus: 'REVIEWING',
              allowedNextStageCodes: ['DECISION', 'REJECTED'],
            },
            candidate: { id: 'candidate-1', fullName: 'Candidate' },
            coverLetter: null,
            dynamicResponses: null,
            interviews: [],
          })
          .mockResolvedValueOnce(serializedApplication),
      },
      vacancyStage: { findFirst: jest.fn().mockResolvedValue(stage) },
      user: { findFirst: jest.fn() },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    return {
      service: new ApplicationsService(prisma as never),
      prisma,
      tx,
    };
  }

  it('places a new application in the first configured vacancy stage', async () => {
    const initialStage = {
      ...stage,
      id: 'stage-applied',
      code: 'APPLIED',
      name: 'Postulación recibida',
      position: 0,
      applicationStatus: 'SUBMITTED',
    };
    const created = {
      ...serializedApplication,
      currentStageId: initialStage.id,
      currentStage: initialStage,
      status: 'SUBMITTED',
      vacancy: {
        ...serializedApplication.vacancy,
        stages: [initialStage],
      },
    };
    const tx = {
      candidate: {
        upsert: jest.fn().mockResolvedValue({ id: 'candidate-1' }),
      },
      vacancyApplication: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      candidateConversionEvent: { upsert: jest.fn() },
    };
    const prisma = {
      vacancy: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'vacancy-1',
          tenantId: 'tenant-1',
          applicationFormSchema: null,
          stages: [initialStage],
        }),
      },
      publicRequestRateLimit: {
        deleteMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ApplicationsService(prisma as never);

    await service.createPublic(
      'vacancy-1',
      'account-1',
      'candidate@example.test',
      {
        fullName: 'Candidate',
        email: 'candidate@example.test',
      },
    );

    expect(tx.vacancyApplication.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currentStageId: initialStage.id,
        status: 'SUBMITTED',
      }),
      include: expect.any(Object),
    });
  });

  it('moves the application using the selected vacancy stage and synchronizes status', async () => {
    const { service, tx } = createService();

    const result = await service.updateStatus('application-1', actor, 'tenant-1', {
      currentStageId: stage.id,
    });

    expect(tx.vacancyApplication.update).toHaveBeenCalledWith({
      where: { id: 'application-1' },
      data: expect.objectContaining({
        status: 'APPROVED',
        currentStage: { connect: { id: stage.id } },
      }),
    });
    expect(tx.applicationTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        applicationId: 'application-1',
        type: 'STAGE_CHANGED',
        actorId: actor.sub,
        actorDisplayName: actor.sub,
        previousValue: expect.objectContaining({
          status: 'REVIEWING',
          stageCode: 'SCREENING',
        }),
        newValue: expect.objectContaining({
          status: 'APPROVED',
          stageCode: 'DECISION',
        }),
      }),
    });
    expect(result).toEqual(expect.objectContaining({
      currentStageId: stage.id,
      status: 'APPROVED',
      currentStage: expect.objectContaining({ name: 'Decisión final' }),
    }));
  });

  it('rejects a stage that does not belong to the application vacancy', async () => {
    const { service, prisma, tx } = createService();
    prisma.vacancyStage.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStatus('application-1', actor, 'tenant-1', {
        currentStageId: 'stage-from-another-vacancy',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.vacancyApplication.update).not.toHaveBeenCalled();
  });

  it('rejects a transition that is not enabled by the current stage', async () => {
    const { service, prisma, tx } = createService();
    prisma.vacancyStage.findFirst.mockResolvedValue({ ...stage, code: 'OFFER' });

    await expect(
      service.updateStatus('application-1', actor, 'tenant-1', {
        currentStageId: stage.id,
      }),
    ).rejects.toThrow('Transition from Revisión inicial to Decisión final is not allowed');

    expect(tx.vacancyApplication.update).not.toHaveBeenCalled();
  });

  it('requires a reason before moving an application to a rejection stage', async () => {
    const { service, prisma, tx } = createService();
    prisma.vacancyStage.findFirst.mockResolvedValue({
      ...stage,
      id: 'stage-rejected',
      code: 'REJECTED',
      name: 'No continúa',
      applicationStatus: 'REJECTED',
    });

    await expect(
      service.updateStatus('application-1', actor, 'tenant-1', {
        currentStageId: 'stage-rejected',
      }),
    ).rejects.toThrow('A rejection reason is required');

    expect(tx.vacancyApplication.update).not.toHaveBeenCalled();
  });

  it('creates an approval request instead of moving immediately', async () => {
    const { service, prisma, tx } = createService();
    prisma.vacancyStage.findFirst.mockResolvedValue({
      ...stage,
      requiresApproval: true,
      requiredApprovals: 2,
    });

    await service.updateStatus('application-1', actor, 'tenant-1', {
      currentStageId: stage.id,
    });

    expect(tx.applicationStageTransitionRequest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        applicationId: 'application-1',
        requestedByUserId: actor.sub,
        requiredApprovals: 2,
        toStageId: stage.id,
      }),
    });
    expect(tx.applicationTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'STAGE_CHANGE_REQUESTED',
        actorId: actor.sub,
      }),
    });
    expect(tx.vacancyApplication.update).not.toHaveBeenCalled();
  });

  it('appends supplied timeline events without deleting immutable history', async () => {
    const { service, tx } = createService();

    await service.updateStatus('application-1', actor, 'tenant-1', {
      currentStageId: stage.id,
      tracking: {
        timelineEvents: [{
          type: ApplicationTimelineEventType.CONTACTED,
          at: '2026-07-31T12:00:00.000Z',
          note: 'Contacto telefónico',
        }],
      },
    });

    expect(tx.applicationTimelineEvent).not.toHaveProperty('deleteMany');
    expect(tx.applicationTimelineEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId: 'tenant-1',
        applicationId: 'application-1',
        type: 'CONTACTED',
        actorId: actor.sub,
        source: 'ATS_MANUAL',
      })],
    });
  });

  it('routes every bulk change through the audited transition flow', async () => {
    const prisma = {
      vacancyApplication: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'application-1' },
          { id: 'application-2' },
        ]),
      },
    };
    const service = new ApplicationsService(prisma as never);
    const updateStatus = jest
      .spyOn(service, 'updateStatus')
      .mockResolvedValue({} as never);

    await service.bulkUpdateStatus(actor, 'tenant-1', {
      ids: ['application-1', 'application-2'],
      status: 'APPROVED',
    });

    expect(updateStatus).toHaveBeenCalledTimes(2);
    expect(updateStatus).toHaveBeenNthCalledWith(
      1,
      'application-1',
      actor,
      'tenant-1',
      { status: 'APPROVED' },
    );
    expect(updateStatus).toHaveBeenNthCalledWith(
      2,
      'application-2',
      actor,
      'tenant-1',
      { status: 'APPROVED' },
    );
  });
});
