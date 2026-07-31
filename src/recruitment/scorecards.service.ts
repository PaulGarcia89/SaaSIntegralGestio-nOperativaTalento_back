import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DecisionCommitteeRole,
  DecisionCommitteeStatus,
  InterviewRecommendation,
  Prisma,
  ScorecardCriterionType,
  ScorecardStatus,
} from '@prisma/client';
import { createHmac } from 'node:crypto';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  CreateDecisionCommitteeDto,
  CreateScorecardTemplateDto,
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
  responses: { orderBy: { criterion: { sortOrder: 'asc' as const } } },
} satisfies Prisma.InterviewScorecardInclude;

@Injectable()
export class ScorecardsService {
  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(
    tenantId: string,
    actor: JwtPayload,
    vacancyId: string,
    stageId?: string,
  ) {
    await this.assertVacancyAccess(tenantId, actor, vacancyId);
    return this.prisma.scorecardTemplate.findMany({
      where: {
        tenantId,
        vacancyId,
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
    await this.assertVacancyAccess(tenantId, actor, dto.vacancyId);
    if (dto.stageId) {
      const stage = await this.prisma.vacancyStage.findFirst({
        where: {
          id: dto.stageId,
          vacancyId: dto.vacancyId,
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
        vacancyId: dto.vacancyId,
        stageId: dto.stageId ?? null,
      },
      _max: { version: true },
    });
    return this.prisma.$transaction(async (tx) => {
      await tx.scorecardTemplate.updateMany({
        where: {
          tenantId,
          vacancyId: dto.vacancyId,
          stageId: dto.stageId ?? null,
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
    return {
      template,
      scorecard,
      canEdit: scorecard?.status !== ScorecardStatus.SIGNED,
      comparisons: await this.comparison(tenantId, interviewId),
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
    if (interviewerOnly && interview.interviewerUserId !== actor.sub) {
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
      return this.submitLegacy(tenantId, actor, interviewId, dto);
    }
    const responseByCriterion = new Map(
      (dto.responses ?? []).map((item) => [item.criterionId, item]),
    );
    const unknown = [...responseByCriterion.keys()].find(
      (id) => !template.criteria.some((criterion) => criterion.id === id),
    );
    if (unknown) throw new BadRequestException('A response criterion is outside the template');
    if (dto.sign ?? true) {
      this.assertRequiredResponses(template.criteria, responseByCriterion);
    }
    const weighted = this.calculateWeightedScore(template.criteria, responseByCriterion);
    const overallRating = Math.max(1, Math.min(5, Math.round(weighted / 20)));
    const shouldSign = dto.sign ?? true;
    const canonical = {
      interviewId,
      reviewerUserId: actor.sub,
      templateId: template.id,
      templateVersion: template.version,
      responses: template.criteria.map((criterion) => ({
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
      const responses = template.criteria.flatMap((criterion) => {
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
          ...(shouldSign ? { status: 'COMPLETED' } : {}),
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
    return this.comparison(tenantId, interviewId);
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
      interviews.map((item) => this.comparison(tenantId, item.id)),
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

  private async comparison(tenantId: string, interviewId: string) {
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
    const evaluatorScores = scorecards.map((scorecard) => ({
      reviewer: scorecard.reviewer,
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
        competencyName: responses[0]?.competencyName,
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
    return this.prisma.scorecardTemplate.findFirst({
      where: { tenantId, vacancyId, stageId: null, isActive: true },
      include: templateInclude,
      orderBy: { version: 'desc' },
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
          data: { status: 'COMPLETED' },
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
}
