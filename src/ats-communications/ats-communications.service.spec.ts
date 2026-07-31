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
      atsMessage: {
        findUnique: jest.fn().mockResolvedValue(null),
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
      notificationDelivery: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const notifications = { retryDelivery: jest.fn() };
    return {
      prisma,
      service: new AtsCommunicationsService(prisma as never, notifications as never),
    };
  }

  it('records candidate email safely and queues the responsible delivery', async () => {
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
            status: NotificationDeliveryStatus.SKIPPED,
            lastError: expect.stringContaining('proveedor autorizado'),
          }),
        ],
      }),
    );
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
});
