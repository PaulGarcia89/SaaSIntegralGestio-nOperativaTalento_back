import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AtsCommunicationAudience, AtsCommunicationType, AtsMessageStatus, CommunicationEventType, NotificationChannel, NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { AtsCommunicationsService } from './ats-communications.service';
import { ConfigureCommunicationDomainDto, ReplyCandidateEmailDto } from './dto/communication-governance.dto';

type ResendEvent = { type?: string; created_at?: string; data?: Record<string, unknown> };

@Injectable()
export class CommunicationGovernanceService {
  constructor(private readonly prisma: PrismaService, private readonly communications: AtsCommunicationsService) {}

  async configureDomain(tenantId: string, dto: ConfigureCommunicationDomainDto) {
    const domain = dto.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const fromDomain = dto.fromEmail.toLowerCase().split('@')[1];
    if (fromDomain !== domain && !fromDomain?.endsWith(`.${domain}`)) throw new BadRequestException('Sender email must belong to the configured domain');
    return this.prisma.communicationDomain.upsert({
      where: { tenantId },
      create: { tenantId, domain, fromName: dto.fromName.trim(), fromEmail: dto.fromEmail.toLowerCase(), replyToEmail: dto.replyToEmail?.toLowerCase(), dkimSelector: dto.dkimSelector?.trim() || 'resend' },
      update: { domain, fromName: dto.fromName.trim(), fromEmail: dto.fromEmail.toLowerCase(), replyToEmail: dto.replyToEmail?.toLowerCase(), dkimSelector: dto.dkimSelector?.trim() || 'resend', status: 'PENDING', spfVerified: false, dkimVerified: false, dmarcVerified: false },
    });
  }

  getDomain(tenantId: string) { return this.prisma.communicationDomain.findUnique({ where: { tenantId } }); }

  async verifyDomain(tenantId: string) {
    const domain = await this.prisma.communicationDomain.findUnique({ where: { tenantId } });
    if (!domain) throw new NotFoundException('Communication domain is not configured');
    const [root, dkim, dmarc] = await Promise.all([this.txt(domain.domain), this.txt(`${domain.dkimSelector}._domainkey.${domain.domain}`), this.txt(`_dmarc.${domain.domain}`)]);
    const spfVerified = root.some((item) => item.toLowerCase().startsWith('v=spf1'));
    const dkimVerified = dkim.some((item) => /\bv=dkim1\b|\bp=\w+/i.test(item));
    const dmarcVerified = dmarc.some((item) => item.toLowerCase().startsWith('v=dmarc1'));
    const reputation = await this.reputation(tenantId);
    return this.prisma.communicationDomain.update({ where: { id: domain.id }, data: { spfVerified, dkimVerified, dmarcVerified, status: spfVerified && dkimVerified ? 'VERIFIED' : 'FAILED', lastCheckedAt: new Date(), ...reputation } });
  }

