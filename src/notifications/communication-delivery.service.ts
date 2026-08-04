import { Injectable } from '@nestjs/common';
import { NotificationDelivery } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type EmailDelivery = NotificationDelivery & {
  notification: {
    title: string;
    message: string;
    actionUrl: string | null;
    atsMessage: { applicationId: string; inReplyToMessageId: string | null } | null;
  };
  user: { email: string } | null;
};

@Injectable()
export class CommunicationDeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  async sendEmail(delivery: EmailDelivery) {
    const recipient = delivery.recipientEmail ?? delivery.user?.email;
    if (!recipient) throw new Error('Email recipient is missing');
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
    const domain = await this.prisma.communicationDomain.findUnique({ where: { tenantId: delivery.tenantId } });
    const from = domain?.status === 'VERIFIED'
      ? `${domain.fromName} <${domain.fromEmail}>`
      : process.env.NOTIFICATION_FROM_EMAIL?.trim();
    if (!from) throw new Error('A verified sender domain or NOTIFICATION_FROM_EMAIL is required');
    const parentMessage = delivery.notification.atsMessage?.inReplyToMessageId
      ? await this.prisma.atsMessage.findUnique({ where: { id: delivery.notification.atsMessage.inReplyToMessageId }, select: { internetMessageId: true, referencesHeader: true } })
      : null;
    const replyTo = domain?.status === 'VERIFIED' && delivery.notification.atsMessage
      ? this.applicationReplyAddress(domain.replyToEmail ?? domain.fromEmail, delivery.notification.atsMessage.applicationId)
      : domain?.replyToEmail ?? undefined;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: delivery.notification.title,
        text: delivery.notification.message,
        reply_to: replyTo,
        headers: {
          'X-Correlation-Id': delivery.correlationId ?? delivery.id,
          ...(parentMessage?.internetMessageId ? { 'In-Reply-To': parentMessage.internetMessageId } : {}),
          ...(parentMessage?.referencesHeader || parentMessage?.internetMessageId ? { References: [parentMessage?.referencesHeader, parentMessage?.internetMessageId].filter(Boolean).join(' ') } : {}),
        },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok) throw new Error(`Resend responded ${response.status}: ${result.message ?? 'delivery rejected'}`);
    return { id: result.id ?? '', provider: 'RESEND' as const };
  }

  private applicationReplyAddress(baseAddress: string, applicationId: string) {
    const [local, domain] = baseAddress.toLowerCase().split('@');
    return local && domain ? `${local.split('+')[0]}+${applicationId}@${domain}` : baseAddress;
  }
}
