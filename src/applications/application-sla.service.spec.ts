import { ApplicationSlaService } from './application-sla.service';

describe('ApplicationSlaService', () => {
  const tx = {
    applicationTimelineEvent: { create: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const prisma = {
    vacancyApplication: { findMany: jest.fn(), updateMany: jest.fn() },
    // El aviso de SLA se redacta en el idioma de cada destinatario, asi que el
    // servicio consulta `preferredLocale` de los usuarios notificados.
    user: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const service = new ApplicationSlaService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('creates warning and escalation records once the SLA thresholds are crossed', async () => {
    prisma.vacancyApplication.findMany.mockResolvedValue([{
      id: 'application-1',
      tenantId: 'tenant-1',
      assignedRecruiterId: 'recruiter-1',
      slaWarningSentAt: null,
      slaEscalatedAt: null,
      slaReassignedAt: null,
      stageEnteredAt: new Date(Date.now() - 72 * 3_600_000),
      candidate: { fullName: 'Ada Lovelace' },
      currentStage: { name: 'Revisión', slaHours: 24, slaWarningHoursBefore: 4, slaEscalationHours: 8, autoReassignAfterHours: null },
      vacancy: { responsibles: [{ role: 'OWNER', userId: 'owner-1' }] },
    }]);
    prisma.vacancyApplication.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.processDue();

    expect(result).toMatchObject({ warned: 1, escalated: 1, reassigned: 0 });
    expect(tx.applicationTimelineEvent.create).toHaveBeenCalledTimes(2);
    expect(tx.notification.createMany).toHaveBeenCalledTimes(2);
  });

  it('does not duplicate events when another worker already claimed the action', async () => {
    prisma.vacancyApplication.findMany.mockResolvedValue([{
      id: 'application-1', tenantId: 'tenant-1', assignedRecruiterId: null,
      slaWarningSentAt: null, slaEscalatedAt: new Date(), slaReassignedAt: null,
      stageEnteredAt: new Date(Date.now() - 25 * 3_600_000),
      candidate: { fullName: 'Grace Hopper' },
      currentStage: { name: 'Revisión', slaHours: 24, slaWarningHoursBefore: 4, slaEscalationHours: 8, autoReassignAfterHours: null },
      vacancy: { responsibles: [] },
    }]);
    prisma.vacancyApplication.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.processDue();

    expect(result.warned).toBe(0);
    expect(tx.applicationTimelineEvent.create).not.toHaveBeenCalled();
  });
});
