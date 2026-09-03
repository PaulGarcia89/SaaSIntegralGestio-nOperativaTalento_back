import { BadRequestException, ConflictException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, HiringContractDocumentSource, HiringContractDocumentStatus, HiringContractDocumentType, HiringContractPriority, ModuleCode, WorkflowSourceModule, WorkflowStatus, WorkflowType, WorkflowTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateHiringContractDto, UpdateHiringContractDto, ConfigureHiringOfferDto, RequestHiringDocumentsDto, ReviewHiringDocumentDto, CancelHiringContractDto } from './dto/hiring.dto';
import { DocuSealService } from '../signatures/docuseal.service';
import { JobOffersService } from '../job-offers/job-offers.service';
import { HiringProgressResolver } from './hiring-progress.resolver';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

@Injectable()
export class HiringService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly docuSeal: DocuSealService,
    private readonly jobOffers: JobOffersService,
    private readonly progressResolver: HiringProgressResolver,
  ) {}

  async create(tenantId: string, actor: JwtPayload, applicationId: string, dto: CreateHiringContractDto, requestId?: string) {
    const application = await this.prisma.vacancyApplication.findFirst({ where: { id: applicationId, tenantId }, include: { candidate: true, vacancy: { include: { tenant: true, branch: true } }, jobOffers: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!application) this.error('No se encontró la postulación.', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Verifica que la postulación pertenezca a la empresa activa.');
    if (application.status !== ApplicationStatus.APPROVED) this.error('Solo un candidato aprobado puede iniciar una contratación.', ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Aprueba la postulación antes de iniciar la contratación.');
    const existing = await this.prisma.hiringContract.findFirst({ where: { tenantId, applicationId, isActive: true } });
    if (existing) this.error('Ya existe una contratación activa para esta postulación.', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT, 'Abre la contratación existente o cancélala antes de crear otra.');
    const jobOffer = application.jobOffers[0] ?? null;
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.hiringContract.create({ data: { tenantId, companyId: application.vacancy.tenantId, branchId: application.vacancy.branchId, candidateId: application.candidateId, applicationId, vacancyId: application.vacancyId, jobOfferId: jobOffer?.id ?? null, jobOfferVersionId: null, roleTitle: dto.roleTitle?.trim() ?? application.vacancy.title, hiringManagerUserId: dto.hiringManagerUserId ?? null, hrResponsibleUserId: dto.hrResponsibleUserId ?? null, status: 'DATA_REVIEW', currentStage: 'data_review', currentActor: 'HR', nextAction: 'Review candidate and vacancy data', nextActor: 'HR', offerSnapshot: { jobOfferId: jobOffer?.id ?? null, applicationId, vacancyId: application.vacancyId }, isActive: true } });
      await tx.hiringContractStateEvent.create({ data: { tenantId, contractId: contract.id, previousState: null, nextState: 'data_review', action: 'CREATE_CONTRACT', actorUserId: actor.sub, actorRole: actor.role, requestId, changes: { applicationId, vacancyId: application.vacancyId, requestId } } });
      return tx.hiringContract.findUniqueOrThrow({ where: { id: contract.id }, include: this.include() });
    });
  }

  async list(tenantId: string, actor: JwtPayload, query: any) {
    const pagination = normalizeOffsetPagination(query);
    const fromDate = query.fromDate ? this.filterDate(query.fromDate, 'fromDate') : undefined;
    const toDate = query.toDate ? this.filterDate(query.toDate, 'toDate') : undefined;
    const blockedStatuses = ['OFFER_SENT', 'AWAITING_OFFER_RESPONSE', 'DOCUMENTS_PENDING', 'SIGNATURES_PENDING', 'COMPLIANCE_REVIEW'];
    const waitingStatuses = ['OFFER_SENT', 'AWAITING_OFFER_RESPONSE', 'SIGNATURES_PENDING'];
    const attentionStatuses = ['DATA_REVIEW', 'OFFER_PREPARATION', 'DOCUMENTS_PENDING', 'SIGNATURES_PENDING', 'COMPLIANCE_REVIEW', 'READY_TO_HIRE'];
    const statusFilter = query.status
      ?? (query.blocked !== undefined ? (query.blocked ? { in: blockedStatuses } : { notIn: blockedStatuses }) : undefined)
      ?? (query.waitingCandidate !== undefined ? (query.waitingCandidate ? { in: waitingStatuses } : { notIn: waitingStatuses }) : undefined)
      ?? (query.attentionRequired !== undefined ? (query.attentionRequired ? { in: attentionStatuses } : { notIn: attentionStatuses }) : undefined);
    const where: any = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(query.roleTitle ? { roleTitle: { contains: query.roleTitle.trim(), mode: 'insensitive' } } : {}),
      ...(fromDate || toDate ? { createdAt: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {}),
      AND: [
        query.responsibleUserId ? { OR: [{ hiringManagerUserId: query.responsibleUserId }, { hrResponsibleUserId: query.responsibleUserId }] } : undefined,
        query.search ? { OR: [{ roleTitle: { contains: query.search.trim(), mode: 'insensitive' } }, { candidate: { fullName: { contains: query.search.trim(), mode: 'insensitive' } } }, { application: { vacancy: { title: { contains: query.search.trim(), mode: 'insensitive' } } } }] } : undefined,
      ].filter(Boolean),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.hiringContract.findMany({ where, include: this.listInclude(), orderBy: { createdAt: 'desc' }, skip: pagination.skip, take: pagination.pageSize }),
      this.prisma.hiringContract.count({ where }),
    ]);
    const data = rows.map((row: any) => ({ ...row, progress: this.progressResolver.resolve(row) }));
    return { data, meta: { total, page: pagination.page, pageSize: pagination.pageSize } };
  }

  async detail(tenantId: string, actor: JwtPayload, id: string) {
    const contract = await this.prisma.hiringContract.findFirst({ where: { id, tenantId }, include: this.include(true) });
    if (!contract) throw new NotFoundException('Contract not found');
    const progress = this.progressResolver.resolve(contract);
    return { ...contract, progress, nextAction: contract.nextAction ?? progress.nextAction };
  }

  async updateDraft(tenantId: string, actor: JwtPayload, id: string, dto: UpdateHiringContractDto, requestId?: string) {
    const contract = await this.mustGet(tenantId, id);
    if (!['DRAFT', 'DATA_REVIEW'].includes(contract.status)) throw new ConflictException('Contract is not editable');
    const deadlineAt = dto.deadlineAt === null || dto.deadlineAt === '' ? null : dto.deadlineAt ? new Date(dto.deadlineAt) : contract.deadlineAt;
    if (deadlineAt && Number.isNaN(deadlineAt.getTime())) throw new BadRequestException('La fecha límite no es válida.');
    const updated = await this.prisma.hiringContract.update({ where: { id }, data: { roleTitle: dto.roleTitle?.trim() ?? contract.roleTitle, hiringManagerUserId: dto.hiringManagerUserId ?? contract.hiringManagerUserId, hrResponsibleUserId: dto.hrResponsibleUserId ?? contract.hrResponsibleUserId, nextAction: dto.nextAction?.trim() ?? contract.nextAction, nextActor: dto.nextActor?.trim() ?? contract.nextActor, priority: dto.priority ? (dto.priority as HiringContractPriority) : contract.priority, deadlineAt, status: 'DATA_REVIEW', currentStage: 'data_review' } });
    await this.event(tenantId, id, contract.status, updated.status, 'UPDATE_DRAFT', actor, { ...dto, requestId });
    return this.detail(tenantId, actor, id);
  }

  async configureOffer(tenantId: string, actor: JwtPayload, id: string, dto: ConfigureHiringOfferDto) {
    const contract = await this.mustGet(tenantId, id, true);
    if (!contract.applicationId) throw new BadRequestException('Missing application');
    const offer = await this.prisma.jobOffer.findFirst({ where: { id: dto.jobOfferId, tenantId, applicationId: contract.applicationId }, include: { versions: { orderBy: { version: 'desc' }, take: 1 } } });
    if (!offer) throw new NotFoundException('Job offer not found');
    const version = dto.jobOfferVersionId ? await this.prisma.jobOfferVersion.findFirst({ where: { id: dto.jobOfferVersionId, offerId: offer.id, tenantId } }) : offer.versions[0];
    const updated = await this.prisma.hiringContract.update({ where: { id }, data: { jobOfferId: offer.id, jobOfferVersionId: version?.id ?? null, roleTitle: dto.roleTitle?.trim() ?? contract.roleTitle, status: 'OFFER_PREPARATION', currentStage: 'offer_preparation', nextAction: 'Send offer to candidate', nextActor: 'HR' } });
    await this.event(tenantId, id, contract.status, updated.status, 'CONFIGURE_OFFER', actor, { jobOfferId: offer.id, jobOfferVersionId: version?.id ?? null });
    return updated;
  }

  async sendOffer(tenantId: string, actor: JwtPayload, id: string, requestId?: string) {
    const contract = await this.mustGet(tenantId, id, true);
    if (await this.hasRequestEvent(tenantId, id, 'SEND_OFFER', requestId)) return this.detail(tenantId, actor, id);
    if (!contract.jobOfferId) this.error('La oferta todavía no está configurada.', ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Configura una oferta antes de enviarla.');
    const sentOffer = await this.jobOffers.send(tenantId, actor, contract.jobOfferId);
    const signaturePackage = (sentOffer as any).versions?.find((version: any) => version.id === contract.jobOfferVersionId || version.version === (sentOffer as any).currentVersion)?.signaturePackage;
    await this.withIdempotency(tenantId, id, 'SEND_OFFER', requestId, actor, () => this.prisma.$transaction(async (tx) => {
      await tx.hiringContractSignatureRequest.upsert({
        where: { signaturePackageId: signaturePackage?.id ?? `missing-${contract.id}` },
        create: { tenantId, contractId: contract.id, signaturePackageId: signaturePackage?.id ?? null, provider: 'INTERNAL', status: 'PENDING', metadata: { offerId: contract.jobOfferId, offerVersionId: contract.jobOfferVersionId } },
        update: { status: 'PENDING', respondedAt: null, completedAt: null },
      });
      await tx.hiringContract.update({ where: { id: contract.id }, data: { status: 'OFFER_SENT', currentStage: 'offer_sent', nextAction: 'Wait for candidate response', nextActor: 'CANDIDATE', offerSnapshot: { ...((contract.offerSnapshot as Record<string, unknown>) ?? {}), sentAt: new Date().toISOString(), signaturePackageId: signaturePackage?.id ?? null } } });
      await tx.hiringContractStateEvent.create({ data: { tenantId, contractId: contract.id, previousState: contract.status, nextState: 'offer_sent', action: 'SEND_OFFER', actorUserId: actor.sub, actorRole: actor.role, requestId, changes: { jobOfferId: contract.jobOfferId, jobOfferVersionId: contract.jobOfferVersionId, signaturePackageId: signaturePackage?.id ?? null, requestId } } });
    }));
    return this.detail(tenantId, actor, id);
  }

  async respondOffer(tenantId: string, actor: JwtPayload, id: string, accepted: boolean, reason?: string) {
    const contract = await this.mustGet(tenantId, id);
    const status = accepted ? 'OFFER_ACCEPTED' : 'CANCELLED';
    const updated = await this.prisma.hiringContract.update({ where: { id }, data: { status, currentStage: accepted ? 'offer_accepted' : 'cancelled', nextAction: accepted ? 'Request missing documents' : null, nextActor: accepted ? 'HR' : null, cancelledReason: accepted ? contract.cancelledReason : (reason?.trim() ?? null), cancelledAt: accepted ? null : new Date(), isActive: accepted } });
    await this.event(tenantId, id, contract.status, updated.status, accepted ? 'ACCEPT_OFFER' : 'REJECT_OFFER', actor, { reason });
    return this.detail(tenantId, actor, id);
  }

  async requestDocuments(tenantId: string, actor: JwtPayload, id: string, dto: RequestHiringDocumentsDto, requestId?: string) {
    const contract = await this.mustGet(tenantId, id);
    if (requestId) {
      const existing = await this.prisma.hiringContractDocument.findFirst({ where: { tenantId, contractId: id, metadata: { path: ['requestId'], equals: requestId } } });
      if (existing) return existing;
    }
    const type = dto.type as HiringContractDocumentType;
    const source = (dto.source ?? HiringContractDocumentSource.INTERNAL) as HiringContractDocumentSource;
    const version = (await this.prisma.hiringContractDocument.findFirst({ where: { contractId: id, type }, orderBy: { version: 'desc' } }))?.version ?? 0;
    const doc = await this.prisma.hiringContractDocument.create({ data: { tenantId, contractId: id, type, title: dto.title.trim(), required: dto.required ?? true, source, version: version + 1, status: HiringContractDocumentStatus.REQUESTED, metadata: requestId ? { requestId } : undefined } });
    const updated = await this.prisma.hiringContract.update({ where: { id }, data: { status: 'DOCUMENTS_PENDING', currentStage: 'documents_pending', nextAction: 'Collect and review documents', nextActor: 'CANDIDATE' } });
    await this.event(tenantId, id, contract.status, updated.status, 'REQUEST_DOCUMENT', actor, { documentId: doc.id, type, required: doc.required });
    return doc;
  }

  async listDocuments(tenantId: string, id: string) {
    await this.mustGet(tenantId, id);
    return this.prisma.hiringContractDocument.findMany({ where: { tenantId, contractId: id }, orderBy: [{ type: 'asc' }, { version: 'desc' }] });
  }

  async sendDocuments(tenantId: string, actor: JwtPayload, id: string, requestId?: string) {
    const contract = await this.mustGet(tenantId, id, true);
    if (await this.hasRequestEvent(tenantId, id, 'SEND_DOCUMENTS', requestId)) return this.detail(tenantId, actor, id);
    if (!contract.applicationId) this.error('La contratación no tiene una postulación asociada.', ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Vuelve a cargar la contratación desde una postulación válida.');
    const bundle = await this.docuSeal.createHiringBundleForApplication(tenantId, actor.sub, contract.applicationId);
    await this.withIdempotency(tenantId, id, 'SEND_DOCUMENTS', requestId, actor, () => this.prisma.$transaction(async (tx) => {
      await tx.hiringContract.update({ where: { id }, data: { status: 'SIGNATURES_PENDING', currentStage: 'signatures_pending', nextAction: 'Wait for signed documents', nextActor: 'CANDIDATE' } });
      await tx.hiringContractStateEvent.create({ data: { tenantId, contractId: id, previousState: contract.status, nextState: 'signatures_pending', action: 'SEND_DOCUMENTS', actorUserId: actor.sub, actorRole: actor.role, requestId, changes: { requestId } } });
    }));
    return bundle;
  }

  async docusealWebhook(signature: string | undefined, raw: Buffer | string | undefined, payload: any) {
    this.docuSeal.assertWebhookRequest(raw, signature);
    return this.docuSeal.handleWebhook(payload);
  }

  async reviewDocument(tenantId: string, actor: JwtPayload, contractId: string, documentId: string, dto: ReviewHiringDocumentDto) {
    const doc = await this.prisma.hiringContractDocument.findFirst({ where: { id: documentId, contractId, tenantId } });
    if (!doc) throw new NotFoundException('Document not found');
    const status = dto.status as HiringContractDocumentStatus;
    const now = new Date();
    const updated = await this.prisma.hiringContractDocument.update({ where: { id: doc.id }, data: { status, reviewedById: actor.sub, reviewedAt: now, acceptedAt: status === HiringContractDocumentStatus.APPROVED ? now : null, rejectedAt: status === HiringContractDocumentStatus.REJECTED ? now : null, rejectionReason: dto.reason?.trim() ?? null } });
    const contract = await this.mustGet(tenantId, contractId);
    await this.event(tenantId, contractId, contract.status, contract.status, 'REVIEW_DOCUMENT', actor, { documentId, previousStatus: doc.status, nextStatus: status, reason: dto.reason?.trim() });
    return updated;
  }

  async calculateProgress(tenantId: string, id: string) {
    const contract = await this.mustGet(tenantId, id, true);
    return this.progressResolver.resolve(contract);
  }

  async confirm(tenantId: string, actor: JwtPayload, id: string, requestId?: string) {
    const contract = await this.mustGet(tenantId, id, true);
    if (await this.hasRequestEvent(tenantId, id, 'CONFIRM_CONTRACT', requestId)) return contract;
    if (!contract.isActive) this.error('La contratación ya está cerrada.', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT, 'Actualiza el detalle para consultar su resultado.');
    if (!['OFFER_ACCEPTED', 'COMPLIANCE_REVIEW', 'READY_TO_HIRE'].includes(contract.status)) this.error('La oferta debe estar aceptada antes de confirmar la contratación.', ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Completa el envío y la aceptación de la oferta.');
    const missing = await this.prisma.hiringContractDocument.count({ where: { contractId: id, tenantId, required: true, status: { notIn: ['APPROVED', 'SIGNED', 'WAIVED'] } } });
    if (missing > 0) this.error('No puedes confirmar la contratación porque faltan documentos obligatorios.', ErrorCode.RESOURCE_CONFLICT, HttpStatus.CONFLICT, 'Solicita o revisa los documentos pendientes.');
    return this.withIdempotency(tenantId, id, 'CONFIRM_CONTRACT', requestId, actor, () => this.prisma.$transaction(async (tx) => {
      const existingEmployee = await tx.employee.findFirst({ where: { tenantId, sourceCandidateId: contract.candidateId }, select: { id: true } });
      let employeeId = existingEmployee?.id ?? null;
      if (!employeeId) {
        const candidate = await tx.candidate.findFirst({ where: { id: contract.candidateId, tenantId } });
        if (!candidate) throw new NotFoundException('Candidate not found');
        const employee = await tx.employee.create({ data: { tenantId, employeeNumber: `EMP-${Date.now()}`, name: candidate.fullName, email: candidate.email.toLowerCase(), jobTitle: contract.roleTitle ?? contract.application.vacancy.title, sourceCandidateId: candidate.id, status: 'ACTIVE' } });
        employeeId = employee.id;
        await tx.employeeBranch.create({ data: { tenantId, employeeId, branchId: contract.branchId, role: contract.roleTitle ?? contract.application.vacancy.title, isPrimary: true } });
      }
      const contractDocuments = await tx.hiringContractDocument.findMany({ where: { tenantId, contractId: id, employeeDocumentId: null, storageKey: { not: null } } });
      for (const document of contractDocuments) {
        const employeeDocument = await tx.employeeDocument.create({ data: { tenantId, branchId: contract.branchId, employeeId, category: document.type, originalName: document.originalName ?? document.title, storageKey: document.storageKey!, mimeType: document.mimeType ?? 'application/octet-stream', sizeBytes: document.sizeBytes ?? 0, checksum: document.checksum ?? `hiring-${document.id}`, scanStatus: 'CLEAN', status: 'APPROVED', version: document.version, metadata: { source: 'hiring_contract', hiringContractDocumentId: document.id } } });
        await tx.hiringContractDocument.update({ where: { id: document.id }, data: { employeeId, employeeDocumentId: employeeDocument.id } });
      }
      let onboardingFlowId = contract.onboardingFlowId ?? null;
      if (!onboardingFlowId && actor.enabledModules.includes(ModuleCode.ONBOARDING)) {
        onboardingFlowId = await this.createOnboardingForHire(tx, tenantId, actor.sub, contract, employeeId);
      }
      const updated = await tx.hiringContract.update({ where: { id: contract.id }, data: { employeeId, onboardingFlowId, status: 'HIRED', currentStage: 'hired', nextAction: null, nextActor: null, hiredAt: new Date(), isActive: false } });
      await tx.hiringContractStateEvent.create({ data: { tenantId, contractId: id, previousState: contract.status, nextState: 'hired', action: 'CONFIRM_CONTRACT', actorUserId: actor.sub, actorRole: actor.role, requestId, changes: { requestId } } });
      return updated;
    }));
  }

  async cancel(tenantId: string, actor: JwtPayload, id: string, dto: CancelHiringContractDto, requestId?: string) {
    const contract = await this.mustGet(tenantId, id);
    if (await this.hasRequestEvent(tenantId, id, 'CANCEL_CONTRACT', requestId)) return contract;
    const updated = await this.withIdempotency(tenantId, id, 'CANCEL_CONTRACT', requestId, actor, () => this.prisma.$transaction(async (tx) => {
      const result = await tx.hiringContract.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledReason: dto.reason.trim(), isActive: false, currentStage: 'cancelled' } });
      await tx.hiringContractStateEvent.create({ data: { tenantId, contractId: id, previousState: contract.status, nextState: result.status, action: 'CANCEL_CONTRACT', actorUserId: actor.sub, actorRole: actor.role, requestId, reason: dto.reason.trim(), changes: { ...dto, requestId } } });
      return result;
    }));
    return updated;
  }

  async history(tenantId: string, id: string) {
    const events = await this.prisma.hiringContractStateEvent.findMany({ where: { tenantId, contractId: id }, orderBy: { occurredAt: 'asc' } });
    return events.map((event) => ({ ...event, description: this.progressResolver.describeActivity(event) }));
  }

  private include(withHistory = false): any {
    return { candidate: true, branch: true, vacancy: { include: { tenant: true } }, application: { include: { candidate: true, vacancy: true } }, jobOffer: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } }, employee: true, documents: { orderBy: { createdAt: 'desc' } }, signatures: true, ...(withHistory ? { stateHistory: { orderBy: { occurredAt: 'asc' } } } : {}) } as any;
  }

  private listInclude(): any {
    return {
      branch: { select: { id: true, name: true } },
      candidate: { select: { id: true, fullName: true } },
      vacancy: { select: { id: true, title: true } },
      application: { select: { id: true, status: true, vacancyId: true } },
      hiringManagerUser: { select: { id: true, firstName: true, lastName: true } },
      hrResponsibleUser: { select: { id: true, firstName: true, lastName: true } },
      documents: { select: { required: true, status: true } },
      signatures: { select: { status: true } },
      stateHistory: { orderBy: { occurredAt: 'desc' }, take: 1, select: { action: true, occurredAt: true, actorUserId: true } },
    };
  }

  private async mustGet(tenantId: string, id: string, includeRelations = false): Promise<any> {
    const contract = await this.prisma.hiringContract.findFirst({ where: { id, tenantId }, include: this.include(includeRelations) });
    if (!contract) this.error('No se encontró la contratación.', ErrorCode.RESOURCE_NOT_FOUND, HttpStatus.NOT_FOUND, 'Verifica que la contratación pertenezca a la empresa activa.');
    return contract;
  }

  private async event(tenantId: string, contractId: string, previousState: any, nextState: any, action: string, actor: JwtPayload, changes?: any) {
    await this.prisma.hiringContractStateEvent.create({ data: { tenantId, contractId, previousState: String(previousState), nextState: String(nextState), action, actorUserId: actor.sub, actorRole: actor.role, requestId: changes?.requestId, changes } });
  }

  private async hasRequestEvent(tenantId: string, contractId: string, action: string, requestId?: string) {
    if (!requestId) return false;
    return Boolean(await this.prisma.hiringContractStateEvent.findFirst({ where: { tenantId, contractId, action, OR: [{ requestId }, { changes: { path: ['requestId'], equals: requestId } }] }, select: { id: true } }));
  }

  private async withIdempotency<T>(tenantId: string, contractId: string, action: string, requestId: string | undefined, actor: JwtPayload, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: any) {
      if (requestId && error?.code === 'P2002' && await this.hasRequestEvent(tenantId, contractId, action, requestId)) {
        return this.detail(tenantId, actor, contractId) as Promise<T>;
      }
      throw error;
    }
  }

  private error(message: string, code: ErrorCode, status: HttpStatus, suggestedAction: string): never {
    throw new AppException(message, code, status, { details: { suggestedAction, retryable: status >= HttpStatus.INTERNAL_SERVER_ERROR } });
  }

  private filterDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) this.error(`La fecha de ${field} no es válida.`, ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST, 'Usa una fecha ISO válida.');
    return date;
  }

  private async createOnboardingForHire(tx: any, tenantId: string, actorId: string, contract: any, employeeId: string): Promise<string> {
    const template = await tx.onboardingTemplate.findFirst({ where: { tenantId, isActive: true, status: 'PUBLISHED' }, include: { tasks: { orderBy: { sortOrder: 'asc' } } }, orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }] });
    const workflow = await tx.masterWorkflow.create({ data: { tenantId, branchId: contract.branchId, employeeId, candidateId: contract.candidateId, workflowType: WorkflowType.HIRING, status: WorkflowStatus.IN_PROGRESS, triggeredByUserId: actorId, sourceModule: WorkflowSourceModule.HR, metadata: { source: 'guided-hiring', hiringContractId: contract.id, applicationId: contract.applicationId } } });
    const flow = await tx.onboardingFlow.create({ data: { tenantId, branchId: contract.branchId, workflowId: workflow.id, employeeId, candidateId: contract.candidateId, templateId: template?.id ?? null, status: WorkflowTaskStatus.IN_PROGRESS, readinessStatus: 'PENDING', metadata: { source: 'guided-hiring', hiringContractId: contract.id, applicationId: contract.applicationId } } });
    if (template?.tasks.length) await tx.onboardingTask.createMany({ data: template.tasks.map((task: any) => ({ tenantId, branchId: contract.branchId, workflowId: workflow.id, onboardingFlowId: flow.id, employeeId, taskType: task.taskType, title: task.title, taskKey: task.taskKey, description: task.description, ownerType: task.ownerType, ownerId: task.ownerId, required: task.required, sortOrder: task.sortOrder, dependsOnKeys: task.dependsOnKeys, dueDate: task.dueOffsetDays == null ? null : new Date(Date.now() + task.dueOffsetDays * 86400000), metadata: { sourceTemplateId: template.id } })) });
    return flow.id;
  }
}
