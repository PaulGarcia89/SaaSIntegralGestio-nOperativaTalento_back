import { AccessScope } from '../common/enums/access-scope.enum';
import { CommunicationGovernanceService } from './communication-governance.service';

describe('CommunicationGovernanceService', () => {
  const originalResendApiKey = process.env.RESEND_API_KEY;
  const actor = {
    sub: 'recruiter-1', scope: AccessScope.BRANCH, isSuperAdmin: false,
    allowedBranchIds: ['branch-1'], roles: ['RECRUITER'], role: 'RECRUITER',
  } as never;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalResendApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalResendApiKey;
  });

  it('lista conversaciones y métricas dentro de las sucursales autorizadas', async () => {
    const prisma = {
      candidate: { findMany: jest.fn().mockResolvedValue([{ email: 'candidate@example.test' }]) },
      atsConversation: { findMany: jest.fn(), count: jest.fn() },
      atsUnmatchedInboundEmail: { count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([[], 0, 2, 3, 1]),
    };
    const service = new CommunicationGovernanceService(prisma as never, {} as never);

    const result = await service.conversations('tenant-1', actor, { page: 1, pageSize: 25, unreadOnly: true });

    expect(result.summary).toEqual({ unreadConversations: 2, openConversations: 3, unmatched: 1 });
    expect(prisma.atsConversation.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-1', unreadCount: { gt: 0 },
        application: { vacancy: { branchId: { in: ['branch-1'] } } },
      }),
    }));
  });

  it('recupera el cuerpo real de Resend y registra un correo entrante como no leído', async () => {
    const tx = {
      communicationEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }) },
      atsConversation: { upsert: jest.fn().mockResolvedValue({ id: 'conversation-1' }) },
      atsMessage: { create: jest.fn().mockResolvedValue({ id: 'message-1' }) },
    };
    const prisma = {
      communicationDomain: { findFirst: jest.fn().mockResolvedValue({ tenantId: 'tenant-1' }) },
      candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'candidate-1', mergedIntoId: null }) },
      atsMessage: { findFirst: jest.fn().mockResolvedValue(null) },
      vacancyApplication: { findFirst: jest.fn().mockResolvedValue({ id: 'application-1', vacancyId: 'vacancy-1', vacancy: { title: 'Analista' } }) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'received-1', from: 'candidate@example.test', to: ['talento+application-1@example.test'],
        subject: 'Re: Entrevista', text: 'Confirmo mi asistencia.', message_id: '<received-1@example.test>',
        headers: {}, attachments: [{ id: 'attachment-1', filename: 'disponibilidad.pdf', content_type: 'application/pdf', size: 1200 }],
      }),
    } as Response);
    process.env.RESEND_API_KEY = 're_test';
    const service = new CommunicationGovernanceService(prisma as never, {} as never);

    const result = await (service as unknown as { recordInbound: (eventId: string, body: object, data: object) => Promise<Record<string, unknown>> }).recordInbound(
      'event-1', { created_at: '2026-08-03T10:00:00.000Z' }, { email_id: 'received-1' },
    );

    expect(result).toMatchObject({ accepted: true, inbound: true });
    expect(tx.atsConversation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ unreadCount: { increment: 1 }, status: 'OPEN' }),
    }));
    expect(tx.atsMessage.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      body: 'Confirmo mi asistencia.', direction: 'INBOUND', conversationId: 'conversation-1',
      attachments: { create: [expect.objectContaining({ providerAttachmentId: 'attachment-1', filename: 'disponibilidad.pdf' })] },
    }) });
  });
});
