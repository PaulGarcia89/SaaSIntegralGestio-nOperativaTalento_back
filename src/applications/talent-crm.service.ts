import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AtsCommunicationAudience, AtsCommunicationType, CandidateCrmStatus, Prisma, TalentActivityType, TalentCampaignStatus, TalentRecipientStatus, TalentSequenceEnrollmentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AtsCommunicationsService } from '../ats-communications/ats-communications.service';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import {
  CreateTalentActivityDto,
  CreateTalentPoolDto,
  CreateTalentTagDto,
  ListDuplicateCandidatesDto,
  ListTalentCandidatesDto,
  MergeCandidatesDto,
  UpdateTalentCandidateDto,
  UpdateTalentPoolDto,
  CreateTalentCampaignDto,
  CreateTalentSegmentDto,
  CreateTalentSequenceDto,
  EnrollTalentSequenceDto,
  TalentSegmentFiltersDto,
} from './dto/talent-crm.dto';

const crmCandidateInclude = {
  applications: {
    include: {
      vacancy: { select: { id: true, title: true, branchId: true, branch: { select: { id: true, name: true } } } },
      currentStage: { select: { id: true, code: true, name: true } },
    },
    orderBy: { appliedAt: 'desc' as const },
  },
  talentTagAssignments: { include: { tag: true }, orderBy: { addedAt: 'asc' as const } },
  talentPoolMemberships: { include: { pool: true }, orderBy: { addedAt: 'asc' as const } },
  talentActivities: { orderBy: { createdAt: 'desc' as const }, take: 25 },
  resumeFiles: {
    where: { status: 'ACTIVE' as const },
    select: { id: true, version: true, originalName: true, sha256: true },
    orderBy: { version: 'desc' as const },
    take: 1,
  },
  sourceMergeAudits: { orderBy: { createdAt: 'desc' as const }, take: 10 },
  targetMergeAudits: { orderBy: { createdAt: 'desc' as const }, take: 10 },
} satisfies Prisma.CandidateInclude;

