import {
  AtsCommunicationAudience,
  AtsCommunicationType,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { AtsCommunicationsService } from './ats-communications.service';

describe('AtsCommunicationsService', () => {
  function setup() {
    const prisma = {
      vacancyApplication: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'application-1',
          vacancyId: 'vacancy-1',
          candidate: { fullName: 'Ana Torres', email: 'ana@example.com' },
          currentStage: { code: 'SCREENING', name: 'Revisión inicial' },
          vacancy: {
            title: 'Analista',
            tenant: { name: 'Acme' },
            responsibles: [{
              user: {
                id: 'user-1',
                email: 'recruiter@example.com',
                firstName: 'Rosa',
                lastName: 'Díaz',
              },
            }],
          },
        }),
      },
      atsCommunicationTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      atsConversation: {
        upsert: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
        update: jest.fn().mockResolvedValue({ id: 'conversation-1' }),
      },
      communicationDomain: { findUnique: jest.fn().mockResolvedValue({ fromEmail: 'talento@acme.test' }) },
      atsMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn(),
        create: jest.fn()
          .mockResolvedValueOnce({ id: 'candidate-message' })
          .mockResolvedValueOnce({ id: 'responsible-message' }),
      },
      notification: {
        create: jest.fn()
          .mockResolvedValueOnce({ id: 'candidate-notification', correlationId: 'candidate-correlation' })
          .mockResolvedValueOnce({ id: 'responsible-notification', correlationId: 'responsible-correlation' }),
      },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      candidateAccount: { findUnique: jest.fn().mockResolvedValue({ statusUpdates: true, interviewReminders: true, offerNotifications: true }) },
      notificationDelivery: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const notifications = { retryDelivery: jest.fn() };
    return {
      prisma,
      service: new AtsCommunicationsService(prisma as never, notifications as never),
    };
  }

  it('queues candidate and responsible email through the controlled delivery transport', async () => {
    const { prisma, service } = setup();

    await service.enqueueEvent(prisma as never, {
      tenantId: 'tenant-1',
      applicationId: 'application-1',
      type: AtsCommunicationType.APPLICATION_CONFIRMATION,
      audiences: [
        AtsCommunicationAudience.CANDIDATE,
        AtsCommunicationAudience.RESPONSIBLE,
      ],
      deduplicationSuffix: 'application-created',
    });

    expect(prisma.notificationDelivery.createMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: [
          expect.objectContaining({
            recipientEmail: 'ana@example.com',
            status: NotificationDeliveryStatus.PENDING,
            lastError: null,
          }),
        ],
      }),
    );
    expect(prisma.atsConversation.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'conversation-1' },
      data: expect.objectContaining({ lastOutboundAt: expect.any(Date) }),
    }));
    expect(prisma.notificationDelivery.createMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            recipientEmail: 'recruiter@example.com',
            status: NotificationDeliveryStatus.PENDING,
          }),
        ]),
      }),
    );
  });

  it('does not create a duplicate message for the same event and recipient', async () => {
    const { prisma, service } = setup();
    prisma.atsMessage.findUnique.mockResolvedValue({ id: 'existing-message' });

    const result = await service.enqueueEvent(prisma as never, {
      tenantId: 'tenant-1',
      applicationId: 'application-1',
      type: AtsCommunicationType.REJECTION,
      audiences: [AtsCommunicationAudience.CANDIDATE],
      deduplicationSuffix: 'timeline:event-1',
      variables: { reason: 'Perfil no alineado' },
    });

    expect(result).toEqual([{ id: 'existing-message' }]);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.atsMessage.create).not.toHaveBeenCalled();
  });

  it('groups recipient copies under the same communication event key', async () => {
    const { prisma, service } = setup();
    prisma.atsMessage.findMany.mockResolvedValue([
      {
        id: 'candidate-message',
        deduplicationKey: 'STAGE_UPDATE:application-1:ana@example.com:timeline:event-1',
        status: 'PENDING',
        notification: null,
      },
      {
        id: 'responsible-message',
        deduplicationKey: 'STAGE_UPDATE:application-1:recruiter@example.com:timeline:event-1',
        status: 'PENDING',
        notification: null,
      },
    ]);

    const result = await service.listHistory('tenant-1', {} as never, 'application-1');

    expect(result[0].eventKey).toBe('STAGE_UPDATE:application-1:timeline:event-1');
    expect(result[1].eventKey).toBe(result[0].eventKey);
  });
});
