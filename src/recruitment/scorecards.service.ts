import {
  Inject,
  Optional,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { forwardRef } from '@nestjs/common';
import {
  DecisionCommitteeRole,
  DecisionCommitteeStatus,
  InterviewRecommendation,
  Prisma,
  ScorecardCriterionType,
  ScorecardFeedbackVisibility,
  ScorecardTemplateScope,
  ScorecardStatus,
  HiringManagerApprovalStatus,
  BiasValidationStatus,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { ApplicationsService } from '../applications/applications.service';
import {
  CreateDecisionCommitteeDto,
  CreateScorecardTemplateDto,
  UpdateScorecardTemplateAdminDto,
  DuplicateScorecardTemplateDto,
  ScorecardCompetencyDto,
  ReplaceScorecardAssignmentsDto,
  CreateExternalAssessmentDto,
  UpdateExternalAssessmentResultDto,
  AssignHiringManagerDto,
  DecideHiringManagerApprovalDto,
  RunBiasValidationDto,
  FinalizeDecisionCommitteeDto,
  SubmitScorecardDto,
  VoteDecisionCommitteeDto,
} from './dto/recruitment.dto';

const templateInclude = {
  stage: true,
  criteria: { orderBy: { sortOrder: 'asc' as const } },
} satisfies Prisma.ScorecardTemplateInclude;

const scorecardInclude = {
  reviewer: { select: { id: true, firstName: true, lastName: true } },
  signedBy: { select: { id: true, firstName: true, lastName: true } },
  template: { select: { id: true, name: true, version: true } },
  responses: {
    include: { criterion: { select: { competencyName: true } } },
    orderBy: { criterion: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.InterviewScorecardInclude;

@Injectable()
export class ScorecardsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => ApplicationsService))
    private readonly applications?: ApplicationsService,
  ) {}

  async listTemplates(
    tenantId: string,
    actor: JwtPayload,
    vacancyId?: string,
    stageId?: string,
  ) {
    if (vacancyId) await this.assertVacancyAccess(tenantId, actor, vacancyId);
    return this.prisma.scorecardTemplate.findMany({
      where: {
        tenantId,
        ...(vacancyId ? { OR: [{ vacancyId }, { scope: ScorecardTemplateScope.TENANT }] } : { scope: ScorecardTemplateScope.TENANT }),
        ...(stageId ? { stageId } : {}),
      },
      include: templateInclude,
      orderBy: [{ stageId: 'asc' }, { version: 'desc' }],
    });
  }

  async createTemplate(
    tenantId: string,
    actor: JwtPayload,
    dto: CreateScorecardTemplateDto,
  ) {
    const scope = dto.scope ?? ScorecardTemplateScope.VACANCY;
    if (scope === ScorecardTemplateScope.VACANCY && !dto.vacancyId) {
      throw new BadRequestException('A vacancy is required for vacancy templates');
    }
    if (dto.vacancyId) await this.assertVacancyAccess(tenantId, actor, dto.vacancyId);
    if (scope === ScorecardTemplateScope.TENANT && dto.stageId) {
      throw new BadRequestException('Shared templates cannot target a vacancy stage');
    }
    if (dto.stageId) {
      const stage = await this.prisma.vacancyStage.findFirst({
        where: {
          id: dto.stageId,
          vacancyId: dto.vacancyId!,
          tenantId,
        },
        select: { id: true },
      });
      if (!stage) throw new BadRequestException('Stage does not belong to the vacancy');
    }
    const keys = dto.criteria.map((item) => item.key.trim().toUpperCase());
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException('Criterion keys must be unique');
    }
    const ratingCriteria = dto.criteria.filter(
      (item) => item.type === ScorecardCriterionType.RATING,
    );
    if (!ratingCriteria.length) {
      throw new BadRequestException('At least one weighted rating criterion is required');
    }
    const ratingWeight = ratingCriteria.reduce((sum, item) => sum + item.weight, 0);
    if (ratingWeight !== 100) {
      throw new BadRequestException('Rating criterion weights must total 100');
    }
    if (dto.criteria.some(
      (item) => item.type !== ScorecardCriterionType.RATING && item.weight !== 0,
    )) {
      throw new BadRequestException('Text and boolean criteria cannot carry weight');
    }
    const latest = await this.prisma.scorecardTemplate.aggregate({
      where: {
        tenantId,
        vacancyId: dto.vacancyId ?? null,
        stageId: dto.stageId ?? null,
        name: dto.name.trim(),
      },
      _max: { version: true },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.scorecardTemplate.updateMany({
        where: {
          tenantId,
          vacancyId: dto.vacancyId ?? null,
          stageId: dto.stageId ?? null,
          name: dto.name.trim(),
          isActive: true,
        },
        data: { isActive: false },
      });
      return tx.scorecardTemplate.create({
        data: {
          tenantId,
          vacancyId: dto.vacancyId,
          stageId: dto.stageId,
          name: dto.name.trim(),
          instructions: dto.instructions?.trim() || null,
          scope,
          feedbackVisibility: dto.feedbackVisibility ?? ScorecardFeedbackVisibility.AFTER_ALL_SUBMITTED,
          version: (latest._max.version ?? 0) + 1,
          createdByUserId: actor.sub,
          criteria: {
            create: dto.criteria.map((item, index) => ({
              tenantId,
              key: item.key.trim().toUpperCase(),
              label: item.label.trim(),
              description: item.description?.trim() || null,
              competencyCode: item.competencyCode?.trim().toUpperCase() || null,
              competencyName: item.competencyName?.trim() || null,
              competencyId: item.competencyId,
              type: item.type,
              weight: item.weight,
              isRequired: item.isRequired ?? true,
              requiresEvidence: item.requiresEvidence ?? false,
              ratingAnchors: item.ratingAnchors as Prisma.InputJsonValue | undefined,
              sortOrder: index,
            })),
          },
        },
        include: templateInclude,
      });
    });
  }

  async getInterviewContext(
    tenantId: string,
    actor: JwtPayload,
    interviewId: string,
  ) {
    const interview = await this.assertInterviewAccess(tenantId, actor, interviewId);
    const template = await this.resolveTemplate(
      tenantId,
      interview.application.vacancyId,
      interview.stageId,
      interview.scorecardTemplateId,
    );
    const scorecard = await this.prisma.interviewScorecard.findUnique({
      where: {
        interviewId_reviewerUserId: {
          interviewId,
          reviewerUserId: actor.sub,
        },
      },
      include: scorecardInclude,
    });
    const assignment = await this.prisma.scorecardEvaluatorAssignment.findUnique({ where: { interviewId_evaluatorUserId: { interviewId, evaluatorUserId: actor.sub } } });
    const assignedIds = assignment ? new Set(assignment.criterionIds as string[]) : null;
    const visibleTemplate = template && assignedIds ? { ...template, criteria: template.criteria.filter((criterion) => assignedIds.has(criterion.id)) } : template;
    return {
      template: visibleTemplate,
      scorecard,
      canEdit: scorecard?.status !== ScorecardStatus.SIGNED,
      assignment,
      comparisons: await this.comparison(tenantId, interviewId, actor, template?.feedbackVisibility),
    };
  }

  async submit(
    tenantId: string,
    actor: JwtPayload,
    interviewId: string,
    dto: SubmitScorecardDto,
  ) {
    const interview = await this.assertInterviewAccess(tenantId, actor, interviewId);
    const interviewerOnly =
      actor.roles.includes('INTERVIEWER') || actor.role === 'INTERVIEWER';
    if (
      interviewerOnly &&
      interview.interviewerUserId !== actor.sub &&
      !interview.participants.some(
        (item) =>
          item.userId === actor.sub &&
          item.role !== 'SHADOW' &&
          item.status !== 'DECLINED' &&
          item.status !== 'SUBSTITUTED',
      )
    ) {
      throw new NotFoundException('Interview not found');
    }
    const existing = await this.prisma.interviewScorecard.findUnique({
      where: {
        interviewId_reviewerUserId: {
          interviewId,
          reviewerUserId: actor.sub,
        },
      },
    });
    if (existing?.status === ScorecardStatus.SIGNED) {
      throw new ConflictException('Signed scorecards cannot be edited');
    }
    const template = await this.resolveTemplate(
      tenantId,
      interview.application.vacancyId,
      interview.stageId,
      interview.scorecardTemplateId,
    );
    if (!template) {
      return this.submitLegacy(tenantId, actor, interviewId, interview.completedAt, dto);
    }
    const assignment = await this.prisma.scorecardEvaluatorAssignment.findUnique({ where: { interviewId_evaluatorUserId: { interviewId, evaluatorUserId: actor.sub } } });
    const assignedIds = assignment ? new Set(assignment.criterionIds as string[]) : null;
    const criteria = assignedIds ? template.criteria.filter((criterion) => assignedIds.has(criterion.id)) : template.criteria;
    const responseByCriterion = new Map(
      (dto.responses ?? []).map((item) => [item.criterionId, item]),
    );
    const unknown = [...responseByCriterion.keys()].find(
      (id) => !criteria.some((criterion) => criterion.id === id),
    );
    if (unknown) throw new BadRequestException('A response criterion is outside the template');
    if (dto.sign ?? true) {
      this.assertRequiredResponses(criteria, responseByCriterion);
    }
    const assignedWeight = criteria.filter((item) => item.type === ScorecardCriterionType.RATING).reduce((sum, item) => sum + item.weight, 0);
    const weightedRaw = this.calculateWeightedScore(criteria, responseByCriterion);
    const weighted = assignedWeight && assignedWeight !== 100 ? Number((weightedRaw * 100 / assignedWeight).toFixed(2)) : weightedRaw;
    const overallRating = Math.max(1, Math.min(5, Math.round(weighted / 20)));
    const shouldSign = dto.sign ?? true;
    const canonical = {
      interviewId,
      reviewerUserId: actor.sub,
      templateId: template.id,
      templateVersion: template.version,
      responses: criteria.map((criterion) => ({
        criterionId: criterion.id,
        value: responseByCriterion.get(criterion.id) ?? null,
      })),
      overallRating,
      weightedScore: weighted,
      recommendation: dto.recommendation,
      strengths: dto.strengths?.trim() || null,
      concerns: dto.concerns?.trim() || null,
      comments: dto.comments?.trim() || null,
    };
    const signatureHash = shouldSign
      ? this.signature(JSON.stringify(canonical))
      : null;
    return this.prisma.$transaction(async (tx) => {
      const scorecard = existing
        ? await tx.interviewScorecard.update({
            where: { id: existing.id },
            data: {
              templateId: template.id,
              templateVersion: template.version,
              criteria: canonical.responses as Prisma.InputJsonValue,
              overallRating,
              weightedScore: weighted,
              recommendation: dto.recommendation,
              strengths: canonical.strengths,
              concerns: canonical.concerns,
              comments: canonical.comments,
              status: ScorecardStatus.DRAFT,
              signedAt: null,
              signedByUserId: null,
              signatureHash: null,
              submittedAt: new Date(),
            },
          })
        : await tx.interviewScorecard.create({
            data: {
              tenantId,
              interviewId,
              reviewerUserId: actor.sub,
              templateId: template.id,
              templateVersion: template.version,
              criteria: canonical.responses as Prisma.InputJsonValue,
              overallRating,
              weightedScore: weighted,
              recommendation: dto.recommendation,
              strengths: canonical.strengths,
              concerns: canonical.concerns,
              comments: canonical.comments,
              status: ScorecardStatus.DRAFT,
              signedAt: null,
              signedByUserId: null,
              signatureHash: null,
            },
          });
      if (existing) {
        await tx.interviewScorecardResponse.deleteMany({
          where: { scorecardId: scorecard.id },
        });
      }
      const responses = criteria.flatMap((criterion) => {
        const value = responseByCriterion.get(criterion.id);
        if (!value) return [];
        return [{
          tenantId,
          scorecardId: scorecard.id,
          criterionId: criterion.id,
          criterionKey: criterion.key,
          criterionLabel: criterion.label,
          competencyCode: criterion.competencyCode,
          competencyName: criterion.competencyName,
          criterionType: criterion.type,
          weight: criterion.weight,
          rating: value.rating,
          textValue: value.textValue?.trim() || null,
          booleanValue: value.booleanValue,
          evidence: value.evidence?.trim() || null,
        }];
      });
      if (responses.length) {
        await tx.interviewScorecardResponse.createMany({ data: responses });
      }
      if (shouldSign) {
        await tx.interviewScorecard.update({
          where: { id: scorecard.id },
          data: {
            status: ScorecardStatus.SIGNED,
            signedAt: new Date(),
            signedByUserId: actor.sub,
            signatureHash,
          },
        });
      }
      await tx.applicationInterview.update({
        where: { id: interviewId },
        data: {
          scorecardTemplateId: template.id,
          ...(shouldSign ? { status: 'COMPLETED', completedAt: interview.completedAt ?? new Date() } : {}),
        },
      });
      return tx.interviewScorecard.findUnique({
        where: { id: scorecard.id },
        include: scorecardInclude,
      });
    });
  }

  async comparisonForInterview(
    tenantId: string,
    actor: JwtPayload,
    interviewId: string,
  ) {
    await this.assertInterviewAccess(tenantId, actor, interviewId);
    const interview = await this.prisma.applicationInterview.findFirst({ where: { id: interviewId, tenantId }, include: { scorecardTemplate: true } });
    return this.comparison(tenantId, interviewId, actor, interview?.scorecardTemplate?.feedbackVisibility);
  }

  async createCommittee(
    tenantId: string,
    actor: JwtPayload,
    dto: CreateDecisionCommitteeDto,
  ) {
    const application = await this.assertApplicationAccess(
      tenantId,
      actor,
      dto.applicationId,
    );
    const uniqueUserIds = [...new Set(dto.members.map((item) => item.userId))];
    if (uniqueUserIds.length !== dto.members.length) {
      throw new BadRequestException('Committee members cannot be duplicated');
    }
    if (dto.quorum > dto.members.filter((item) => item.role !== DecisionCommitteeRole.OBSERVER).length) {
      throw new BadRequestException('Quorum cannot exceed voting members');
    }
    if (!dto.members.some((item) => item.role === DecisionCommitteeRole.CHAIR)) {
      throw new BadRequestException('The committee requires a chair');
    }
    const users = await this.prisma.user.count({
      where: { tenantId, id: { in: uniqueUserIds }, status: 'ACTIVE' },
    });
    if (users !== uniqueUserIds.length) {
      throw new BadRequestException('Every committee member must be an active tenant user');
    }
    const existing = await this.prisma.hiringDecisionCommittee.findUnique({
      where: { applicationId: dto.applicationId },
      include: { members: true },
    });
    if (
      existing
      && (
        existing.status !== DecisionCommitteeStatus.OPEN
        || existing.members.some((member) => member.votedAt)
      )
    ) {
      throw new ConflictException('A committee with votes or a final decision cannot be replaced');
    }
    await this.prisma.$transaction(async (tx) => {
      const committee = existing
        ? await tx.hiringDecisionCommittee.update({
            where: { id: existing.id },
            data: { quorum: dto.quorum },
          })
        : await tx.hiringDecisionCommittee.create({
            data: {
              tenantId,
              vacancyId: application.vacancyId,
              applicationId: application.id,
              quorum: dto.quorum,
            },
          });
      await tx.hiringDecisionCommitteeMember.deleteMany({
        where: { committeeId: committee.id },
      });
      await tx.hiringDecisionCommitteeMember.createMany({
        data: dto.members.map((member) => ({
          tenantId,
          committeeId: committee.id,
          userId: member.userId,
          role: member.role,
          isRequired: member.isRequired ?? true,
        })),
      });
    });
    return this.getCommittee(tenantId, actor, dto.applicationId);
  }

  async getCommittee(
    tenantId: string,
    actor: JwtPayload,
    applicationId: string,
  ) {
    const application = await this.assertApplicationAccess(
      tenantId,
      actor,
      applicationId,
    );
    const committee = await this.prisma.hiringDecisionCommittee.findUnique({
      where: { applicationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: [{ role: 'asc' }, { userId: 'asc' }],
        },
      },
    });
    if (!committee) return null;
    const interviews = await this.prisma.applicationInterview.findMany({
      where: { tenantId, applicationId: application.id },
      select: { id: true },
    });
    const comparisons = await Promise.all(
      interviews.map((item) => this.comparison(tenantId, item.id, actor)),
    );
    return { ...committee, comparisons };
  }

  async vote(
    tenantId: string,
    actor: JwtPayload,
    committeeId: string,
    dto: VoteDecisionCommitteeDto,
  ) {
    const committee = await this.prisma.hiringDecisionCommittee.findFirst({
      where: { id: committeeId, tenantId },
      include: { application: { include: { vacancy: true } }, members: true },
    });
    if (!committee) throw new NotFoundException('Decision committee not found');
    this.assertBranchAccess(actor, committee.application.vacancy.branchId);
    if (committee.status !== DecisionCommitteeStatus.OPEN) {
      throw new ConflictException('The committee no longer accepts votes');
    }
    const member = committee.members.find((item) => item.userId === actor.sub);
    if (!member || member.role === DecisionCommitteeRole.OBSERVER) {
      throw new ForbiddenException('Only voting committee members can vote');
    }
    return this.prisma.hiringDecisionCommitteeMember.update({
      where: { id: member.id },
      data: dto.recuse
        ? {
            vote: null,
            voteRationale: dto.rationale.trim(),
            conflictOfInterestDeclared: dto.conflictOfInterestDeclared,
            recusedAt: new Date(),
            votedAt: null,
          }
        : {
            vote: dto.vote,
            voteRationale: dto.rationale.trim(),
            conflictOfInterestDeclared: dto.conflictOfInterestDeclared,
            recusedAt: null,
            votedAt: new Date(),
          },
    });
  }

  async finalizeCommittee(
    tenantId: string,
    actor: JwtPayload,
    committeeId: string,
    dto: FinalizeDecisionCommitteeDto,
  ) {
    const committee = await this.prisma.hiringDecisionCommittee.findFirst({
      where: { id: committeeId, tenantId },
      include: { application: { include: { vacancy: true } }, members: true },
    });
    if (!committee) throw new NotFoundException('Decision committee not found');
    this.assertBranchAccess(actor, committee.application.vacancy.branchId);
    if (committee.status !== DecisionCommitteeStatus.OPEN) {
      throw new ConflictException('The committee is already closed');
    }
    const actorMembership = committee.members.find(
      (item) => item.userId === actor.sub,
    );
    if (actorMembership?.role !== DecisionCommitteeRole.CHAIR) {
      throw new ForbiddenException('Only the committee chair can finalize the decision');
    }
    const activeVotingMembers = committee.members.filter(
      (item) => item.role !== DecisionCommitteeRole.OBSERVER && !item.recusedAt,
    );
    const votes = activeVotingMembers.filter((item) => item.votedAt && item.vote);
    if (votes.length < committee.quorum) {
      throw new BadRequestException('Committee quorum has not been reached');
    }
    const missingRequired = activeVotingMembers.find(
      (item) => item.isRequired && !item.votedAt,
    );
    if (missingRequired) {
      throw new BadRequestException('Every required committee member must vote or recuse');
    }
    const signedScorecards = await this.prisma.interviewScorecard.count({
      where: {
        tenantId,
        interview: { applicationId: committee.applicationId },
        status: ScorecardStatus.SIGNED,
      },
    });
    if (!signedScorecards) {
      throw new BadRequestException('At least one signed scorecard is required');
    }
    const evaluators = await this.prisma.interviewScorecard.findMany({
      where: { tenantId, interview: { applicationId: committee.applicationId }, status: ScorecardStatus.SIGNED },
      select: { reviewerUserId: true },
      distinct: ['reviewerUserId'],
    });
    const calibrated = await this.prisma.evaluatorCalibrationSnapshot.findMany({
      where: {
        tenantId,
        evaluatorUserId: { in: evaluators.map((item) => item.reviewerUserId) },
        calculatedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: { evaluatorUserId: true },
      distinct: ['evaluatorUserId'],
    });
    if (calibrated.length !== evaluators.length) {
      throw new BadRequestException(
        'La decisión requiere calibración vigente (90 días) para cada evaluador con una ficha firmada',
      );
    }
    return this.prisma.hiringDecisionCommittee.update({
      where: { id: committee.id },
      data: {
        status: DecisionCommitteeStatus.DECIDED,
        finalDecision: dto.decision,
        rationale: dto.rationale.trim(),
        decidedByUserId: actor.sub,
        decidedAt: new Date(),
      },
      include: { members: true },
    });
  }

  async updateTemplateAdmin(tenantId: string, actor: JwtPayload, id: string, dto: UpdateScorecardTemplateAdminDto) {
    const template = await this.prisma.scorecardTemplate.findFirst({ where: { id, tenantId } });
    if (!template) throw new NotFoundException('Scorecard template not found');
    if (template.vacancyId) await this.assertVacancyAccess(tenantId, actor, template.vacancyId);
    return this.prisma.scorecardTemplate.update({ where: { id: template.id }, data: dto, include: templateInclude });
  }

  async duplicateTemplate(tenantId: string, actor: JwtPayload, id: string, dto: DuplicateScorecardTemplateDto) {
    const source = await this.prisma.scorecardTemplate.findFirst({ where: { id, tenantId }, include: { criteria: { orderBy: { sortOrder: 'asc' } } } });
    if (!source) throw new NotFoundException('Scorecard template not found');
    const scope = dto.scope ?? (dto.vacancyId ? ScorecardTemplateScope.VACANCY : source.scope);
    const vacancyId = scope === ScorecardTemplateScope.TENANT ? null : (dto.vacancyId ?? source.vacancyId);
    if (scope === ScorecardTemplateScope.VACANCY && !vacancyId) throw new BadRequestException('A vacancy is required');
    if (vacancyId) await this.assertVacancyAccess(tenantId, actor, vacancyId);
    const name = dto.name?.trim() || `${source.name} (copia)`;
    const latest = await this.prisma.scorecardTemplate.aggregate({ where: { tenantId, vacancyId, stageId: null, name }, _max: { version: true } });
    return this.prisma.scorecardTemplate.create({
      data: { tenantId, vacancyId, stageId: null, name, instructions: source.instructions, scope, feedbackVisibility: source.feedbackVisibility, version: (latest._max.version ?? 0) + 1, createdByUserId: actor.sub, criteria: { create: source.criteria.map((item) => ({ tenantId, key: item.key, label: item.label, description: item.description, competencyId: item.competencyId, competencyCode: item.competencyCode, competencyName: item.competencyName, type: item.type, weight: item.weight, isRequired: item.isRequired, requiresEvidence: item.requiresEvidence, ratingAnchors: item.ratingAnchors ?? undefined, sortOrder: item.sortOrder })) } },
      include: templateInclude,
    });
  }

  listCompetencies(tenantId: string, includeInactive = false) {
    return this.prisma.scorecardCompetency.findMany({ where: { tenantId, ...(includeInactive ? {} : { isActive: true }) }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }

  async upsertCompetency(tenantId: string, id: string | undefined, dto: ScorecardCompetencyDto) {
    const data = { code: dto.code.trim().toUpperCase(), name: dto.name.trim(), description: dto.description?.trim() || null, category: dto.category?.trim() || null, behavioralAnchors: dto.behavioralAnchors as Prisma.InputJsonValue | undefined, isActive: dto.isActive ?? true };
    if (id) {
      const existing = await this.prisma.scorecardCompetency.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) throw new NotFoundException('Competency not found');
      return this.prisma.scorecardCompetency.update({ where: { id: existing.id }, data });
    }
    return this.prisma.scorecardCompetency.create({ data: { tenantId, ...data } });
  }

  async replaceAssignments(tenantId: string, actor: JwtPayload, interviewId: string, dto: ReplaceScorecardAssignmentsDto) {
    const interview = await this.assertInterviewAccess(tenantId, actor, interviewId);
    const template = await this.resolveTemplate(tenantId, interview.application.vacancyId, interview.stageId, interview.scorecardTemplateId);
    if (!template) throw new BadRequestException('Assign a scorecard template first');
    const validCriteria = new Set(template.criteria.map((item) => item.id));
    if (dto.assignments.some((item) => item.criterionIds.some((id) => !validCriteria.has(id)))) throw new BadRequestException('Assignment contains criteria outside the template');
    const userIds = [...new Set(dto.assignments.map((item) => item.evaluatorUserId))];
    const users = await this.prisma.user.count({ where: { tenantId, id: { in: userIds }, status: 'ACTIVE' } });
    if (users !== userIds.length) throw new BadRequestException('Every evaluator must be an active tenant user');
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.assignments) {
        await tx.scorecardEvaluatorAssignment.upsert({
          where: { interviewId_evaluatorUserId: { interviewId, evaluatorUserId: item.evaluatorUserId } },
          create: { tenantId, interviewId, evaluatorUserId: item.evaluatorUserId, criterionIds: item.criterionIds, anonymousReview: item.anonymousReview ?? false },
          update: { criterionIds: item.criterionIds, anonymousReview: item.anonymousReview ?? false },
        });
      }
    });
    return this.prisma.scorecardEvaluatorAssignment.findMany({ where: { tenantId, interviewId }, include: { evaluator: { select: { id: true, firstName: true, lastName: true } } } });
  }

  async createExternalAssessment(tenantId: string, actor: JwtPayload, dto: CreateExternalAssessmentDto) {
    await this.assertApplicationAccess(tenantId, actor, dto.applicationId);
    if (!dto.consentRecorded) throw new BadRequestException('Candidate consent must be recorded before an external assessment');
    return this.prisma.externalCandidateAssessment.create({ data: { tenantId, applicationId: dto.applicationId, provider: dto.provider.trim(), assessmentType: dto.assessmentType.trim(), externalAssessmentId: dto.externalAssessmentId?.trim(), launchUrl: dto.launchUrl, status: dto.launchUrl ? 'INVITED' : 'DRAFT', consentRecordedAt: new Date(), invitedAt: dto.launchUrl ? new Date() : null, expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null } });
  }

  async updateExternalAssessment(tenantId: string, id: string, dto: UpdateExternalAssessmentResultDto) {
    const assessment = await this.prisma.externalCandidateAssessment.findFirst({ where: { id, tenantId }, select: { id: true } });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return this.prisma.externalCandidateAssessment.update({ where: { id: assessment.id }, data: { status: dto.status, score: dto.score, percentile: dto.percentile, reportUrl: dto.reportUrl, result: dto.result as Prisma.InputJsonValue | undefined, completedAt: dto.status === 'COMPLETED' ? new Date() : undefined } });
  }

  async listExternalAssessments(tenantId: string, actor: JwtPayload, applicationId: string) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    return this.prisma.externalCandidateAssessment.findMany({ where: { tenantId, applicationId }, orderBy: { createdAt: 'desc' } });
  }

  async assignHiringManager(tenantId: string, actor: JwtPayload, applicationId: string, dto: AssignHiringManagerDto) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    const manager = await this.prisma.user.findFirst({ where: { id: dto.managerUserId, tenantId, status: 'ACTIVE' }, select: { id: true } });
    if (!manager) throw new BadRequestException('Hiring manager must be an active tenant user');
    return this.prisma.hiringManagerApproval.upsert({ where: { applicationId }, create: { tenantId, applicationId, managerUserId: manager.id }, update: { managerUserId: manager.id, status: HiringManagerApprovalStatus.PENDING, recommendation: null, rationale: null, decidedAt: null, decidedByUserId: null }, include: { manager: { select: { id: true, firstName: true, lastName: true } } } });
  }

  async decideHiringManager(tenantId: string, actor: JwtPayload, applicationId: string, dto: DecideHiringManagerApprovalDto) {
    const approval = await this.prisma.hiringManagerApproval.findFirst({ where: { tenantId, applicationId } });
    if (!approval) throw new NotFoundException('Hiring manager approval not found');
    if (approval.managerUserId !== actor.sub && !actor.roles.some((role) => ['TENANT_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'].includes(role))) throw new ForbiddenException('Only the assigned hiring manager can decide');
    const result = await this.prisma.hiringManagerApproval.update({ where: { id: approval.id }, data: { status: dto.status, recommendation: dto.recommendation, rationale: dto.rationale.trim(), decidedByUserId: actor.sub, decidedAt: new Date() }, include: { manager: { select: { id: true, firstName: true, lastName: true } } } });
    if (dto.status === HiringManagerApprovalStatus.APPROVED && this.applications) {
      await this.applications.approvePendingTransitionFromHiringManager(applicationId, actor, tenantId);
    }
    return result;
  }

  async getHiringManagerApproval(tenantId: string, actor: JwtPayload, applicationId: string) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    return this.prisma.hiringManagerApproval.findFirst({ where: { tenantId, applicationId }, include: { manager: { select: { id: true, firstName: true, lastName: true } } } });
  }

  async calculateCalibration(tenantId: string, periodStartsAt: Date, periodEndsAt: Date) {
    const scorecards = await this.prisma.interviewScorecard.findMany({ where: { tenantId, status: ScorecardStatus.SIGNED, signedAt: { gte: periodStartsAt, lte: periodEndsAt } }, include: { responses: true } });
    const byInterview = new Map<string, number[]>();
    for (const item of scorecards) byInterview.set(item.interviewId, [...(byInterview.get(item.interviewId) ?? []), Number(item.weightedScore ?? 0)]);
    const byUser = new Map<string, typeof scorecards>();
    for (const item of scorecards) byUser.set(item.reviewerUserId, [...(byUser.get(item.reviewerUserId) ?? []), item]);
    const snapshots = [];
    for (const [userId, items] of byUser) {
      const scores = items.map((item) => Number(item.weightedScore ?? 0));
      const panelMeans = items.map((item) => { const values = byInterview.get(item.interviewId) ?? [0]; return values.reduce((sum, value) => sum + value, 0) / values.length; });
      const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
      const panelMean = panelMeans.reduce((sum, value) => sum + value, 0) / panelMeans.length;
      const meanDeviation = scores.reduce((sum, value, index) => sum + Math.abs(value - panelMeans[index]), 0) / scores.length;
      const agreementRate = scores.filter((value, index) => Math.abs(value - panelMeans[index]) <= 10).length / scores.length * 100;
      const responses = items.flatMap((item) => item.responses);
      const evidenceRate = responses.length ? responses.filter((item) => Boolean(item.evidence?.trim())).length / responses.length * 100 : 0;
      snapshots.push(await this.prisma.evaluatorCalibrationSnapshot.create({ data: { tenantId, evaluatorUserId: userId, sampleSize: items.length, meanScore: mean, panelMeanScore: panelMean, meanDeviation, strictnessIndex: (mean - panelMean) / 100, agreementRate, evidenceRate, periodStartsAt, periodEndsAt } }));
    }
    return snapshots;
  }

  listCalibration(tenantId: string) {
    return this.prisma.evaluatorCalibrationSnapshot.findMany({ where: { tenantId }, include: { evaluator: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { calculatedAt: 'desc' }, take: 100 });
  }

  async runBiasValidation(tenantId: string, actor: JwtPayload, dto: RunBiasValidationDto) {
    if (dto.referenceGroup.selected > dto.referenceGroup.total || dto.comparisonGroup.selected > dto.comparisonGroup.total) throw new BadRequestException('Selected count cannot exceed group total');
    const referenceRate = dto.referenceGroup.selected / dto.referenceGroup.total;
    const comparisonRate = dto.comparisonGroup.selected / dto.comparisonGroup.total;
    const ratio = referenceRate ? comparisonRate / referenceRate : null;
    const pooled = (dto.referenceGroup.selected + dto.comparisonGroup.selected) / (dto.referenceGroup.total + dto.comparisonGroup.total);
    const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / dto.referenceGroup.total + 1 / dto.comparisonGroup.total));
    const z = standardError ? (comparisonRate - referenceRate) / standardError : 0;
    const pValue = Math.min(1, 2 * (1 - this.normalCdf(Math.abs(z))));
    const sampleSize = dto.referenceGroup.total + dto.comparisonGroup.total;
    const status = sampleSize < 100 ? BiasValidationStatus.INSUFFICIENT_DATA : ratio != null && ratio < 0.8 && pValue < 0.05 ? BiasValidationStatus.REQUIRES_REVIEW : BiasValidationStatus.EXPLORATORY;
    return this.prisma.biasValidationRun.create({ data: { tenantId, createdByUserId: actor.sub, methodologyVersion: 'selection-rate-v1.0', populationField: dto.populationField.trim(), outcomeField: 'selection', sampleSize, referenceGroup: dto.referenceGroup.name, comparisonGroup: dto.comparisonGroup.name, selectionRateRatio: ratio, effectSize: comparisonRate - referenceRate, pValue, status, findings: { referenceRate, comparisonRate, zScore: z, fourFifthsThreshold: 0.8 }, limitations: 'Análisis observacional agregado. No demuestra causalidad ni sustituye revisión legal, psicométrica o estadística independiente.' } });
  }

  listBiasValidations(tenantId: string) {
    return this.prisma.biasValidationRun.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 });
  }

  private async comparison(tenantId: string, interviewId: string, actor?: JwtPayload, visibility: ScorecardFeedbackVisibility = ScorecardFeedbackVisibility.IMMEDIATE) {
    const scorecards = await this.prisma.interviewScorecard.findMany({
      where: { tenantId, interviewId, status: ScorecardStatus.SIGNED },
      include: scorecardInclude,
      orderBy: { signedAt: 'asc' },
    });
    if (!scorecards.length) {
      return {
        evaluatorCount: 0,
        evaluatorScores: [],
        criteria: [],
        biasSignals: [],
        disclaimer: this.biasDisclaimer(),
      };
    }
    const assignmentCount = await this.prisma.scorecardEvaluatorAssignment.count({ where: { tenantId, interviewId } });
    const ownSubmitted = actor ? scorecards.some((item) => item.reviewerUserId === actor.sub) : true;
    const allSubmitted = assignmentCount ? scorecards.length >= assignmentCount : scorecards.length >= 2;
    const managerApproval = actor && visibility === ScorecardFeedbackVisibility.HIRING_MANAGER_ONLY
      ? await this.prisma.hiringManagerApproval.findFirst({ where: { tenantId, managerUserId: actor.sub, application: { interviews: { some: { id: interviewId } } } }, select: { id: true } })
      : null;
    const isAdmin = actor?.roles.some((role) => ['TENANT_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'].includes(role)) ?? false;
    const canReveal = visibility === ScorecardFeedbackVisibility.IMMEDIATE
      || (visibility === ScorecardFeedbackVisibility.AFTER_OWN_SUBMISSION && ownSubmitted)
      || (visibility === ScorecardFeedbackVisibility.AFTER_ALL_SUBMITTED && allSubmitted)
      || (visibility === ScorecardFeedbackVisibility.HIRING_MANAGER_ONLY && Boolean(managerApproval || isAdmin));
    if (!canReveal) return { evaluatorCount: scorecards.length, evaluatorScores: [], criteria: [], biasSignals: [], feedbackLocked: true, visibility, disclaimer: this.biasDisclaimer() };
    const anonymousAssignments = await this.prisma.scorecardEvaluatorAssignment.findMany({ where: { tenantId, interviewId, anonymousReview: true }, select: { evaluatorUserId: true } });
    const anonymousIds = new Set(anonymousAssignments.map((item) => item.evaluatorUserId));
    const evaluatorScores = scorecards.map((scorecard) => ({
      reviewer: anonymousIds.has(scorecard.reviewerUserId) && !allSubmitted ? { id: `anonymous-${scorecard.id}`, firstName: 'Evaluador', lastName: 'anónimo' } : scorecard.reviewer,
      weightedScore: Number(scorecard.weightedScore ?? 0),
      overallRating: scorecard.overallRating,
      recommendation: scorecard.recommendation,
      signedAt: scorecard.signedAt,
    }));
    const responseGroups = new Map<string, typeof scorecards[number]['responses']>();
    for (const scorecard of scorecards) {
      for (const response of scorecard.responses) {
        const group = responseGroups.get(response.criterionKey) ?? [];
        group.push(response);
        responseGroups.set(response.criterionKey, group);
      }
    }
    const criteria = [...responseGroups.entries()].map(([key, responses]) => {
      const ratings = responses.flatMap((item) => item.rating == null ? [] : [item.rating]);
      const mean = ratings.length
        ? ratings.reduce((sum, item) => sum + item, 0) / ratings.length
        : null;
      return {
        key,
        label: responses[0]?.criterionLabel,
        competencyName: responses[0]?.criterion.competencyName ?? responses[0]?.competencyName,
        ratings,
        mean: mean == null ? null : Number(mean.toFixed(2)),
        min: ratings.length ? Math.min(...ratings) : null,
        max: ratings.length ? Math.max(...ratings) : null,
        spread: ratings.length ? Math.max(...ratings) - Math.min(...ratings) : null,
      };
    });
    return {
      evaluatorCount: scorecards.length,
      evaluatorScores,
      criteria,
      biasSignals: this.detectBiasSignals(scorecards, criteria),
      disclaimer: this.biasDisclaimer(),
    };
  }

  private async assertVacancyAccess(
    tenantId: string,
    actor: JwtPayload,
    vacancyId: string,
  ) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id: vacancyId, tenantId },
      select: { id: true, branchId: true },
    });
    if (!vacancy) throw new NotFoundException('Vacancy not found');
    this.assertBranchAccess(actor, vacancy.branchId);
    return vacancy;
  }

  private async assertApplicationAccess(
    tenantId: string,
    actor: JwtPayload,
    applicationId: string,
  ) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: applicationId, tenantId },
      include: { vacancy: { select: { branchId: true } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    this.assertBranchAccess(actor, application.vacancy.branchId);
    return application;
  }

  private async assertInterviewAccess(
    tenantId: string,
    actor: JwtPayload,
    interviewId: string,
  ) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: { id: interviewId, tenantId },
      include: {
        application: {
          include: {
            vacancy: { select: { branchId: true } },
          },
        },
        participants: true,
      },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    this.assertBranchAccess(actor, interview.application.vacancy.branchId);
    return interview;
  }

  private assertBranchAccess(actor: JwtPayload, branchId: string | null) {
    if (
      actor.scope === AccessScope.BRANCH
      && branchId
      && !actor.allowedBranchIds.includes(branchId)
    ) {
      throw new NotFoundException('Resource not found');
    }
  }

  private async resolveTemplate(
    tenantId: string,
    vacancyId: string,
    stageId?: string | null,
    assignedTemplateId?: string | null,
  ) {
    if (assignedTemplateId) {
      const assigned = await this.prisma.scorecardTemplate.findFirst({
        where: { id: assignedTemplateId, tenantId, vacancyId },
        include: templateInclude,
      });
      if (assigned) return assigned;
    }
    if (stageId) {
      const stageTemplate = await this.prisma.scorecardTemplate.findFirst({
        where: { tenantId, vacancyId, stageId, isActive: true },
        include: templateInclude,
        orderBy: { version: 'desc' },
      });
      if (stageTemplate) return stageTemplate;
    }
    const vacancyTemplate = await this.prisma.scorecardTemplate.findFirst({
      where: { tenantId, vacancyId, stageId: null, isActive: true },
      include: templateInclude,
      orderBy: { version: 'desc' },
    });
    if (vacancyTemplate) return vacancyTemplate;
    return this.prisma.scorecardTemplate.findFirst({
      where: { tenantId, scope: ScorecardTemplateScope.TENANT, isActive: true },
      include: templateInclude,
      orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }],
    });
  }

  private assertRequiredResponses(
    criteria: Array<{
      id: string;
      label: string;
      type: ScorecardCriterionType;
      isRequired: boolean;
      requiresEvidence: boolean;
    }>,
    responses: Map<
      string,
      {
        rating?: number;
        textValue?: string;
        booleanValue?: boolean;
        evidence?: string;
      }
    >,
  ) {
    for (const criterion of criteria) {
      const response = responses.get(criterion.id);
      const hasValue =
        criterion.type === ScorecardCriterionType.RATING
          ? response?.rating != null
          : criterion.type === ScorecardCriterionType.TEXT
            ? Boolean(response?.textValue?.trim())
            : response?.booleanValue != null;
      if (criterion.isRequired && !hasValue) {
        throw new BadRequestException(
          `A response is required for "${criterion.label}"`,
        );
      }
      if (response && criterion.requiresEvidence && !response.evidence?.trim()) {
        throw new BadRequestException(
          `Evidence is required for "${criterion.label}"`,
        );
      }
    }
  }

  private calculateWeightedScore(
    criteria: Array<{
      id: string;
      type: ScorecardCriterionType;
      weight: number;
    }>,
    responses: Map<string, { rating?: number }>,
  ) {
    const weighted = criteria.reduce((sum, criterion) => {
      if (criterion.type !== ScorecardCriterionType.RATING) return sum;
      const rating = responses.get(criterion.id)?.rating;
      return sum + (rating == null ? 0 : (rating / 5) * criterion.weight);
    }, 0);
    return Number(weighted.toFixed(2));
  }

  private signature(value: string) {
    const secret =
      process.env.SCORECARD_SIGNATURE_SECRET
      ?? process.env.JWT_ACCESS_SECRET
      ?? 'local-scorecard-signature';
    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private async submitLegacy(
    tenantId: string,
    actor: JwtPayload,
    interviewId: string,
    completedAt: Date | null,
    dto: SubmitScorecardDto,
  ) {
    if (!dto.overallRating) {
      throw new BadRequestException(
        'An overall rating is required when the interview has no scorecard template',
      );
    }
    const shouldSign = dto.sign ?? true;
    const criteria = dto.criteria ?? { overall: dto.overallRating };
    const canonical = {
      interviewId,
      reviewerUserId: actor.sub,
      criteria,
      overallRating: dto.overallRating,
      recommendation: dto.recommendation,
      strengths: dto.strengths?.trim() || null,
      concerns: dto.concerns?.trim() || null,
      comments: dto.comments?.trim() || null,
    };
    return this.prisma.$transaction(async (tx) => {
      const scorecard = await tx.interviewScorecard.upsert({
        where: {
          interviewId_reviewerUserId: {
            interviewId,
            reviewerUserId: actor.sub,
          },
        },
        create: {
          tenantId,
          interviewId,
          reviewerUserId: actor.sub,
          criteria: criteria as Prisma.InputJsonValue,
          overallRating: dto.overallRating!,
          weightedScore: dto.overallRating! * 20,
          recommendation: dto.recommendation,
          strengths: canonical.strengths,
          concerns: canonical.concerns,
          comments: canonical.comments,
          status: shouldSign ? ScorecardStatus.SIGNED : ScorecardStatus.DRAFT,
          signedAt: shouldSign ? new Date() : null,
          signedByUserId: shouldSign ? actor.sub : null,
          signatureHash: shouldSign
            ? this.signature(JSON.stringify(canonical))
            : null,
        },
        update: {
          criteria: criteria as Prisma.InputJsonValue,
          overallRating: dto.overallRating!,
          weightedScore: dto.overallRating! * 20,
          recommendation: dto.recommendation,
          strengths: canonical.strengths,
          concerns: canonical.concerns,
          comments: canonical.comments,
          status: shouldSign ? ScorecardStatus.SIGNED : ScorecardStatus.DRAFT,
          signedAt: shouldSign ? new Date() : null,
          signedByUserId: shouldSign ? actor.sub : null,
          signatureHash: shouldSign
            ? this.signature(JSON.stringify(canonical))
            : null,
          submittedAt: new Date(),
        },
        include: scorecardInclude,
      });
      if (shouldSign) {
        await tx.applicationInterview.update({
          where: { id: interviewId },
          data: { status: 'COMPLETED', completedAt: completedAt ?? new Date() },
        });
      }
      return scorecard;
    });
  }

  private detectBiasSignals(
    scorecards: Array<{
      id: string;
      reviewerUserId: string;
      weightedScore: Prisma.Decimal | null;
      recommendation: InterviewRecommendation;
      strengths: string | null;
      concerns: string | null;
      comments: string | null;
      responses: Array<{
        criterionKey: string;
        criterionLabel: string;
        criterionType: ScorecardCriterionType;
        rating: number | null;
        evidence: string | null;
        textValue: string | null;
      }>;
    }>,
    criteria: Array<{
      key: string;
      label: string | null;
      spread: number | null;
    }>,
  ) {
    const signals: Array<Record<string, unknown>> = [];
    for (const criterion of criteria) {
      if ((criterion.spread ?? 0) >= 2) {
        signals.push({
          code: 'EVALUATOR_DISAGREEMENT',
          severity: 'MEDIUM',
          criterionKey: criterion.key,
          message: `Existe una diferencia de ${criterion.spread} puntos entre evaluadores en "${criterion.label}".`,
        });
      }
    }
    const scoreMean = scorecards.reduce(
      (sum, item) => sum + Number(item.weightedScore ?? 0),
      0,
    ) / scorecards.length;
    const protectedLanguage =
      /\b(edad|joven|mayor|apariencia|acento|familia|embaraz\w*|g[eé]nero|nacionalidad|discapacidad|culture fit|cultural fit)\b/i;
    for (const scorecard of scorecards) {
      const score = Number(scorecard.weightedScore ?? 0);
      if (Math.abs(score - scoreMean) >= 25) {
        signals.push({
          code: 'OUTLIER_EVALUATOR',
          severity: 'MEDIUM',
          reviewerUserId: scorecard.reviewerUserId,
          message: 'La puntuación se desvía 25 puntos o más del promedio del panel.',
        });
      }
      const narrative = [
        scorecard.strengths,
        scorecard.concerns,
        scorecard.comments,
        ...scorecard.responses.flatMap((item) => [item.textValue, item.evidence]),
      ].filter(Boolean).join(' ');
      if (protectedLanguage.test(narrative)) {
        signals.push({
          code: 'POTENTIALLY_SENSITIVE_LANGUAGE',
          severity: 'HIGH',
          reviewerUserId: scorecard.reviewerUserId,
          message: 'La justificación contiene lenguaje que debe revisarse por posible relación con atributos protegidos.',
        });
      }
      const extremeWithoutEvidence = scorecard.responses.find(
        (item) =>
          item.criterionType === ScorecardCriterionType.RATING
          && (item.rating === 1 || item.rating === 5)
          && !item.evidence?.trim(),
      );
      if (extremeWithoutEvidence) {
        signals.push({
          code: 'EXTREME_WITHOUT_EVIDENCE',
          severity: 'LOW',
          reviewerUserId: scorecard.reviewerUserId,
          criterionKey: extremeWithoutEvidence.criterionKey,
          message: `La calificación extrema en "${extremeWithoutEvidence.criterionLabel}" no incluye evidencia.`,
        });
      }
      const ratings = scorecard.responses.flatMap(
        (item) => item.rating == null ? [] : [item.rating],
      );
      if (ratings.length >= 3 && new Set(ratings).size === 1) {
        signals.push({
          code: 'HALO_PATTERN',
          severity: 'LOW',
          reviewerUserId: scorecard.reviewerUserId,
          message: 'Todos los criterios recibieron la misma calificación; conviene revisar diferenciación y evidencia.',
        });
      }
    }
    return signals;
  }

  private biasDisclaimer() {
    return 'Estas señales apoyan la revisión humana: no prueban sesgo ni deben usarse para tomar decisiones automáticas.';
  }

  private normalCdf(value: number) {
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * erf);
  }
}