  async inbox(tenantId: string, actor: JwtPayload, page = 1, pageSize = 30, search?: string) {
    const where: Prisma.AtsMessageWhereInput = { tenantId, ...(actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { application: { vacancy: { branchId: { in: actor.allowedBranchIds } } } } : {}), ...(search ? { OR: [{ recipientEmail: { contains: search, mode: 'insensitive' } }, { senderEmail: { contains: search, mode: 'insensitive' } }, { subject: { contains: search, mode: 'insensitive' } }, { body: { contains: search, mode: 'insensitive' } }] } : {}) };
    const skip = (Math.max(1, page) - 1) * Math.min(100, Math.max(1, pageSize));
    const take = Math.min(100, Math.max(1, pageSize));
    const [data, total] = await this.prisma.$transaction([
      this.prisma.atsMessage.findMany({ where, include: { application: { include: { candidate: true, vacancy: true } }, notification: { include: { deliveries: { include: { events: true } } } } }, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.atsMessage.count({ where }),
    ]);
    return { data, meta: { page: Math.max(1, page), pageSize: take, total, totalPages: Math.ceil(total / take) } };
  }

  async reply(tenantId: string, actor: JwtPayload, messageId: string, dto: ReplyCandidateEmailDto) {
    const message = await this.prisma.atsMessage.findFirst({ where: { id: messageId, tenantId }, include: { application: { include: { vacancy: true } } } });
    if (!message) throw new NotFoundException('Message not found');
    if (actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin && !actor.allowedBranchIds.includes(message.application.vacancy.branchId)) throw new NotFoundException('Message not found');
    return this.prisma.$transaction((tx) => this.communications.enqueueEvent(tx, { tenantId, applicationId: message.applicationId, type: AtsCommunicationType.MANUAL, audiences: [AtsCommunicationAudience.CANDIDATE], deduplicationSuffix: `reply:${message.id}:${Date.now()}`, actorType: 'USER', actorId: actor.sub, variables: { message: dto.body }, overrideBody: dto.body }));
  }

  async processResendEvent(headers: Record<string, string | string[] | undefined>, body: ResendEvent, rawBody: Buffer) {
    this.verifyResendSignature(headers, rawBody);
    const eventId = this.header(headers, 'svix-id');
    const data = body.data ?? {};
    const providerMessageId = String(data.email_id ?? data.id ?? '');
    const existing = await this.prisma.communicationEvent.findUnique({ where: { provider_providerEventId: { provider: 'RESEND', providerEventId: eventId } } });
    if (existing) return { accepted: true, duplicate: true };
    if (body.type === 'email.received') return this.recordInbound(eventId, body, data);
    const delivery = providerMessageId ? await this.prisma.notificationDelivery.findFirst({ where: { providerMessageId }, include: { notification: { include: { atsMessage: true } } } }) : null;
    if (!delivery) return { accepted: true, unmatched: true };
    const eventType = this.eventType(body.type ?? 'email.sent');
    const occurredAt = body.created_at ? new Date(body.created_at) : new Date();
    const deliveryUpdate = this.deliveryUpdate(eventType, occurredAt);
    await this.prisma.$transaction(async (tx) => {
      await tx.communicationEvent.create({ data: { tenantId: delivery.tenantId, deliveryId: delivery.id, provider: 'RESEND', providerEventId: eventId, providerMessageId, type: eventType, occurredAt, payload: body as Prisma.InputJsonValue } });
      await tx.notificationDelivery.update({ where: { id: delivery.id }, data: deliveryUpdate });
      if (delivery.notification.atsMessage) await tx.atsMessage.update({ where: { id: delivery.notification.atsMessage.id }, data: { status: eventType === 'BOUNCED' || eventType === 'COMPLAINED' ? AtsMessageStatus.FAILED : AtsMessageStatus.DELIVERED, providerMessageId, deliveredAt: eventType === 'DELIVERED' ? occurredAt : undefined } });
      if (eventType === 'UNSUBSCRIBED') await this.unsubscribeByDelivery(tx, delivery.id, occurredAt);
    });
    return { accepted: true };
  }

  private async recordInbound(eventId: string, body: ResendEvent, data: Record<string, unknown>) {
    const from = this.firstAddress(data.from);
    const to = this.firstAddress(data.to);
    const candidate = from ? await this.prisma.candidate.findFirst({ where: { email: from.toLowerCase() }, include: { applications: { include: { vacancy: true }, orderBy: { updatedAt: 'desc' }, take: 1 } } }) : null;
    const application = candidate?.applications[0];
    if (!candidate || !application) return { accepted: true, unmatched: true };
    const occurredAt = body.created_at ? new Date(body.created_at) : new Date();
    const providerMessageId = String(data.email_id ?? data.id ?? eventId);
    await this.prisma.$transaction(async (tx) => {
      await tx.communicationEvent.create({ data: { tenantId: candidate.tenantId, provider: 'RESEND', providerEventId: eventId, providerMessageId, type: 'INBOUND', occurredAt, payload: body as Prisma.InputJsonValue } });
      await tx.atsMessage.create({ data: { tenantId: candidate.tenantId, vacancyId: application.vacancyId, applicationId: application.id, type: AtsCommunicationType.MANUAL, audience: AtsCommunicationAudience.CANDIDATE, direction: 'INBOUND', channel: NotificationChannel.EMAIL, recipientEmail: to || '', senderEmail: from, recipientName: application.vacancy.title, subject: String(data.subject ?? 'Respuesta del candidato'), body: String(data.text ?? data.html ?? 'Respuesta recibida; consulta el proveedor para obtener el contenido.'), status: AtsMessageStatus.DELIVERED, deliveredAt: occurredAt, providerMessageId, deduplicationKey: `inbound:${providerMessageId}`, correlationId: eventId, createdByType: 'CANDIDATE' } });
    });
    return { accepted: true, inbound: true };
  }

  private verifyResendSignature(headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
    const secretValue = process.env.RESEND_WEBHOOK_SECRET?.trim();
    if (!secretValue) throw new UnauthorizedException('Webhook secret is not configured');
    const id = this.header(headers, 'svix-id'); const timestamp = this.header(headers, 'svix-timestamp'); const signatureHeader = this.header(headers, 'svix-signature');
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) throw new UnauthorizedException('Webhook timestamp is invalid');
    const secret = Buffer.from(secretValue.replace(/^whsec_/, ''), 'base64');
    const expected = createHmac('sha256', secret).update(`${id}.${timestamp}.${rawBody.toString('utf8')}`).digest('base64');
    const valid = signatureHeader.split(' ').some((entry) => { const candidate = entry.replace(/^v1,/, ''); const left = Buffer.from(candidate); const right = Buffer.from(expected); return left.length === right.length && timingSafeEqual(left, right); });
    if (!valid) throw new UnauthorizedException('Webhook signature is invalid');
  }

  private async reputation(tenantId: string) { const deliveries = await this.prisma.notificationDelivery.findMany({ where: { tenantId, channel: NotificationChannel.EMAIL }, select: { deliveredAt: true, bouncedAt: true, complainedAt: true } }); const total = deliveries.length || 1; const delivered = deliveries.filter((item) => item.deliveredAt).length; const bounced = deliveries.filter((item) => item.bouncedAt).length; const complained = deliveries.filter((item) => item.complainedAt).length; const deliveryRate = delivered / total * 100; const bounceRate = bounced / total * 100; const complaintRate = complained / total * 100; return { deliveryRate, bounceRate, complaintRate, reputationScore: Math.max(0, Math.min(100, deliveryRate - bounceRate * 2 - complaintRate * 10)) }; }
  private async txt(host: string) { try { return (await resolveTxt(host)).map((parts) => parts.join('')); } catch { return []; } }
  private header(headers: Record<string, string | string[] | undefined>, name: string) { const value = headers[name] ?? headers[name.toLowerCase()]; const result = Array.isArray(value) ? value[0] : value; if (!result) throw new UnauthorizedException(`Missing ${name}`); return result; }
  private firstAddress(value: unknown) { const raw = Array.isArray(value) ? value[0] : value; if (typeof raw !== 'string') return ''; return raw.match(/<([^>]+)>/)?.[1] ?? raw; }
  private eventType(type: string): CommunicationEventType { return ({ 'email.sent': 'SENT', 'email.delivered': 'DELIVERED', 'email.opened': 'OPENED', 'email.clicked': 'CLICKED', 'email.bounced': 'BOUNCED', 'email.complained': 'COMPLAINED', 'email.unsubscribed': 'UNSUBSCRIBED' } as Record<string, CommunicationEventType>)[type] ?? CommunicationEventType.SENT; }
  private deliveryUpdate(type: CommunicationEventType, at: Date): Prisma.NotificationDeliveryUpdateInput { if (type === 'DELIVERED') return { status: NotificationDeliveryStatus.DELIVERED, deliveredAt: at, lastError: null }; if (type === 'OPENED') return { openedAt: at }; if (type === 'CLICKED') return { clickedAt: at }; if (type === 'BOUNCED') return { status: NotificationDeliveryStatus.FAILED, bouncedAt: at, lastError: 'Email bounced' }; if (type === 'COMPLAINED') return { status: NotificationDeliveryStatus.DEAD_LETTER, complainedAt: at, lastError: 'Spam complaint received' }; if (type === 'UNSUBSCRIBED') return { unsubscribedAt: at }; return {}; }
  private async unsubscribeByDelivery(tx: Prisma.TransactionClient, deliveryId: string, at: Date) { const delivery = await tx.notificationDelivery.findUnique({ where: { id: deliveryId }, include: { notification: { include: { atsMessage: { include: { application: true } } } } } }); const candidateId = delivery?.notification.atsMessage?.application.candidateId; if (candidateId) await tx.candidateChannelPreference.upsert({ where: { tenantId_candidateId: { tenantId: delivery!.tenantId, candidateId } }, create: { tenantId: delivery!.tenantId, candidateId, emailEnabled: false, unsubscribedAt: at, unsubscribeReason: 'PROVIDER_UNSUBSCRIBE' }, update: { emailEnabled: false, unsubscribedAt: at, unsubscribeReason: 'PROVIDER_UNSUBSCRIBE' } }); }
}
