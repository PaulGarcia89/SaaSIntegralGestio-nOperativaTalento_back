import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AtsCommunicationAudience, AtsCommunicationType, AtsConversationStatus, AtsMessageStatus, CommunicationEventType, NotificationChannel, NotificationDeliveryStatus, Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { AtsCommunicationsService } from './ats-communications.service';
import { ComposeCandidateEmailDto, ConfigureCommunicationDomainDto, LinkInboundEmailDto, ListAtsConversationsDto, ReplyCandidateEmailDto, ResolveInboundEmailDto, UpdateAtsConversationDto } from './dto/communication-governance.dto';

type ResendEvent = { type?: string; created_at?: string; data?: Record<string, unknown> };
type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject?: string;
  text?: string | null;
  html?: string | null;
  message_id?: string | null;
  headers?: Record<string, string>;
  attachments?: Array<{ id: string; filename: string; content_type: string; size?: number; content_disposition?: string | null; content_id?: string | null }>;
};

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

  async conversations(tenantId: string, actor: JwtPayload, query: ListAtsConversationsDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
    const where: Prisma.AtsConversationWhereInput = {
      tenantId,
      ...this.conversationScope(actor),
      status: query.status,
      assignedUserId: query.assignedToMe ? actor.sub : query.assignedUserId,
      ...(query.unreadOnly ? { unreadCount: { gt: 0 } } : {}),
      ...(query.archived ? { archivedAt: { not: null } } : { archivedAt: null }),
      OR: [
        { snoozedUntil: null },
        { snoozedUntil: { lte: new Date() } },
      ],
      ...(query.search ? {
        AND: [{ OR: [
          { application: { candidate: { fullName: { contains: query.search, mode: 'insensitive' } } } },
          { application: { candidate: { email: { contains: query.search, mode: 'insensitive' } } } },
          { application: { vacancy: { title: { contains: query.search, mode: 'insensitive' } } } },
          { messages: { some: { subject: { contains: query.search, mode: 'insensitive' } } } },
          { messages: { some: { body: { contains: query.search, mode: 'insensitive' } } } },
        ] }],
      } : {}),
    };
    const include = {
      application: { include: { candidate: true, vacancy: { include: { branch: true } }, assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      messages: { orderBy: { createdAt: 'desc' as const }, take: 1, include: { attachments: true, notification: { include: { deliveries: { include: { events: true } } } } } },
    } satisfies Prisma.AtsConversationInclude;
    const unmatchedWhere = await this.unmatchedWhere(tenantId, actor);
    const [data, total, unreadConversations, openConversations, unmatched] = await this.prisma.$transaction([
      this.prisma.atsConversation.findMany({ where, include, orderBy: { lastMessageAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.atsConversation.count({ where }),
      this.prisma.atsConversation.count({ where: { tenantId, ...this.conversationScope(actor), unreadCount: { gt: 0 }, archivedAt: null } }),
      this.prisma.atsConversation.count({ where: { tenantId, ...this.conversationScope(actor), status: AtsConversationStatus.OPEN, archivedAt: null } }),
      this.prisma.atsUnmatchedInboundEmail.count({ where: { ...unmatchedWhere, status: 'UNMATCHED' } }),
    ]);
    return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, summary: { unreadConversations, openConversations, unmatched } };
  }

  async conversation(tenantId: string, actor: JwtPayload, conversationId: string) {
    const conversation = await this.prisma.atsConversation.findFirst({
      where: { id: conversationId, tenantId, ...this.conversationScope(actor) },
      include: {
        application: { include: { candidate: true, vacancy: { include: { branch: true } }, assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true, notification: { include: { deliveries: { include: { events: true } } } } } },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async compose(tenantId: string, actor: JwtPayload, applicationId: string, dto: ComposeCandidateEmailDto) {
    await this.assertApplication(actor, tenantId, applicationId);
    return this.prisma.$transaction((tx) => this.communications.enqueueEvent(tx, {
      tenantId, applicationId, type: AtsCommunicationType.MANUAL,
      audiences: [AtsCommunicationAudience.CANDIDATE], deduplicationSuffix: `compose:${Date.now()}`,
      actorType: 'USER', actorId: actor.sub, overrideSubject: dto.subject, overrideBody: dto.body,
    }));
  }

  async reply(tenantId: string, actor: JwtPayload, messageId: string, dto: ReplyCandidateEmailDto) {
    const message = await this.prisma.atsMessage.findFirst({ where: { id: messageId, tenantId }, include: { application: { include: { vacancy: true } } } });
    if (!message) throw new NotFoundException('Message not found');
    if (actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin && !actor.allowedBranchIds.includes(message.application.vacancy.branchId)) throw new NotFoundException('Message not found');
    return this.prisma.$transaction((tx) => this.communications.enqueueEvent(tx, { tenantId, applicationId: message.applicationId, type: AtsCommunicationType.MANUAL, audiences: [AtsCommunicationAudience.CANDIDATE], deduplicationSuffix: `reply:${message.id}:${Date.now()}`, actorType: 'USER', actorId: actor.sub, variables: { message: dto.body }, overrideSubject: dto.subject, overrideBody: dto.body, inReplyToMessageId: message.id }));
  }

  async markRead(tenantId: string, actor: JwtPayload, conversationId: string) {
    const conversation = await this.requireConversation(tenantId, actor, conversationId);
    const readAt = new Date();
    await this.prisma.$transaction([
      this.prisma.atsMessage.updateMany({ where: { conversationId: conversation.id, tenantId, direction: 'INBOUND', readAt: null }, data: { readAt } }),
      this.prisma.atsConversation.update({ where: { id: conversation.id }, data: { unreadCount: 0 } }),
    ]);
    return { readAt };
  }

  async updateConversation(tenantId: string, actor: JwtPayload, conversationId: string, dto: UpdateAtsConversationDto) {
    const conversation = await this.requireConversation(tenantId, actor, conversationId);
    if (dto.assignedUserId) {
      const user = await this.prisma.user.findFirst({ where: { id: dto.assignedUserId, tenantId, status: 'ACTIVE' }, select: { id: true } });
      if (!user) throw new NotFoundException('Assigned user not found');
    }
    return this.prisma.atsConversation.update({
      where: { id: conversation.id },
      data: {
        status: dto.status,
        assignedUserId: dto.assignedUserId,
        snoozedUntil: dto.snoozedUntil === null ? null : dto.snoozedUntil ? new Date(dto.snoozedUntil) : undefined,
        archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null,
        closedAt: dto.status === AtsConversationStatus.CLOSED ? new Date() : dto.status ? null : undefined,
      },
    });
  }

  async unmatched(tenantId: string, actor: JwtPayload, page = 1, pageSize = 20) {
    const take = Math.min(100, Math.max(1, pageSize));
    const normalizedPage = Math.max(1, page);
    const scope = await this.unmatchedWhere(tenantId, actor);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.atsUnmatchedInboundEmail.findMany({ where: { ...scope, status: 'UNMATCHED' }, orderBy: { occurredAt: 'desc' }, skip: (normalizedPage - 1) * take, take }),
      this.prisma.atsUnmatchedInboundEmail.count({ where: { ...scope, status: 'UNMATCHED' } }),
    ]);
    return { data, meta: { page: normalizedPage, pageSize: take, total, totalPages: Math.ceil(total / take) } };
  }

  async linkUnmatched(tenantId: string, actor: JwtPayload, id: string, dto: LinkInboundEmailDto) {
    const scope = await this.unmatchedWhere(tenantId, actor);
    const [unmatched, application] = await Promise.all([
      this.prisma.atsUnmatchedInboundEmail.findFirst({ where: { id, ...scope, status: 'UNMATCHED' } }),
      this.assertApplication(actor, tenantId, dto.applicationId),
    ]);
    if (!unmatched) throw new NotFoundException('Inbound email not found');
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.atsConversation.upsert({ where: { applicationId: application.id }, create: { tenantId, applicationId: application.id, unreadCount: 1, lastMessageAt: unmatched.occurredAt, lastInboundAt: unmatched.occurredAt }, update: { unreadCount: { increment: 1 }, lastMessageAt: unmatched.occurredAt, lastInboundAt: unmatched.occurredAt, archivedAt: null } });
      const message = await tx.atsMessage.create({ data: { tenantId, vacancyId: application.vacancyId, applicationId: application.id, conversationId: conversation.id, type: AtsCommunicationType.MANUAL, audience: AtsCommunicationAudience.CANDIDATE, direction: 'INBOUND', channel: NotificationChannel.EMAIL, recipientEmail: unmatched.recipientEmail, senderEmail: unmatched.senderEmail, recipientName: application.vacancy.title, subject: unmatched.subject, body: unmatched.body, status: AtsMessageStatus.DELIVERED, deliveredAt: unmatched.occurredAt, providerMessageId: unmatched.providerMessageId, deduplicationKey: `inbound:${unmatched.providerMessageId}`, correlationId: unmatched.providerEventId, createdByType: 'CANDIDATE', attachments: { create: this.attachmentCreates(tenantId, unmatched.attachments) } } });
      await tx.atsUnmatchedInboundEmail.update({ where: { id }, data: { status: 'LINKED', linkedApplicationId: application.id, resolvedByUserId: actor.sub, resolvedAt: new Date() } });
      return message;
    });
  }

  async ignoreUnmatched(tenantId: string, actor: JwtPayload, id: string, dto: ResolveInboundEmailDto) {
    const scope = await this.unmatchedWhere(tenantId, actor);
    const updated = await this.prisma.atsUnmatchedInboundEmail.updateMany({ where: { id, ...scope, status: 'UNMATCHED' }, data: { status: 'IGNORED', resolvedByUserId: actor.sub, resolvedAt: new Date(), reason: dto.reason.trim() } });
    if (!updated.count) throw new NotFoundException('Inbound email not found');
    return { ignored: true };
  }

  async attachmentAccess(tenantId: string, actor: JwtPayload, attachmentId: string) {
    const attachment = await this.prisma.atsMessageAttachment.findFirst({ where: { id: attachmentId, tenantId, message: { application: this.applicationScope(actor) } }, include: { message: { select: { providerMessageId: true } } } });
    if (!attachment?.message.providerMessageId) throw new NotFoundException('Attachment not found');
    const detail = await this.resendGet(`/emails/receiving/${encodeURIComponent(attachment.message.providerMessageId)}/attachments/${encodeURIComponent(attachment.providerAttachmentId)}`) as { download_url?: string; expires_at?: string };
    if (!detail.download_url) throw new BadRequestException('Attachment provider did not return a download URL');
    return { id: attachment.id, filename: attachment.filename, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, url: detail.download_url, expiresAt: detail.expires_at };
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
    const providerMessageId = String(data.email_id ?? data.id ?? eventId);
    const received = await this.resendGet(`/emails/receiving/${encodeURIComponent(providerMessageId)}`) as ReceivedEmail;
    const from = this.firstAddress(received.from || data.from).toLowerCase();
    const to = this.firstAddress(received.to?.length ? received.to : data.to).toLowerCase();
    const recipientDomain = to.split('@')[1] ?? '';
    const domain = await this.prisma.communicationDomain.findFirst({
      where: { OR: [
        { fromEmail: { equals: to, mode: 'insensitive' } },
        { replyToEmail: { equals: to, mode: 'insensitive' } },
        { domain: { equals: recipientDomain, mode: 'insensitive' } },
      ] },
    });
    if (!domain) return { accepted: true, unmatched: true, reason: 'UNMANAGED_RECIPIENT_DOMAIN' };
    const occurredAt = body.created_at ? new Date(body.created_at) : new Date();
    const subject = String(received.subject ?? data.subject ?? 'Respuesta del candidato');
    const emailBody = received.text?.trim() || this.plainText(received.html) || 'Correo recibido sin cuerpo de texto.';
    const headers = received.headers ?? {};
    const inReplyTo = headers['in-reply-to'] ?? headers['In-Reply-To'];
    const candidate = from ? await this.prisma.candidate.findFirst({ where: { tenantId: domain.tenantId, email: { equals: from, mode: 'insensitive' } }, select: { id: true, mergedIntoId: true } }) : null;
    const canonicalCandidateId = candidate?.mergedIntoId ?? candidate?.id;
    const aliasApplicationId = this.applicationIdFromAlias(to);
    const parentMessage = inReplyTo ? await this.prisma.atsMessage.findFirst({ where: { tenantId: domain.tenantId, internetMessageId: inReplyTo }, select: { id: true, applicationId: true } }) : null;
    const application = canonicalCandidateId ? await this.prisma.vacancyApplication.findFirst({
      where: {
        tenantId: domain.tenantId,
        candidateId: canonicalCandidateId,
        ...(aliasApplicationId ? { id: aliasApplicationId } : parentMessage ? { id: parentMessage.applicationId } : {}),
      },
      include: { vacancy: true },
      orderBy: { updatedAt: 'desc' },
    }) : null;
    const attachmentMetadata = received.attachments ?? [];
    if (!application) {
      await this.prisma.$transaction([
        this.prisma.communicationEvent.create({ data: { tenantId: domain.tenantId, provider: 'RESEND', providerEventId: eventId, providerMessageId, type: 'INBOUND', occurredAt, payload: body as Prisma.InputJsonValue } }),
        this.prisma.atsUnmatchedInboundEmail.create({ data: { tenantId: domain.tenantId, providerMessageId, providerEventId: eventId, senderEmail: from, recipientEmail: to, subject, body: emailBody, attachments: attachmentMetadata as Prisma.InputJsonValue, occurredAt } }),
      ]);
      return { accepted: true, unmatched: true };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.communicationEvent.create({ data: { tenantId: domain.tenantId, provider: 'RESEND', providerEventId: eventId, providerMessageId, type: 'INBOUND', occurredAt, payload: body as Prisma.InputJsonValue } });
      const conversation = await tx.atsConversation.upsert({
        where: { applicationId: application.id },
        create: { tenantId: domain.tenantId, applicationId: application.id, unreadCount: 1, lastMessageAt: occurredAt, lastInboundAt: occurredAt },
        update: { unreadCount: { increment: 1 }, lastMessageAt: occurredAt, lastInboundAt: occurredAt, status: AtsConversationStatus.OPEN, archivedAt: null, snoozedUntil: null },
      });
      await tx.atsMessage.create({ data: { tenantId: domain.tenantId, vacancyId: application.vacancyId, applicationId: application.id, conversationId: conversation.id, inReplyToMessageId: parentMessage?.id, internetMessageId: received.message_id, referencesHeader: headers.references, type: AtsCommunicationType.MANUAL, audience: AtsCommunicationAudience.CANDIDATE, direction: 'INBOUND', channel: NotificationChannel.EMAIL, recipientEmail: to, senderEmail: from, recipientName: application.vacancy.title, subject, body: emailBody, status: AtsMessageStatus.DELIVERED, deliveredAt: occurredAt, providerMessageId, deduplicationKey: `inbound:${providerMessageId}`, correlationId: eventId, createdByType: 'CANDIDATE', attachments: { create: this.attachmentCreates(domain.tenantId, attachmentMetadata) } } });
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

  private conversationScope(actor: JwtPayload): Prisma.AtsConversationWhereInput {
    return actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { application: { vacancy: { branchId: { in: actor.allowedBranchIds } } } } : {};
  }

  private applicationScope(actor: JwtPayload): Prisma.VacancyApplicationWhereInput {
    return actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { vacancy: { branchId: { in: actor.allowedBranchIds } } } : {};
  }

  private async assertApplication(actor: JwtPayload, tenantId: string, applicationId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({ where: { id: applicationId, tenantId, ...this.applicationScope(actor) }, include: { vacancy: true } });
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  private async requireConversation(tenantId: string, actor: JwtPayload, conversationId: string) {
    const conversation = await this.prisma.atsConversation.findFirst({ where: { id: conversationId, tenantId, ...this.conversationScope(actor) } });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  private async unmatchedWhere(tenantId: string, actor: JwtPayload): Promise<Prisma.AtsUnmatchedInboundEmailWhereInput> {
    if (actor.scope !== AccessScope.BRANCH || actor.isSuperAdmin) return { tenantId };
    const candidates = await this.prisma.candidate.findMany({
      where: { tenantId, applications: { some: { vacancy: { branchId: { in: actor.allowedBranchIds } } } } },
      select: { email: true },
    });
    return { tenantId, senderEmail: { in: candidates.map((item) => item.email.toLowerCase()) } };
  }

  private async resendGet(path: string) {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new BadRequestException('RESEND_API_KEY is not configured');
    const response = await fetch(`https://api.resend.com${path}`, { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
    const body = await response.json().catch(() => ({})) as { message?: string };
    if (!response.ok) throw new BadRequestException(`Resend responded ${response.status}: ${body.message ?? 'request rejected'}`);
    return body;
  }

  private applicationIdFromAlias(address: string) {
    const local = address.split('@')[0] ?? '';
    return local.match(/\+([0-9a-f-]{36})$/i)?.[1];
  }

  private attachmentCreates(tenantId: string, value: unknown) {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const attachment = item as Record<string, unknown>;
      const providerAttachmentId = String(attachment.id ?? '');
      if (!providerAttachmentId) return [];
      return [{ tenantId, providerAttachmentId, filename: String(attachment.filename ?? 'archivo'), mimeType: String(attachment.content_type ?? 'application/octet-stream'), sizeBytes: typeof attachment.size === 'number' ? attachment.size : undefined, disposition: typeof attachment.content_disposition === 'string' ? attachment.content_disposition : undefined, contentId: typeof attachment.content_id === 'string' ? attachment.content_id : undefined }];
    });
  }

  private plainText(html?: string | null) {
    return html?.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').trim() ?? '';
  }
}
