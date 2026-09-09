import { Injectable, Optional } from '@nestjs/common';
import { NotificationDelivery } from '@prisma/client';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { lookup } from 'node:dns/promises';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailSettingsService } from '../email/email-settings.service';
import { renderNotificationEmail, type FilaContexto } from './notification-email.template';

type EmailDelivery = NotificationDelivery & {
  notification: {
    title: string;
    message: string;
    actionUrl: string | null;
    /**
     * Se lee para localizar la postulación cuando la notificación no es un
     * mensaje del ATS (cambios de etapa, entrevistas, SLA): esos avisos ya
     * guardaban `applicationId` en el payload y nadie lo usaba.
     */
    payload?: unknown;
    atsMessage: { applicationId: string; inReplyToMessageId: string | null } | null;
  };
  user: { email: string; activeBranch?: { name: string } | null } | null;
};

type ParentMessage = {
  internetMessageId: string | null;
  referencesHeader: string | null;
} | null;

@Injectable()
export class CommunicationDeliveryService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly emailSettings?: EmailSettingsService) {}

  async sendEmail(delivery: EmailDelivery) {
    const recipient = delivery.recipientEmail ?? delivery.user?.email;
    if (!recipient) throw new Error('Email recipient is missing');
    const domain = await this.prisma.communicationDomain.findUnique({ where: { tenantId: delivery.tenantId } });
    const tenantSmtp = this.emailSettings ? await this.emailSettings.transportForTenant(delivery.tenantId) : null;
    const from = domain?.status === 'VERIFIED'
      ? `${domain.fromName} <${domain.fromEmail}>`
      : tenantSmtp ? `${tenantSmtp.fromName} <${tenantSmtp.fromEmail}>` : process.env.NOTIFICATION_FROM_EMAIL?.trim();
    if (!from) throw new Error('A verified sender domain or NOTIFICATION_FROM_EMAIL is required');
    const parentMessage = delivery.notification.atsMessage?.inReplyToMessageId
      ? await this.prisma.atsMessage.findUnique({ where: { id: delivery.notification.atsMessage.inReplyToMessageId }, select: { internetMessageId: true, referencesHeader: true } })
      : null;
    const replyTo = domain?.status === 'VERIFIED' && delivery.notification.atsMessage
      ? this.applicationReplyAddress(domain.replyToEmail ?? domain.fromEmail, delivery.notification.atsMessage.applicationId)
      : domain?.replyToEmail ?? undefined;
    const provider = tenantSmtp ? 'SMTP' : process.env.EMAIL_PROVIDER?.trim().toUpperCase()
      || (process.env.SMTP_HOST?.trim() ? 'SMTP' : 'RESEND');

    if (provider === 'SMTP') {
      return this.sendWithSmtp({ delivery, recipient, from, replyTo, parentMessage, tenantSmtp, domain });
    }
    if (provider !== 'RESEND') throw new Error(`Unsupported email provider: ${provider}`);

    return this.sendWithResend({ delivery, recipient, from, replyTo, parentMessage, domain });
  }

  private async sendWithSmtp({ delivery, recipient, from, replyTo, parentMessage, tenantSmtp, domain }: {
    delivery: EmailDelivery;
    recipient: string;
    from: string;
    replyTo?: string;
    parentMessage: ParentMessage;
    domain: { fromName: string } | null;
    tenantSmtp?: Awaited<ReturnType<EmailSettingsService['transportForTenant']>>;
  }) {
    const host = tenantSmtp?.host ?? process.env.SMTP_HOST?.trim();
    const user = tenantSmtp?.user ?? process.env.SMTP_USER?.trim();
    const password = tenantSmtp?.password ?? process.env.SMTP_PASSWORD;
    const port = tenantSmtp?.port ?? Number(process.env.SMTP_PORT?.trim() || '465');
    const family = Number(process.env.SMTP_FAMILY?.trim() || '4');
    if (!host || !user || !password) throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required');
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('SMTP_PORT is invalid');
    if (family !== 4 && family !== 6) throw new Error('SMTP_FAMILY must be 4 or 6');
    const resolvedHost = family === 4 ? (await lookup(host, { family: 4 })).address : host;

    const transportOptions: SMTPTransport.Options & { family: 4 | 6 } = {
      host: resolvedHost,
      port,
      family,
      secure: tenantSmtp?.secure ?? process.env.SMTP_SECURE?.trim().toLowerCase() !== 'false',
      auth: { user, pass: password },
      tls: { servername: host },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
    };
    const transport = nodemailer.createTransport(transportOptions);
    const cuerpo = await this.renderBody(delivery, domain);
    const result = await transport.sendMail({
      from,
      to: recipient,
      subject: delivery.notification.title,
      // `multipart/alternative`: quien filtre el HTML sigue recibiendo el
      // mensaje íntegro, y el hilado de respuestas del ATS —que se apoya en el
      // texto citado— no cambia de comportamiento.
      text: cuerpo.text,
      html: cuerpo.html,
      replyTo,
      headers: {
        'X-Correlation-Id': delivery.correlationId ?? delivery.id,
        ...(parentMessage?.internetMessageId ? { 'In-Reply-To': parentMessage.internetMessageId } : {}),
        ...(parentMessage?.referencesHeader || parentMessage?.internetMessageId ? { References: [parentMessage?.referencesHeader, parentMessage?.internetMessageId].filter(Boolean).join(' ') } : {}),
      },
    });
    return { id: result.messageId, provider: 'SMTP' as const };
  }

  private async sendWithResend({ delivery, recipient, from, replyTo, parentMessage, domain }: {
    delivery: EmailDelivery;
    recipient: string;
    from: string;
    replyTo?: string;
    parentMessage: ParentMessage;
    domain: { fromName: string } | null;
  }) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
    const cuerpo = await this.renderBody(delivery, domain);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: delivery.notification.title,
        text: cuerpo.text,
        html: cuerpo.html,
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

  /**
   * Contexto del correo: de qué empresa viene, en qué sucursal, sobre qué
   * vacante y en qué etapa.
   *
   * Todo esto ya estaba en la base de datos y no salía en ninguna parte: el
   * candidato recibía «Tu postulación avanzó» sin saber a cuál de las tres a
   * las que se apuntó se refería.
   *
   * La postulación se localiza por dos caminos, en este orden: el mensaje del
   * ATS —cuando el correo ES una respuesta de la conversación— y, si no, el
   * `applicationId` que los avisos de etapa, entrevista y SLA ya guardaban en
   * su `payload`. Si no hay ninguno, no se inventa: el bloque se queda con lo
   * que sí se sabe (empresa, y sucursal activa del destinatario).
   */
  private async renderBody(
    delivery: EmailDelivery,
    domain: { fromName: string } | null,
  ): Promise<{ html: string; text: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: delivery.tenantId },
      select: {
        name: true,
        careerPortals: {
          where: { branding: { isNot: null } },
          take: 1,
          orderBy: { createdAt: 'asc' },
          select: { branding: { select: { primaryColor: true, logoUrl: true, supportEmail: true } } },
        },
      },
    });
    const branding = tenant?.careerPortals[0]?.branding ?? null;

    const applicationId =
      delivery.notification.atsMessage?.applicationId ?? this.applicationIdFromPayload(delivery.notification.payload);
    const application = applicationId
      ? await this.prisma.vacancyApplication.findFirst({
          where: { id: applicationId, tenantId: delivery.tenantId },
          select: {
            vacancy: { select: { title: true, branch: { select: { name: true } } } },
            currentStage: { select: { name: true } },
          },
        })
      : null;

    const empresa = tenant?.name ?? domain?.fromName ?? '';
    const sucursal = application?.vacancy.branch.name ?? delivery.user?.activeBranch?.name ?? '';

    const filas: FilaContexto[] = [
      { etiqueta: 'Empresa', valor: empresa },
      { etiqueta: 'Sucursal', valor: sucursal },
      { etiqueta: 'Vacante', valor: application?.vacancy.title ?? '' },
      { etiqueta: 'Etapa', valor: application?.currentStage?.name ?? '', distintivo: true },
    ];

    return renderNotificationEmail({
      marca: domain?.fromName?.trim() || empresa || 'TalentOS',
      titulo: delivery.notification.title,
      mensaje: delivery.notification.message,
      acento: branding?.primaryColor ?? null,
      logoUrl: branding?.logoUrl ?? null,
      urlAccion: delivery.notification.actionUrl,
      etiquetaAccion: application ? 'Ver mi postulación' : 'Abrir en la plataforma',
      filas,
      correoSoporte: branding?.supportEmail ?? null,
      notaPie: application
        ? 'Recibes este correo porque tienes una postulación activa en este proceso.'
        : 'Mensaje automático del espacio de trabajo. Puedes ajustar qué avisos recibes desde tus preferencias de notificación.',
    });
  }

  /** El `payload` es JSON libre: se lee con cuidado y sin confiar en su forma. */
  private applicationIdFromPayload(payload: unknown) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const valor = (payload as Record<string, unknown>).applicationId;
    return typeof valor === 'string' && valor.length > 0 ? valor : null;
  }

  private applicationReplyAddress(baseAddress: string, applicationId: string) {
    const [local, domain] = baseAddress.toLowerCase().split('@');
    return local && domain ? `${local.split('+')[0]}+${applicationId}@${domain}` : baseAddress;
  }
}
