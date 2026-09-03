import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { DocuSealService } from './docuseal.service';

describe('DocuSealService webhook contract', () => {
  const originalSecret = process.env.DOCUSEAL_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.DOCUSEAL_WEBHOOK_SECRET = 'test-webhook-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.DOCUSEAL_WEBHOOK_SECRET;
    else process.env.DOCUSEAL_WEBHOOK_SECRET = originalSecret;
  });

  it('accepts an HMAC signature over the raw request body', () => {
    const service = new DocuSealService({} as never, {} as never, {} as never);
    const rawBody = JSON.stringify({ event_type: 'submission.completed' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = `${timestamp}.${createHmac('sha256', 'test-webhook-secret').update(`${timestamp}.${rawBody}`).digest('hex')}`;

    expect(() => service.assertWebhookRequest(rawBody, signature)).not.toThrow();
  });

  it('rejects an invalid webhook before touching persistence', () => {
    const service = new DocuSealService({} as never, {} as never, {} as never);

    expect(() => service.assertWebhookRequest('{}', 'invalid')).toThrow(BadRequestException);
  });

  it('does not duplicate processing for an already completed package', async () => {
    const prisma = {
      signaturePackage: { findFirst: jest.fn().mockResolvedValue({ id: 'package-1', status: 'COMPLETED', employee: { id: 'employee-1' } }) },
      $transaction: jest.fn(),
    };
    const service = new DocuSealService(prisma as never, {} as never, {} as never);

    await expect(service.handleWebhook({ event_type: 'submission.completed', data: { id: 123 } })).resolves.toEqual({ received: true, packageId: 'package-1', alreadyProcessed: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
