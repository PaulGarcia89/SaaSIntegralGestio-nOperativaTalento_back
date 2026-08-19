import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ApplicationStatus, ApplicationTimelineEventType, AtsCommunicationAudience, AtsCommunicationType, AtsMessageStatus, CandidatePrivacyRequestStatus, InterviewStatus, NotificationChannel, Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import AdmZip from 'adm-zip';
import { PrismaService } from '../common/prisma/prisma.service';
import { AtsPrivateFileService } from '../common/files/ats-private-file.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';
import { CreateCandidatePrivacyRequestDto, CreateCandidateSupportRequestDto } from './dto/candidate-self-service.dto';
import { InterviewCalendarService } from '../recruitment/interview-calendar.service';

@Injectable()
export class CandidatePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: AtsPrivateFileService,
    private readonly antivirus: TrainingAntivirusService,
    @Optional() private readonly calendars?: InterviewCalendarService,
  ) {}

  async interviewInvitation(accountId: string, interviewId: string) {
    if (!this.calendars) throw new BadRequestException('Internal calendar is not available');
    const interview = await this.prisma.applicationInterview.findFirst({
      where: {
        id: interviewId,
        application: { candidate: this.candidateIdentityWhere(accountId) },
      },
      select: { tenantId: true, application: { select: { candidateId: true } } },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return this.calendars.generateCandidateIcs(
      interview.tenantId,
      interview.application.candidateId,
      interviewId,
    );
  }

  async overview(accountId: string) {
    const account = await this.prisma.candidateAccount.findUnique({
      where: { id: accountId },
      select: { email: true },
    });
    if (!account) throw new NotFoundException('Candidate account not found');
    const [communications, resumes, signatureDocuments, privacyRequests, supportRequests] = await Promise.all([
      this.prisma.atsMessage.findMany({
        where: {
          audience: AtsCommunicationAudience.CANDIDATE,
          application: { candidate: this.candidateIdentityWhere(accountId) },
        },
        select: {
          id: true, applicationId: true, type: true, direction: true, subject: true, body: true,
          status: true, deliveredAt: true, readAt: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.candidateResumeFile.findMany({
        where: { candidate: this.candidateIdentityWhere(accountId), status: { in: ['ACTIVE', 'SUPERSEDED'] } },
        select: {
          id: true, applicationId: true, version: true, status: true, originalName: true,
          mimeType: true, sizeBytes: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.signatureParticipant.findMany({
        where: { email: { equals: account.email, mode: 'insensitive' } },
        select: {
          id: true, status: true, signedAt: true, tokenExpiresAt: true, createdAt: true,
          signaturePackage: { select: { id: true, title: true, status: true, dueDate: true, sentAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.candidatePrivacyRequest.findMany({
        where: { accountId },
        orderBy: { requestedAt: 'desc' },
      }),
      this.prisma.candidateSupportRequest.findMany({ where: { accountId }, orderBy: { requestedAt: 'desc' } }),
    ]);
    return {
      communications,
      offers: communications.filter((item) => item.type === 'OFFER'),
      resumes,
      signatureDocuments,
      privacyRequests,
      supportRequests,
    };
  }

  async withdraw(accountId: string, applicationId: string, reason?: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: applicationId, candidate: this.candidateIdentityWhere(accountId) },
      include: { candidate: { select: { fullName: true } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status === ApplicationStatus.HIRED || application.status === ApplicationStatus.WITHDRAWN) {
      throw new BadRequestException('This application can no longer be withdrawn');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vacancyApplication.update({
        where: { id: application.id },
        data: {
          status: ApplicationStatus.WITHDRAWN,
          withdrawnAt: new Date(),
          withdrawalReason: reason?.trim(),
        },
      });
      await tx.applicationInterview.updateMany({
        where: { applicationId, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        data: { status: 'CANCELED', calendarSyncStatus: 'CANCELLED' },
      });
      await tx.applicationTimelineEvent.create({
        data: {
          tenantId: application.tenantId,
          applicationId,
          type: ApplicationTimelineEventType.APPLICATION_WITHDRAWN,
          occurredAt: new Date(),
          note: 'Postulación retirada voluntariamente por el candidato',
          actorType: 'CANDIDATE',
          actorId: accountId,
          actorDisplayName: application.candidate.fullName,
          previousValue: this.json({ status: application.status }),
          newValue: this.json({ status: ApplicationStatus.WITHDRAWN }),
          reason: reason?.trim(),
          source: 'CANDIDATE_PORTAL',
        },
      });
    });
    return { withdrawn: true };
  }

  async requestPrivacy(accountId: string, dto: CreateCandidatePrivacyRequestDto) {
    const existing = await this.prisma.candidatePrivacyRequest.findFirst({
      where: { accountId, type: dto.type, status: { in: ['PENDING', 'PROCESSING'] } },
    });
    if (existing) return existing;
    return this.prisma.candidatePrivacyRequest.create({
      data: { accountId, type: dto.type, reason: dto.reason?.trim() },
    });
  }

  async cancelPrivacy(accountId: string, requestId: string) {
    const request = await this.prisma.candidatePrivacyRequest.findFirst({
      where: { id: requestId, accountId, status: CandidatePrivacyRequestStatus.PENDING },
    });
    if (!request) throw new BadRequestException('Only pending privacy requests can be cancelled');
    return this.prisma.candidatePrivacyRequest.update({
      where: { id: request.id },
      data: { status: CandidatePrivacyRequestStatus.CANCELLED, processedAt: new Date() },
    });
  }

  async markCommunicationRead(accountId: string, messageId: string) {
    const message = await this.prisma.atsMessage.findFirst({ where: { id: messageId, audience: AtsCommunicationAudience.CANDIDATE, application: { candidate: this.candidateIdentityWhere(accountId) } }, select: { id: true } });
    if (!message) throw new NotFoundException('Communication not found');
    return this.prisma.atsMessage.update({ where: { id: message.id }, data: { readAt: new Date() }, select: { id: true, readAt: true } });
  }

  async replyToCommunication(accountId: string, messageId: string, body: string) {
    const message = await this.prisma.atsMessage.findFirst({
      where: { id: messageId, audience: AtsCommunicationAudience.CANDIDATE, application: { candidate: this.candidateIdentityWhere(accountId) } },
      include: { application: { include: { candidate: true } } },
    });
    if (!message) throw new NotFoundException('Communication not found');
    const text = body.trim();
    if (!text) throw new BadRequestException('Message cannot be empty');
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const conversation = await tx.atsConversation.upsert({
        where: { applicationId: message.applicationId },
        create: { tenantId: message.tenantId, applicationId: message.applicationId, unreadCount: 1, lastMessageAt: now, lastInboundAt: now },
        update: { unreadCount: { increment: 1 }, lastMessageAt: now, lastInboundAt: now, archivedAt: null },
      });
      return tx.atsMessage.create({
        data: {
          tenantId: message.tenantId, vacancyId: message.vacancyId, applicationId: message.applicationId,
          conversationId: conversation.id, inReplyToMessageId: message.id,
          type: AtsCommunicationType.MANUAL, audience: AtsCommunicationAudience.CANDIDATE,
          direction: 'INBOUND', channel: NotificationChannel.INTERNAL,
          recipientEmail: message.application.candidate.email, recipientName: message.application.candidate.fullName,
          subject: `Re: ${message.subject}`, body: text, status: AtsMessageStatus.DELIVERED,
          deliveredAt: now, deduplicationKey: `candidate-portal:${accountId}:${randomBytes(12).toString('hex')}`,
          createdByType: 'CANDIDATE', createdById: accountId,
        },
        select: { id: true, applicationId: true, subject: true, body: true, direction: true, createdAt: true },
      });
    });
  }

  async requestInterviewReschedule(accountId: string, interviewId: string) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: { id: interviewId, status: { in: [InterviewStatus.SCHEDULED, InterviewStatus.CONFIRMED] }, application: { candidate: this.candidateIdentityWhere(accountId) } },
      include: { participants: true, resourceBookings: true, application: { include: { candidate: true } } },
    });
    if (!interview) throw new NotFoundException('Active interview not found');
    const existing = await this.prisma.interviewSchedulingRequest.findFirst({
      where: { applicationId: interview.applicationId, title: `Reagenda: ${interview.title}`, status: 'OPEN', expiresAt: { gt: new Date() } },
      select: { tokenHash: true },
    });
    if (existing) throw new BadRequestException('There is already an active rescheduling request for this interview');
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const windowStartsAt = new Date(Math.max(now.getTime() + 24 * 60 * 60 * 1000, interview.startsAt.getTime()));
    const windowEndsAt = new Date(windowStartsAt.getTime() + 14 * 24 * 60 * 60 * 1000);
    const participants = interview.participants.filter((item) => item.role !== 'SHADOW');
    const primary = participants.find((item) => item.userId === interview.interviewerUserId) ?? participants[0];
    await this.prisma.$transaction(async (tx) => {
      await tx.applicationInterview.update({ where: { id: interview.id }, data: { status: InterviewStatus.CANCELED, calendarSyncStatus: 'CANCELLED', notes: [interview.notes, 'Reagenda solicitada por el candidato desde el portal.'].filter(Boolean).join('\n') } });
      await tx.interviewSchedulingRequest.create({
        data: {
          tenantId: interview.tenantId, applicationId: interview.applicationId, createdByUserId: interview.createdByUserId,
          tokenHash: createHash('sha256').update(token).digest('hex'), title: `Reagenda: ${interview.title}`,
          type: interview.type, timezone: interview.timezone, durationMinutes: Math.max(15, Math.round((interview.endsAt.getTime() - interview.startsAt.getTime()) / 60000)),
          windowStartsAt, windowEndsAt, requestedInterviewerIds: primary ? [primary.userId] : [interview.interviewerUserId],
          shadowInterviewerIds: interview.participants.filter((item) => item.role === 'SHADOW').map((item) => item.userId),
          resourceIds: interview.resourceBookings.map((item) => item.resourceId), expiresAt: windowEndsAt,
        },
      });
      await tx.applicationTimelineEvent.create({ data: { tenantId: interview.tenantId, applicationId: interview.applicationId, type: ApplicationTimelineEventType.INTERVIEW_RESCHEDULED, occurredAt: now, note: 'El candidato solicitó elegir un nuevo horario.', actorType: 'CANDIDATE', actorId: accountId, actorDisplayName: interview.application.candidate.fullName, source: 'CANDIDATE_PORTAL' } });
    });
    const baseUrl = (process.env.CANDIDATE_PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return { url: `${baseUrl}/candidate/interviews/schedule?token=${encodeURIComponent(token)}` };
  }

  createSupportRequest(accountId: string, dto: CreateCandidateSupportRequestDto) {
    return this.prisma.candidateSupportRequest.create({ data: { accountId, subject: dto.subject.trim(), message: dto.message.trim() } });
  }

  async parseResume(file: Express.Multer.File) {
    const mimeType = this.files.validateResume(file);
    await this.antivirus.scan(file.buffer);
    const text = mimeType.includes('wordprocessingml')
      ? this.docxText(file.buffer)
      : this.pdfText(file.buffer);
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const phone = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim();
    const linkedinUrl = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s<>)]+/i)?.[0];
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const fullName = lines.find((line) => /^[\p{L}][\p{L}\s.'-]{2,80}$/u.test(line) && line.split(/\s+/).length >= 2);
    return {
      fields: { fullName, email, phone, linkedinUrl },
      textPreview: text.slice(0, 500),
      confidence: mimeType.includes('wordprocessingml') ? 'HIGH' : text.length > 80 ? 'MEDIUM' : 'LOW',
      requiresReview: true,
    };
  }

  async resumeAccess(accountId: string, fileId: string) {
    const file = await this.prisma.candidateResumeFile.findFirst({
      where: { id: fileId, candidate: this.candidateIdentityWhere(accountId), status: { in: ['ACTIVE', 'SUPERSEDED'] }, retainUntil: { gt: new Date() } },
      select: { id: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    if (!file) throw new NotFoundException('Resume not found or no longer retained');
    return { ...file, ...this.files.createSignedUrl('resume', file.id, 300) };
  }

  private docxText(buffer: Buffer) {
    const xml = new AdmZip(buffer).readAsText('word/document.xml');
    return xml.replace(/<w:tab\s*\/>/g, '\t').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
  }

  private pdfText(buffer: Buffer) {
    return buffer.toString('latin1')
      .match(/\((?:\\.|[^\\)])*\)/g)?.map((value) => value.slice(1, -1).replace(/\\([()\\])/g, '$1')).join(' ') ?? '';
  }

  private json(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private candidateIdentityWhere(accountId: string): Prisma.CandidateWhereInput {
    return {
      OR: [
        { accountId },
        { mergedCandidates: { some: { accountId } } },
      ],
    };
  }
}
