import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationTimelineEventType,
  JobOfferApprovalStatus,
  JobOfferApprovalType,
  JobOfferStatus,
  JobOfferVersionSource,
  Prisma,
  SignaturePackageStatus,
  SignatureParticipantStatus,
  WorkflowSourceModule,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { publicFrontendUrl } from '../common/urls/public-frontend-url';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { AtsCommunicationsService } from '../ats-communications/ats-communications.service';
import { WorkflowsService } from '../workflows/workflows.service';
import {
  CandidateOfferDecision,
  CounterJobOfferDto,
  CreateJobOfferDto,
  DecideJobOfferApprovalDto,
  RespondJobOfferDto,
} from './dto/job-offer.dto';
import { createJobOfferPdf, jobOfferPdfHash } from './job-offer-pdf';

const offerInclude = {
  application: {
    include: {
      candidate: true,
      vacancy: { include: { tenant: { select: { name: true } }, branch: true } },
    },
  },
  versions: {
    orderBy: { version: 'desc' as const },
    include: {
      signaturePackage: { include: { participants: true } },
    },
  },
  approvals: { orderBy: [{ version: 'desc' as const }, { type: 'asc' as const }] },
};

@Injectable()
export class JobOffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly communications: AtsCommunicationsService,
    private readonly workflows: WorkflowsService,
  ) {}

  async listForApplication(tenantId: string, actor: JwtPayload, applicationId: string) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    await this.expireOffers({ tenantId, applicationId });
    return this.prisma.jobOffer.findMany({
      where: { tenantId, applicationId },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, actor: JwtPayload, applicationId: string, dto: CreateJobOfferDto) {
    const application = await this.assertApplicationAccess(tenantId, actor, applicationId);
    if (application.status !== 'APPROVED') {
      throw new BadRequestException('La postulación debe estar aprobada antes de crear una oferta');
    }
    this.validateDates(dto.employmentStartDate, dto.validUntil);
    const existing = await this.prisma.jobOffer.findFirst({
      where: { applicationId, status: { notIn: ['REJECTED', 'EXPIRED', 'CANCELLED'] } },
      select: { id: true },
    });
    if (existing) throw new ConflictException('La postulación ya tiene una oferta activa');

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.jobOffer.create({
        data: {
          tenantId,
          branchId: application.vacancy.branchId,
          applicationId,
          status: JobOfferStatus.PENDING_APPROVAL,
          createdById: actor.sub,
          financialApproverId: dto.financialApproverId,
          managerialApproverId: dto.managerialApproverId,
          versions: { create: this.versionData(tenantId, 1, JobOfferVersionSource.EMPLOYER, actor.sub, dto) },
          approvals: {
            create: [
              { tenantId, version: 1, type: JobOfferApprovalType.FINANCIAL, approverId: dto.financialApproverId },
              { tenantId, version: 1, type: JobOfferApprovalType.MANAGERIAL, approverId: dto.managerialApproverId },
            ],
          },
        },
      });
      await this.timeline(tx, application, ApplicationTimelineEventType.OFFER_CREATED, actor, {
        offerId: offer.id,
        version: 1,
        salaryAmount: dto.salaryAmount,
        currency: dto.currency.toUpperCase(),
      });
      return tx.jobOffer.findUniqueOrThrow({ where: { id: offer.id }, include: offerInclude });
    });
  }

  async revise(tenantId: string, actor: JwtPayload, offerId: string, dto: CreateJobOfferDto) {
    const offer = await this.getStaffOffer(tenantId, actor, offerId);
    if (['ACCEPTED', 'CANCELLED'].includes(offer.status)) {
      throw new ConflictException('La oferta ya no admite nuevas versiones');
    }
    this.validateDates(dto.employmentStartDate, dto.validUntil);
    const nextVersion = offer.currentVersion + 1;
    return this.prisma.$transaction(async (tx) => {
      await tx.jobOffer.update({
        where: { id: offer.id },
        data: {
          status: JobOfferStatus.PENDING_APPROVAL,
          currentVersion: nextVersion,
          financialApproverId: dto.financialApproverId ?? offer.financialApproverId,
          managerialApproverId: dto.managerialApproverId ?? offer.managerialApproverId,
          conversionError: null,
        },
      });
      await tx.jobOfferVersion.create({
        data: { offerId: offer.id, ...this.versionData(tenantId, nextVersion, JobOfferVersionSource.EMPLOYER, actor.sub, dto) },
      });
      await tx.jobOfferApproval.createMany({ data: [
        { tenantId, offerId: offer.id, version: nextVersion, type: JobOfferApprovalType.FINANCIAL, approverId: dto.financialApproverId ?? offer.financialApproverId },
        { tenantId, offerId: offer.id, version: nextVersion, type: JobOfferApprovalType.MANAGERIAL, approverId: dto.managerialApproverId ?? offer.managerialApproverId },
      ] });
      await this.timeline(tx, offer.application, ApplicationTimelineEventType.OFFER_CREATED, actor, { offerId, version: nextVersion, revision: true });
      return tx.jobOffer.findUniqueOrThrow({ where: { id: offer.id }, include: offerInclude });
    });
  }

  async decideApproval(tenantId: string, actor: JwtPayload, offerId: string, dto: DecideJobOfferApprovalDto) {
    const offer = await this.getStaffOffer(tenantId, actor, offerId);
    if (offer.status !== JobOfferStatus.PENDING_APPROVAL) throw new ConflictException('La oferta no está pendiente de aprobación');
    const approval = offer.approvals.find((item) => item.version === offer.currentVersion && item.type === dto.type);
    if (!approval) throw new NotFoundException('Aprobación no encontrada');
    if (approval.approverId && approval.approverId !== actor.sub && !actor.isSuperAdmin) {
      throw new ForbiddenException('La aprobación está asignada a otro usuario');
    }
    const status = dto.approved ? JobOfferApprovalStatus.APPROVED : JobOfferApprovalStatus.REJECTED;
    return this.prisma.$transaction(async (tx) => {
      await tx.jobOfferApproval.update({
        where: { id: approval.id },
        data: { status, decidedById: actor.sub, notes: dto.notes?.trim(), decidedAt: new Date() },
      });
      const pendingOrRejected = await tx.jobOfferApproval.findMany({ where: { offerId, version: offer.currentVersion } });
      const allApproved = dto.approved && pendingOrRejected.every((item) => item.id === approval.id || item.status === JobOfferApprovalStatus.APPROVED);
      await tx.jobOffer.update({
        where: { id: offerId },
        data: { status: dto.approved ? (allApproved ? JobOfferStatus.APPROVED : JobOfferStatus.PENDING_APPROVAL) : JobOfferStatus.DRAFT },
      });
      if (allApproved) await this.timeline(tx, offer.application, ApplicationTimelineEventType.OFFER_APPROVED, actor, { offerId, version: offer.currentVersion });
      return tx.jobOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    });
  }

  async send(tenantId: string, actor: JwtPayload, offerId: string) {
    const offer = await this.getStaffOffer(tenantId, actor, offerId);
    if (offer.status !== JobOfferStatus.APPROVED) throw new ConflictException('La oferta requiere ambas aprobaciones antes de enviarse');
    const version = this.currentVersion(offer);
    if (version.validUntil.getTime() <= Date.now()) throw new BadRequestException('La vigencia de la oferta ya terminó');
    const pdf = this.pdfFor(offer, version);
    const token = randomBytes(32).toString('base64url');
    const origin = publicFrontendUrl();
    const signingUrl = `${origin}/sign/${token}`;

    return this.prisma.$transaction(async (tx) => {
      const template = await this.offerTemplate(tx, tenantId, actor.sub);
      const signaturePackage = await tx.signaturePackage.create({
        data: {
          tenantId,
          branchId: offer.branchId,
          workflowId: null,
          offerVersionId: version.id,
          templateId: template.id,
          status: SignaturePackageStatus.PENDING,
          title: `Oferta laboral - ${offer.application.vacancy.title}`,
          externalProvider: 'INTERNAL',
          dueDate: version.validUntil,
          sentAt: new Date(),
          metadata: { offerId, offerVersion: version.version, pdfSha256: jobOfferPdfHash(pdf) },
          participants: { create: {
            tenantId,
            email: offer.application.candidate.email.toLowerCase(),
            fullName: offer.application.candidate.fullName,
            roleLabel: 'Candidato',
            signingTokenHash: this.hash(token),
            tokenExpiresAt: version.validUntil,
            consentVersion: `offer:${version.id}`,
          } },
          auditEvents: { create: { tenantId, actorId: actor.sub, action: 'OFFER_SENT', outcome: 'SUCCESS', evidence: { offerId, version: version.version, pdfSha256: jobOfferPdfHash(pdf) } } },
        },
      });
      await tx.jobOfferVersion.update({ where: { id: version.id }, data: { pdfSha256: jobOfferPdfHash(pdf), pdfGeneratedAt: new Date() } });
      await tx.jobOffer.update({ where: { id: offerId }, data: { status: JobOfferStatus.SENT } });
      await this.communications.enqueueEvent(tx, {
        tenantId,
        applicationId: offer.applicationId,
        type: 'OFFER',
        audiences: ['CANDIDATE', 'RESPONSIBLE'],
        deduplicationSuffix: `structured:${offerId}:v${version.version}`,
        actorType: 'USER',
        actorId: actor.sub,
        variables: { offerMessage: `${version.message ?? ''}\nRevisa y firma tu oferta: ${signingUrl}` },
        overrideBody: `${version.message ?? 'Hemos preparado una oferta laboral para ti.'}\n\nRevisa y firma tu oferta: ${signingUrl}`,
      });
      await this.timeline(tx, offer.application, ApplicationTimelineEventType.OFFER_SENT, actor, { offerId, version: version.version, signaturePackageId: signaturePackage.id });
      return tx.jobOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    });
  }

  async cancel(tenantId: string, actor: JwtPayload, offerId: string, reason?: string) {
    const offer = await this.getStaffOffer(tenantId, actor, offerId);
    if (offer.status === JobOfferStatus.ACCEPTED) throw new ConflictException('Una oferta aceptada no puede cancelarse');
    await this.prisma.$transaction(async (tx) => {
      await tx.jobOffer.update({ where: { id: offerId }, data: { status: JobOfferStatus.CANCELLED, cancelledAt: new Date(), conversionError: reason?.trim() } });
      await tx.signaturePackage.updateMany({ where: { offerVersionId: { in: offer.versions.map((item) => item.id) } }, data: { status: SignaturePackageStatus.CANCELLED } });
    });
    return { cancelled: true };
  }

  async pdfForStaff(tenantId: string, actor: JwtPayload, offerId: string, versionNumber?: number) {
    const offer = await this.getStaffOffer(tenantId, actor, offerId);
    return this.pdfResult(offer, versionNumber);
  }

  async listForCandidate(accountId: string) {
    await this.expireOffers({ application: { candidate: { accountId } } });
    const offers = await this.prisma.jobOffer.findMany({
      where: { application: { candidate: { accountId } } },
      include: offerInclude,
      orderBy: { createdAt: 'desc' },
    });
    return offers.filter((offer) => offer.status !== JobOfferStatus.DRAFT && offer.status !== JobOfferStatus.PENDING_APPROVAL);
  }

  async candidatePdf(accountId: string, offerId: string, versionNumber?: number) {
    const offer = await this.getCandidateOffer(accountId, offerId);
    return this.pdfResult(offer, versionNumber);
  }

  async candidateSigningLink(accountId: string, offerId: string) {
    const offer = await this.getCandidateOffer(accountId, offerId);
    await this.assertCandidateCanRespond(offer);
    const version = this.currentVersion(offer);
    const participant = version.signaturePackage?.participants[0];
    if (!participant) throw new NotFoundException('La oferta no tiene una solicitud de firma asociada');
    const token = randomBytes(32).toString('base64url');
    await this.prisma.signatureParticipant.update({
      where: { id: participant.id },
      data: { signingTokenHash: this.hash(token), tokenExpiresAt: version.validUntil },
    });
    const origin = publicFrontendUrl();
    return { url: `${origin}/sign/${token}`, expiresAt: version.validUntil.toISOString() };
  }

  async candidateRespond(accountId: string, offerId: string, dto: RespondJobOfferDto) {
    const offer = await this.getCandidateOffer(accountId, offerId);
    await this.assertCandidateCanRespond(offer);
    if (dto.decision === CandidateOfferDecision.ACCEPT) {
      if (!dto.consentAccepted || dto.typedName?.trim().toLocaleLowerCase() !== offer.application.candidate.fullName.trim().toLocaleLowerCase()) {
        throw new BadRequestException('La aceptación requiere consentimiento y el nombre completo del candidato');
      }
      throw new BadRequestException('La aceptación debe completarse mediante la firma electrónica asociada');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.jobOffer.update({ where: { id: offerId }, data: { status: JobOfferStatus.REJECTED, rejectedAt: new Date(), conversionError: dto.reason?.trim() } });
      const version = this.currentVersion(offer);
      if (version.signaturePackage) {
        await tx.signatureParticipant.updateMany({ where: { packageId: version.signaturePackage.id }, data: { status: SignatureParticipantStatus.REJECTED } });
        await tx.signaturePackage.update({ where: { id: version.signaturePackage.id }, data: { status: SignaturePackageStatus.CANCELLED } });
      }
      await this.candidateTimeline(tx, offer, ApplicationTimelineEventType.OFFER_REJECTED, accountId, dto.reason);
    });
    return { rejected: true };
  }

  async counter(accountId: string, offerId: string, dto: CounterJobOfferDto) {
    const offer = await this.getCandidateOffer(accountId, offerId);
    await this.assertCandidateCanRespond(offer);
    const current = this.currentVersion(offer);
    const nextVersion = offer.currentVersion + 1;
    return this.prisma.$transaction(async (tx) => {
      await tx.jobOfferVersion.create({ data: {
        tenantId: offer.tenantId,
        offerId,
        version: nextVersion,
        source: JobOfferVersionSource.CANDIDATE,
        salaryAmount: dto.salaryAmount ?? current.salaryAmount,
        currency: current.currency,
        periodicity: dto.periodicity ?? current.periodicity,
        benefits: current.benefits ?? Prisma.JsonNull,
        jobTitle: current.jobTitle,
        employmentStartDate: dto.employmentStartDate ? new Date(dto.employmentStartDate) : current.employmentStartDate,
        validUntil: current.validUntil,
        message: current.message,
        counterproposalReason: dto.reason.trim(),
      } });
      await tx.jobOffer.update({ where: { id: offerId }, data: { status: JobOfferStatus.COUNTERED, currentVersion: nextVersion } });
      if (current.signaturePackage) await tx.signaturePackage.update({ where: { id: current.signaturePackage.id }, data: { status: SignaturePackageStatus.CANCELLED } });
      await this.candidateTimeline(tx, offer, ApplicationTimelineEventType.OFFER_COUNTERED, accountId, dto.reason, { version: nextVersion });
      return tx.jobOffer.findUniqueOrThrow({ where: { id: offerId }, include: offerInclude });
    });
  }

  async completeSignedOffer(offerVersionId: string) {
    const version = await this.prisma.jobOfferVersion.findUnique({
      where: { id: offerVersionId },
      include: { offer: { include: offerInclude } },
    });
    if (!version || version.offer.currentVersion !== version.version) return;
    const offer = version.offer;
    if (offer.status === JobOfferStatus.ACCEPTED && offer.conversionWorkflowId) return;
    if (offer.status !== JobOfferStatus.ACCEPTED) {
      await this.prisma.$transaction(async (tx) => {
        await tx.jobOffer.update({ where: { id: offer.id }, data: { status: JobOfferStatus.ACCEPTED, acceptedAt: new Date(), conversionError: null } });
        await this.candidateTimeline(tx, offer, ApplicationTimelineEventType.OFFER_ACCEPTED, offer.application.candidate.accountId ?? offer.application.candidateId, undefined, { version: version.version });
      });
    }
    try {
      const workflow = await this.workflows.createHiringWorkflow(offer.tenantId, this.systemActor(offer), {
        applicationId: offer.applicationId,
        candidateId: offer.application.candidateId,
        branchId: offer.branchId,
        employeeName: offer.application.candidate.fullName,
        employeeEmail: offer.application.candidate.email,
        jobTitle: version.jobTitle,
        employmentStartDate: version.employmentStartDate.toISOString(),
        sourceModule: WorkflowSourceModule.ATS,
        metadata: { source: 'accepted-job-offer', offerId: offer.id, offerVersion: version.version },
      });
      await this.prisma.jobOffer.update({ where: { id: offer.id }, data: { conversionWorkflowId: workflow.id, conversionError: null } });
    } catch (error) {
      await this.prisma.jobOffer.update({ where: { id: offer.id }, data: { conversionError: error instanceof Error ? error.message.slice(0, 2000) : 'No fue posible iniciar la conversión automática' } });
    }
  }

  async retryConversion(tenantId: string, actor: JwtPayload, offerId: string) {
    const offer = await this.getStaffOffer(tenantId, actor, offerId);
    if (offer.status !== JobOfferStatus.ACCEPTED) throw new ConflictException('La oferta todavía no fue aceptada');
    const version = this.currentVersion(offer);
    if (version.signaturePackage?.status !== SignaturePackageStatus.COMPLETED) throw new ConflictException('La firma electrónica todavía no está completa');
    await this.completeSignedOffer(version.id);
    return this.getStaffOffer(tenantId, actor, offerId);
  }

  private async getStaffOffer(tenantId: string, actor: JwtPayload, offerId: string) {
    const offer = await this.prisma.jobOffer.findFirst({ where: { id: offerId, tenantId }, include: offerInclude });
    if (!offer) throw new NotFoundException('Oferta no encontrada');
    this.assertBranch(actor, offer.branchId);
    return offer;
  }

  private async getCandidateOffer(accountId: string, offerId: string) {
    const offer = await this.prisma.jobOffer.findFirst({ where: { id: offerId, application: { candidate: { accountId } } }, include: offerInclude });
    if (!offer) throw new NotFoundException('Oferta no encontrada');
    return offer;
  }

  private async assertApplicationAccess(tenantId: string, actor: JwtPayload, applicationId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: applicationId, tenantId },
      include: { candidate: true, vacancy: { include: { tenant: { select: { name: true } }, branch: true } } },
    });
    if (!application) throw new NotFoundException('Postulación no encontrada');
    this.assertBranch(actor, application.vacancy.branchId);
    return application;
  }

  private assertBranch(actor: JwtPayload, branchId: string) {
    if (!actor.isSuperAdmin && actor.scope === AccessScope.BRANCH && !actor.allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('La sucursal está fuera del alcance del usuario');
    }
  }

  private validateDates(start: string, validUntil: string) {
    const startDate = new Date(start);
    const expiration = new Date(validUntil);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(expiration.getTime())) throw new BadRequestException('Las fechas de la oferta no son válidas');
    if (expiration.getTime() <= Date.now()) throw new BadRequestException('La vigencia debe terminar en el futuro');
  }

  private versionData(tenantId: string, version: number, source: JobOfferVersionSource, createdById: string, dto: CreateJobOfferDto) {
    return {
      tenantId,
      version,
      source,
      salaryAmount: dto.salaryAmount,
      currency: dto.currency.toUpperCase(),
      periodicity: dto.periodicity,
      benefits: dto.benefits?.map((item) => item.trim()).filter(Boolean) ?? [],
      jobTitle: dto.jobTitle.trim(),
      employmentStartDate: new Date(dto.employmentStartDate),
      validUntil: new Date(dto.validUntil),
      message: dto.message?.trim(),
      createdById,
    };
  }

  private currentVersion(offer: { currentVersion: number; versions: Array<{ version: number; [key: string]: unknown }> }): any {
    const version = offer.versions.find((item) => item.version === offer.currentVersion);
    if (!version) throw new NotFoundException('Versión vigente de la oferta no encontrada');
    return version;
  }

  private pdfFor(offer: any, version: any) {
    return createJobOfferPdf({
      companyName: offer.application.vacancy.tenant.name,
      candidateName: offer.application.candidate.fullName,
      jobTitle: version.jobTitle,
      salary: `${version.currency} ${version.salaryAmount.toString()}`,
      periodicity: version.periodicity,
      startDate: version.employmentStartDate.toISOString().slice(0, 10),
      validUntil: version.validUntil.toISOString().slice(0, 10),
      benefits: Array.isArray(version.benefits) ? version.benefits.filter((item: unknown): item is string => typeof item === 'string') : [],
      message: version.message,
      version: version.version,
    });
  }

  private pdfResult(offer: any, versionNumber?: number) {
    const version = versionNumber ? offer.versions.find((item: any) => item.version === versionNumber) : this.currentVersion(offer);
    if (!version) throw new NotFoundException('Versión de oferta no encontrada');
    return { buffer: this.pdfFor(offer, version), filename: `oferta-${offer.application.candidate.fullName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-v${version.version}.pdf` };
  }

  private async offerTemplate(tx: Prisma.TransactionClient, tenantId: string, actorId: string) {
    const existing = await tx.signatureTemplate.findFirst({ where: { tenantId, name: 'Oferta laboral', isActive: true }, orderBy: { version: 'desc' } });
    return existing ?? tx.signatureTemplate.create({ data: {
      tenantId,
      name: 'Oferta laboral',
      description: 'Consentimiento asociado a una oferta laboral versionada.',
      provider: 'INTERNAL',
      title: 'Aceptación de oferta laboral',
      content: 'Declaro que revisé el documento PDF de la oferta laboral y acepto sus condiciones.',
      consentText: 'Acepto electrónicamente la versión vigente de esta oferta laboral.',
      createdById: actorId,
    } });
  }

  private async assertCandidateCanRespond(offer: any) {
    if (offer.status !== JobOfferStatus.SENT) throw new ConflictException('La oferta no está disponible para responder');
    const version = this.currentVersion(offer) as any;
    if (version.validUntil.getTime() <= Date.now()) {
      await this.prisma.jobOffer.update({ where: { id: offer.id }, data: { status: JobOfferStatus.EXPIRED, expiredAt: new Date() } });
      throw new ConflictException('La oferta venció');
    }
  }

  private async expireOffers(where: Prisma.JobOfferWhereInput) {
    const candidates = await this.prisma.jobOffer.findMany({
      where: { ...where, status: JobOfferStatus.SENT },
      select: { id: true, tenantId: true, applicationId: true, currentVersion: true, versions: { select: { version: true, validUntil: true } } },
    });
    const now = Date.now();
    const expired = candidates.filter((offer) => offer.versions.find((version) => version.version === offer.currentVersion)?.validUntil.getTime()! <= now);
    if (expired.length) await this.prisma.$transaction(async (tx) => {
      const expiredAt = new Date();
      await tx.jobOffer.updateMany({ where: { id: { in: expired.map((item) => item.id) } }, data: { status: JobOfferStatus.EXPIRED, expiredAt } });
      await tx.applicationTimelineEvent.createMany({ data: expired.map((offer) => ({
        tenantId: offer.tenantId,
        applicationId: offer.applicationId,
        type: ApplicationTimelineEventType.OFFER_EXPIRED,
        occurredAt: expiredAt,
        note: 'Oferta laboral vencida',
        actorType: 'SYSTEM',
        actorDisplayName: 'Sistema',
        newValue: { offerId: offer.id, status: JobOfferStatus.EXPIRED },
        source: 'JOB_OFFER_EXPIRATION',
      })) });
    });
  }

  private async timeline(tx: Prisma.TransactionClient, application: any, type: ApplicationTimelineEventType, actor: JwtPayload, value: Record<string, unknown>) {
    await tx.applicationTimelineEvent.create({ data: {
      tenantId: application.tenantId,
      applicationId: application.id,
      type,
      occurredAt: new Date(),
      note: this.eventLabel(type),
      actorType: 'USER',
      actorId: actor.sub,
      actorDisplayName: [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email,
      newValue: value as Prisma.InputJsonObject,
      source: 'JOB_OFFER',
    } });
  }

  private async candidateTimeline(tx: Prisma.TransactionClient, offer: any, type: ApplicationTimelineEventType, accountId: string, reason?: string, value: Record<string, unknown> = {}) {
    await tx.applicationTimelineEvent.create({ data: {
      tenantId: offer.tenantId,
      applicationId: offer.applicationId,
      type,
      occurredAt: new Date(),
      note: this.eventLabel(type),
      actorType: 'CANDIDATE',
      actorId: accountId,
      actorDisplayName: offer.application.candidate.fullName,
      reason: reason?.trim(),
      newValue: { offerId: offer.id, ...value },
      source: 'CANDIDATE_PORTAL',
    } });
  }

  private eventLabel(type: ApplicationTimelineEventType) {
    return ({
      OFFER_CREATED: 'Oferta laboral creada', OFFER_APPROVED: 'Oferta laboral aprobada', OFFER_SENT: 'Oferta laboral enviada',
      OFFER_COUNTERED: 'Contrapropuesta recibida', OFFER_ACCEPTED: 'Oferta laboral aceptada', OFFER_REJECTED: 'Oferta laboral rechazada', OFFER_EXPIRED: 'Oferta laboral vencida',
    } as Record<string, string>)[type] ?? 'Oferta laboral actualizada';
  }

  private systemActor(offer: any) {
    return {
      sub: offer.createdById,
      userId: offer.createdById,
      tenantId: offer.tenantId,
      activeTenantId: offer.tenantId,
      allowedTenantIds: [offer.tenantId],
      tenantSlug: '', tenantName: offer.application.vacancy.tenant.name,
      email: 'automatizacion@talentos.local', firstName: 'Automatización', lastName: 'ATS',
      role: null, scope: AccessScope.TENANT, isSuperAdmin: false, roleScope: 'TENANT',
      allowedBranchIds: [offer.branchId], activeBranchId: offer.branchId, roles: [], permissions: [], enabledModules: [], isGlobalContext: false,
      impersonation: { active: false, tenantId: null, startedAt: null, reason: null },
      subscriptionStatus: 'ACTIVE', subscriptionGraceEndsAt: null,
    } as unknown as JwtPayload;
  }

  private hash(value: string) { return createHash('sha256').update(value).digest('hex'); }
}