@Injectable()
export class TalentCrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly communications: AtsCommunicationsService,
  ) {}

  async listCandidates(actor: JwtPayload, tenantId: string, query: ListTalentCandidatesDto) {
    const pagination = normalizeOffsetPagination(query);
    const where = this.candidateWhere(actor, tenantId, query.branchId, {
      ...(query.search ? {
        OR: [
          { fullName: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search } },
          { city: { contains: query.search, mode: 'insensitive' } },
        ],
      } : {}),
      ...(query.poolId ? { talentPoolMemberships: { some: { poolId: query.poolId } } } : {}),
      ...(query.tagId ? { talentTagAssignments: { some: { tagId: query.tagId } } } : {}),
      ...(query.doNotContact !== undefined ? { doNotContact: query.doNotContact } : {}),
    });
    const [data, total] = await this.prisma.$transaction([
      this.prisma.candidate.findMany({ where, include: crmCandidateInclude, orderBy: { updatedAt: 'desc' }, skip: pagination.skip, take: pagination.pageSize }),
      this.prisma.candidate.count({ where }),
    ]);
    return {
      data: data.map((candidate) => this.serialize(candidate)),
      meta: { total, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.ceil(total / pagination.pageSize) },
    };
  }

  async getCandidate(actor: JwtPayload, tenantId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: this.candidateWhere(actor, tenantId, undefined, { id: candidateId }),
      include: crmCandidateInclude,
    });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return this.serialize(candidate);
  }

  async updateCandidate(actor: JwtPayload, tenantId: string, candidateId: string, dto: UpdateTalentCandidateDto) {
    const current = await this.assertCandidate(actor, tenantId, candidateId);
    const candidate = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.candidate.update({
        where: { id: current.id },
        data: {
          fullName: dto.fullName?.trim(), phone: dto.phone?.trim(), city: dto.city?.trim(),
          linkedinUrl: dto.linkedinUrl?.trim(), portfolioUrl: dto.portfolioUrl?.trim(),
          source: dto.source?.trim(), doNotContact: dto.doNotContact,
        },
        include: crmCandidateInclude,
      });
      await tx.talentActivity.create({
        data: { tenantId, candidateId, actorId: actor.sub, type: TalentActivityType.STATUS_CHANGE, subject: 'Perfil CRM actualizado', metadata: this.json({ previous: { doNotContact: current.doNotContact, source: current.source }, next: dto }) },
      });
      return updated;
    });
    return this.serialize(candidate);
  }

  listPools(actor: JwtPayload, tenantId: string) {
    const memberScope = this.applicationScope(actor);
    return this.prisma.talentPool.findMany({
      where: { tenantId, ...(this.poolBranchWhere(actor)) },
      include: { branch: { select: { id: true, name: true } }, members: { where: { candidate: { applications: { some: memberScope } } }, select: { candidateId: true } } },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    }).then((items) => items.map(({ members, ...pool }) => ({ ...pool, memberCount: members.length })));
  }

  async createPool(actor: JwtPayload, tenantId: string, dto: CreateTalentPoolDto) {
    if (dto.branchId) await this.assertBranch(actor, tenantId, dto.branchId);
    return this.prisma.talentPool.create({ data: { tenantId, branchId: dto.branchId, name: dto.name.trim(), description: dto.description?.trim(), color: dto.color, createdById: actor.sub } });
  }

  async updatePool(actor: JwtPayload, tenantId: string, poolId: string, dto: UpdateTalentPoolDto) {
    await this.assertPool(actor, tenantId, poolId);
    return this.prisma.talentPool.update({ where: { id: poolId }, data: { name: dto.name?.trim(), description: dto.description?.trim(), color: dto.color, isActive: dto.isActive } });
  }

  async addPoolMember(actor: JwtPayload, tenantId: string, poolId: string, candidateId: string) {
    await Promise.all([this.assertPool(actor, tenantId, poolId), this.assertCandidate(actor, tenantId, candidateId)]);
    await this.prisma.$transaction(async (tx) => {
      await tx.talentPoolMember.upsert({ where: { poolId_candidateId: { poolId, candidateId } }, update: {}, create: { tenantId, poolId, candidateId, addedById: actor.sub } });
      await tx.talentActivity.create({ data: { tenantId, candidateId, actorId: actor.sub, type: TalentActivityType.POOL_CHANGE, subject: 'Candidato agregado a un pool', metadata: { poolId } } });
    });
    return { added: true };
  }

  async removePoolMember(actor: JwtPayload, tenantId: string, poolId: string, candidateId: string) {
    await Promise.all([this.assertPool(actor, tenantId, poolId), this.assertCandidate(actor, tenantId, candidateId)]);
    await this.prisma.$transaction([
      this.prisma.talentPoolMember.deleteMany({ where: { tenantId, poolId, candidateId } }),
      this.prisma.talentActivity.create({ data: { tenantId, candidateId, actorId: actor.sub, type: TalentActivityType.POOL_CHANGE, subject: 'Candidato retirado de un pool', metadata: { poolId } } }),
    ]);
    return { removed: true };
  }

  listTags(tenantId: string) {
    return this.prisma.talentTag.findMany({ where: { tenantId }, include: { _count: { select: { candidates: true } } }, orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  }

  createTag(actor: JwtPayload, tenantId: string, dto: CreateTalentTagDto) {
    return this.prisma.talentTag.create({ data: { tenantId, name: dto.name.trim(), color: dto.color } });
  }

  async addTag(actor: JwtPayload, tenantId: string, candidateId: string, tagId: string) {
    await this.assertCandidate(actor, tenantId, candidateId);
    const tag = await this.prisma.talentTag.findFirst({ where: { id: tagId, tenantId, isActive: true } });
    if (!tag) throw new NotFoundException('Talent tag not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.candidateTalentTag.upsert({ where: { candidateId_tagId: { candidateId, tagId } }, update: {}, create: { tenantId, candidateId, tagId, addedById: actor.sub } });
      await tx.talentActivity.create({ data: { tenantId, candidateId, actorId: actor.sub, type: TalentActivityType.TAG_CHANGE, subject: `Etiqueta agregada: ${tag.name}`, metadata: { tagId } } });
    });
    return { added: true };
  }

  async removeTag(actor: JwtPayload, tenantId: string, candidateId: string, tagId: string) {
    await this.assertCandidate(actor, tenantId, candidateId);
    await this.prisma.candidateTalentTag.deleteMany({ where: { tenantId, candidateId, tagId } });
    return { removed: true };
  }

  async createActivity(actor: JwtPayload, tenantId: string, candidateId: string, dto: CreateTalentActivityDto) {
    await this.assertCandidate(actor, tenantId, candidateId);
    return this.prisma.talentActivity.create({ data: { tenantId, candidateId, actorId: actor.sub, type: dto.type, subject: dto.subject.trim(), description: dto.description?.trim(), dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, completedAt: dto.completed ? new Date() : undefined } });
  }

  async findDuplicates(actor: JwtPayload, tenantId: string, query: ListDuplicateCandidatesDto) {
    const candidates = await this.prisma.candidate.findMany({
      where: this.candidateWhere(actor, tenantId),
      select: { id: true, fullName: true, email: true, phone: true, city: true, linkedinUrl: true, updatedAt: true, resumeFiles: { where: { status: 'ACTIVE' }, select: { sha256: true }, take: 1 }, applications: { select: { vacancyId: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
    const minimumScore = query.minimumScore ?? 45;
    const sharedIdentityKeys = this.sharedIdentityKeys(candidates);
    const matches: Array<Record<string, unknown>> = [];
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const left = candidates[leftIndex];
        const right = candidates[rightIndex];
        const signals = this.matchSignals(left, right, sharedIdentityKeys);
        const score = Math.min(100, signals.reduce((total, signal) => total + signal.weight, 0));
        if (score < minimumScore) continue;
        const leftVacancies = new Set(left.applications.map((item) => item.vacancyId));
        matches.push({
          id: `${left.id}:${right.id}`, score, signals: signals.map(({ label }) => label),
          source: this.duplicateCandidate(left), target: this.duplicateCandidate(right),
          conflictingVacancyIds: right.applications.map((item) => item.vacancyId).filter((id) => leftVacancies.has(id)),
        });
      }
    }
    matches.sort((a, b) => Number(b.score) - Number(a.score));
    return {
      data: matches.slice(0, query.limit ?? 100),
      scannedCandidates: candidates.length,
      truncated: candidates.length === 1000,
      ignoredSharedValues: sharedIdentityKeys.size,
    };
  }

  async mergeCandidates(actor: JwtPayload, tenantId: string, dto: MergeCandidatesDto) {
    if (dto.sourceCandidateId === dto.targetCandidateId) throw new BadRequestException('Source and target candidates must be different');
    const [source, target] = await Promise.all([
      this.assertCandidate(actor, tenantId, dto.sourceCandidateId),
      this.assertCandidate(actor, tenantId, dto.targetCandidateId),
    ]);
    const sourceApplications = await this.prisma.vacancyApplication.findMany({ where: { candidateId: source.id }, select: { id: true, vacancyId: true } });
    const targetApplications = await this.prisma.vacancyApplication.findMany({ where: { candidateId: target.id }, select: { vacancyId: true } });
    const targetVacancies = new Set(targetApplications.map((item) => item.vacancyId));
    const conflictingVacancyIds = sourceApplications.map((item) => item.vacancyId).filter((id) => targetVacancies.has(id));
    if (conflictingVacancyIds.length) throw new BadRequestException({ message: 'Candidates have applications for the same vacancy', conflictingVacancyIds });

    return this.prisma.$transaction(async (tx) => {
      const sourceFiles = await tx.candidateResumeFile.findMany({ where: { candidateId: source.id }, orderBy: { version: 'asc' } });
      const latestTargetVersion = await tx.candidateResumeFile.aggregate({ where: { candidateId: target.id }, _max: { version: true } });
      for (const [index, file] of sourceFiles.entries()) {
        await tx.candidateResumeFile.update({ where: { id: file.id }, data: { candidateId: target.id, version: (latestTargetVersion._max.version ?? 0) + index + 1 } });
      }
      const [sourceTags, sourcePools] = await Promise.all([
        tx.candidateTalentTag.findMany({ where: { candidateId: source.id } }),
        tx.talentPoolMember.findMany({ where: { candidateId: source.id } }),
      ]);
      if (sourceTags.length) await tx.candidateTalentTag.createMany({ data: sourceTags.map((item) => ({ tenantId, candidateId: target.id, tagId: item.tagId, addedById: actor.sub })), skipDuplicates: true });
      if (sourcePools.length) await tx.talentPoolMember.createMany({ data: sourcePools.map((item) => ({ tenantId, candidateId: target.id, poolId: item.poolId, addedById: actor.sub })), skipDuplicates: true });
      await tx.candidateTalentTag.deleteMany({ where: { candidateId: source.id } });
      await tx.talentPoolMember.deleteMany({ where: { candidateId: source.id } });
      await tx.talentActivity.updateMany({ where: { candidateId: source.id }, data: { candidateId: target.id } });
      await tx.vacancyApplication.updateMany({ where: { candidateId: source.id }, data: { candidateId: target.id } });
      await tx.candidate.update({ where: { id: target.id }, data: { phone: target.phone || source.phone, city: target.city || source.city, linkedinUrl: target.linkedinUrl || source.linkedinUrl, portfolioUrl: target.portfolioUrl || source.portfolioUrl, source: target.source || source.source, accountId: target.accountId || source.accountId } });
      await tx.candidate.update({ where: { id: source.id }, data: { crmStatus: CandidateCrmStatus.MERGED, mergedIntoId: target.id, mergedAt: new Date() } });
      const audit = await tx.candidateMergeAudit.create({ data: { tenantId, sourceCandidateId: source.id, targetCandidateId: target.id, actorId: actor.sub, reason: dto.reason.trim(), sourceSnapshot: this.json(source), targetSnapshot: this.json(target), movedApplications: sourceApplications.length, movedFiles: sourceFiles.length } });
      await tx.talentActivity.create({ data: { tenantId, candidateId: target.id, actorId: actor.sub, type: TalentActivityType.MERGE, subject: `Perfil fusionado con ${source.fullName}`, description: dto.reason.trim(), metadata: { auditId: audit.id, sourceCandidateId: source.id, movedApplications: sourceApplications.length, movedFiles: sourceFiles.length } } });
      return { auditId: audit.id, sourceCandidateId: source.id, targetCandidateId: target.id, movedApplications: sourceApplications.length, movedFiles: sourceFiles.length };
    });
  }

  async listSegments(actor: JwtPayload, tenantId: string) {
    const segments = await this.prisma.talentSegment.findMany({ where: { tenantId }, orderBy: { updatedAt: 'desc' } });
    return Promise.all(segments.map(async (segment) => ({ ...segment, candidateCount: await this.prisma.candidate.count({ where: this.segmentWhere(actor, tenantId, segment.filters) }) })));
  }

  async createSegment(actor: JwtPayload, tenantId: string, dto: CreateTalentSegmentDto) {
    this.segmentWhere(actor, tenantId, dto.filters);
    return this.prisma.talentSegment.create({ data: { tenantId, name: dto.name.trim(), description: dto.description?.trim(), filters: this.json(dto.filters), createdById: actor.sub } });
  }

  async previewSegment(actor: JwtPayload, tenantId: string, segmentId: string) {
    const segment = await this.assertSegment(tenantId, segmentId);
    const where = this.segmentWhere(actor, tenantId, segment.filters);
    const [total, candidates] = await this.prisma.$transaction([this.prisma.candidate.count({ where }), this.prisma.candidate.findMany({ where, select: { id: true, fullName: true, email: true, city: true }, take: 20, orderBy: { updatedAt: 'desc' } })]);
    return { segmentId, total, candidates };
  }

  async rediscoverCandidates(actor: JwtPayload, tenantId: string, filters: TalentSegmentFiltersDto) {
    const candidates = await this.prisma.candidate.findMany({ where: { ...this.segmentWhere(actor, tenantId, filters), applications: { some: { status: { in: ['REJECTED', 'WITHDRAWN'] } } } }, include: { talentTagAssignments: { include: { tag: true } }, applications: { include: { vacancy: { select: { title: true } } }, orderBy: { appliedAt: 'desc' }, take: 1 }, talentActivities: { orderBy: { createdAt: 'desc' }, take: 1 } }, take: 100, orderBy: { updatedAt: 'desc' } });
    return candidates.map((candidate) => ({ id: candidate.id, fullName: candidate.fullName, email: candidate.email, city: candidate.city, competencies: candidate.talentTagAssignments.map((item) => item.tag.name), lastProcess: candidate.applications[0]?.vacancy.title ?? null, lastContactAt: candidate.talentActivities[0]?.createdAt ?? null, reason: 'Perfil con experiencia previa disponible para revisión.' }));
  }

  listCampaigns(actor: JwtPayload, tenantId: string) {
    return this.prisma.talentCampaign.findMany({ where: { tenantId }, include: { segment: true, _count: { select: { recipients: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async createCampaign(actor: JwtPayload, tenantId: string, dto: CreateTalentCampaignDto) {
    await this.assertSegment(tenantId, dto.segmentId);
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    return this.prisma.talentCampaign.create({ data: { tenantId, segmentId: dto.segmentId, name: dto.name.trim(), subject: dto.subject.trim(), body: dto.body.trim(), scheduledAt, status: scheduledAt ? 'SCHEDULED' : 'DRAFT', createdById: actor.sub } });
  }

  async launchCampaign(actor: JwtPayload, tenantId: string, campaignId: string) {
    const campaign = await this.prisma.talentCampaign.findFirst({ where: { id: campaignId, tenantId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    throw new BadRequestException('La campaña requiere revisión y autorización de entrega antes de enviar correos externos.');
  }

  async campaignMetrics(actor: JwtPayload, tenantId: string, campaignId: string) {
    const campaign = await this.prisma.talentCampaign.findFirst({ where: { id: campaignId, tenantId }, include: { recipients: { include: { message: { include: { notification: { include: { deliveries: true } } } } } } } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const queued = campaign.recipients.filter((item) => item.status === 'QUEUED').length;
    const delivered = campaign.recipients.filter((item) => item.message?.notification?.deliveries.some((delivery) => delivery.deliveredAt)).length;
    return { campaignId, audience: campaign.recipients.length, queued, delivered, deliveryRate: queued ? Number((delivered / queued * 100).toFixed(1)) : 0, conversionRate: 0 };
  }

  listSequences(actor: JwtPayload, tenantId: string) {
    return this.prisma.talentSequence.findMany({ where: { tenantId }, include: { segment: true, steps: { orderBy: { position: 'asc' } }, _count: { select: { enrollments: true } } }, orderBy: { updatedAt: 'desc' } });
  }

  async createSequence(actor: JwtPayload, tenantId: string, dto: CreateTalentSequenceDto) {
    if (dto.steps.length !== dto.stepCount) throw new BadRequestException('El número de pasos no coincide con la secuencia');
    if (dto.segmentId) await this.assertSegment(tenantId, dto.segmentId);
    return this.prisma.talentSequence.create({ data: { tenantId, segmentId: dto.segmentId, name: dto.name.trim(), description: dto.description?.trim(), createdById: actor.sub, steps: { create: dto.steps.map((step, position) => ({ position, delayHours: step.delayHours, subject: step.subject.trim(), body: step.body.trim() })) } }, include: { steps: { orderBy: { position: 'asc' } } } });
  }

  async enrollSequence(actor: JwtPayload, tenantId: string, sequenceId: string, dto: EnrollTalentSequenceDto) {
    const sequence = await this.prisma.talentSequence.findFirst({ where: { id: sequenceId, tenantId, isActive: true }, include: { steps: { orderBy: { position: 'asc' } } } });
    if (!sequence) throw new NotFoundException('Sequence not found');
    if (!sequence.steps.length) throw new BadRequestException('La secuencia no tiene pasos');
    if (!dto.candidateId && !dto.segmentId && !sequence.segmentId) throw new BadRequestException('Selecciona un segmento o candidato');
    const candidates = dto.candidateId ? [await this.assertCandidate(actor, tenantId, dto.candidateId)] : await this.prisma.candidate.findMany({ where: this.segmentWhere(actor, tenantId, (await this.assertSegment(tenantId, dto.segmentId ?? sequence.segmentId!)).filters), select: { id: true } });
    await this.prisma.talentSequenceEnrollment.createMany({ data: candidates.map((candidate) => ({ tenantId, sequenceId, candidateId: candidate.id, nextRunAt: new Date(Date.now() + sequence.steps[0].delayHours * 3_600_000) })), skipDuplicates: true });
    return { enrolled: candidates.length, status: 'PENDING_DELIVERY_AUTHORIZATION' };
  }

  private segmentWhere(actor: JwtPayload, tenantId: string, filters: Prisma.JsonValue | TalentSegmentFiltersDto): Prisma.CandidateWhereInput {
    const input = (filters ?? {}) as TalentSegmentFiltersDto;
    return { ...this.candidateWhere(actor, tenantId, input.branchId), ...(input.search ? { OR: [{ fullName: { contains: input.search, mode: 'insensitive' } }, { email: { contains: input.search, mode: 'insensitive' } }, { city: { contains: input.search, mode: 'insensitive' } }] } : {}), ...(input.poolId ? { talentPoolMemberships: { some: { poolId: input.poolId } } } : {}), ...(input.tagId ? { talentTagAssignments: { some: { tagId: input.tagId } } } : {}), ...(input.competency ? { talentTagAssignments: { some: { tag: { name: { contains: input.competency, mode: 'insensitive' } } } } } : {}), ...(input.source ? { source: { contains: input.source, mode: 'insensitive' } } : {}), ...(input.doNotContact !== undefined ? { doNotContact: input.doNotContact } : { doNotContact: false }) };
  }

  private async assertSegment(tenantId: string, segmentId: string) {
    const segment = await this.prisma.talentSegment.findFirst({ where: { id: segmentId, tenantId, isActive: true } });
    if (!segment) throw new NotFoundException('Segment not found');
    return segment;
  }

  private candidateWhere(actor: JwtPayload, tenantId: string, branchId?: string, extra: Prisma.CandidateWhereInput = {}): Prisma.CandidateWhereInput {
    if (branchId && actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin && !actor.allowedBranchIds.includes(branchId)) throw new NotFoundException('Branch not found');
    const effectiveBranches = branchId ? [branchId] : actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? actor.allowedBranchIds : null;
    return { tenantId, crmStatus: CandidateCrmStatus.ACTIVE, ...(effectiveBranches ? { applications: { some: { vacancy: { branchId: { in: effectiveBranches.length ? effectiveBranches : ['__no_branch_access__'] } } } } } : {}), ...extra };
  }

  private applicationScope(actor: JwtPayload): Prisma.VacancyApplicationWhereInput {
    return actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { vacancy: { branchId: { in: actor.allowedBranchIds } } } : {};
  }

  private poolBranchWhere(actor: JwtPayload): Prisma.TalentPoolWhereInput {
    return actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { OR: [{ branchId: null }, { branchId: { in: actor.allowedBranchIds } }] } : {};
  }

  private async assertCandidate(actor: JwtPayload, tenantId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({ where: this.candidateWhere(actor, tenantId, undefined, { id: candidateId }) });
    if (!candidate) throw new NotFoundException('Candidate not found');
    return candidate;
  }

  private async assertPool(actor: JwtPayload, tenantId: string, poolId: string) {
    const pool = await this.prisma.talentPool.findFirst({ where: { id: poolId, tenantId, ...this.poolBranchWhere(actor) } });
    if (!pool) throw new NotFoundException('Talent pool not found');
    return pool;
  }

  private async assertBranch(actor: JwtPayload, tenantId: string, branchId: string) {
    if (actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin && !actor.allowedBranchIds.includes(branchId)) throw new NotFoundException('Branch not found');
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException('Branch not found');
  }

  private matchSignals(left: { fullName: string; email: string; phone: string | null; city: string | null; linkedinUrl: string | null; resumeFiles: { sha256: string }[] }, right: { fullName: string; email: string; phone: string | null; city: string | null; linkedinUrl: string | null; resumeFiles: { sha256: string }[] }, sharedIdentityKeys: Set<string>) {
    const signals: Array<{ label: string; weight: number }> = [];
    if (left.email.trim().toLowerCase() === right.email.trim().toLowerCase()) signals.push({ label: 'Correo idéntico', weight: 100 });
    const leftPhone = this.phoneKey(left.phone); const rightPhone = this.phoneKey(right.phone);
    if (leftPhone && leftPhone === rightPhone && !sharedIdentityKeys.has(`phone:${leftPhone}`)) signals.push({ label: 'Teléfono idéntico', weight: 55 });
    const leftLinkedin = this.urlKey(left.linkedinUrl); const rightLinkedin = this.urlKey(right.linkedinUrl);
    if (leftLinkedin && leftLinkedin === rightLinkedin && !sharedIdentityKeys.has(`linkedin:${leftLinkedin}`)) signals.push({ label: 'LinkedIn idéntico', weight: 55 });
    const leftResume = left.resumeFiles[0]?.sha256; const rightResume = right.resumeFiles[0]?.sha256;
    if (leftResume && leftResume === rightResume && !sharedIdentityKeys.has(`resume:${leftResume}`)) signals.push({ label: 'CV idéntico', weight: 75 });
    if (this.textKey(left.fullName) === this.textKey(right.fullName)) signals.push({ label: 'Nombre idéntico', weight: 20 });
    if (left.city && right.city && this.textKey(left.city) === this.textKey(right.city)) signals.push({ label: 'Ciudad idéntica', weight: 10 });
    return signals;
  }

  private sharedIdentityKeys(candidates: Array<{ phone: string | null; linkedinUrl: string | null; resumeFiles: { sha256: string }[] }>) {
    const counts = new Map<string, number>();
    const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
    for (const candidate of candidates) {
      const phone = this.phoneKey(candidate.phone);
      const linkedin = this.urlKey(candidate.linkedinUrl);
      const resume = candidate.resumeFiles[0]?.sha256;
      if (phone) count(`phone:${phone}`);
      if (linkedin) count(`linkedin:${linkedin}`);
      if (resume) count(`resume:${resume}`);
    }
    return new Set(Array.from(counts.entries()).filter(([, occurrences]) => occurrences > 2).map(([key]) => key));
  }

  private duplicateCandidate(candidate: { id: string; fullName: string; email: string; phone: string | null; city: string | null; updatedAt: Date; applications: unknown[] }) {
    return { id: candidate.id, fullName: candidate.fullName, email: candidate.email, phone: candidate.phone, city: candidate.city, applications: candidate.applications.length, updatedAt: candidate.updatedAt };
  }

  private serialize<T extends { talentTagAssignments: Array<{ tag: unknown }>; talentPoolMemberships: Array<{ pool: unknown }>; resumeFiles: unknown[]; sourceMergeAudits: unknown[]; targetMergeAudits: unknown[] }>(candidate: T) {
    const { talentTagAssignments, talentPoolMemberships, sourceMergeAudits, targetMergeAudits, ...rest } = candidate;
    return { ...rest, tags: talentTagAssignments.map((item) => item.tag), pools: talentPoolMemberships.map((item) => item.pool), resumeFile: candidate.resumeFiles[0] ?? null, mergeHistory: [...sourceMergeAudits, ...targetMergeAudits].sort((a, b) => new Date((b as { createdAt: Date }).createdAt).getTime() - new Date((a as { createdAt: Date }).createdAt).getTime()) };
  }

  private phoneKey(value?: string | null) { const digits = value?.replace(/\D/g, '') ?? ''; return digits.length >= 7 ? digits.slice(-10) : ''; }
  private urlKey(value?: string | null) { return value?.trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') ?? ''; }
  private textKey(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
  private json(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
}
