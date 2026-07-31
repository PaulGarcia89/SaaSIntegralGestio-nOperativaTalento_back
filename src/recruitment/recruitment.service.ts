import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InterviewStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AccessScope } from '../common/enums/access-scope.enum';
import {
  ListInterviewsDto,
  ReplaceVacancyResponsiblesDto,
  ReplaceVacancyStagesDto,
  ScheduleInterviewDto,
  SubmitScorecardDto,
  UpdateInterviewDto,
} from './dto/recruitment.dto';

const interviewInclude = {
  application: { include: { candidate: true, vacancy: true } },
  stage: true,
  interviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
  scorecards: {
    include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { submittedAt: 'desc' as const },
  },
} satisfies Prisma.ApplicationInterviewInclude;

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  async getVacancySetup(tenantId: string, actor: JwtPayload, vacancyId: string) {
    await this.assertVacancy(tenantId, actor, vacancyId);
    return this.prisma.vacancy.findFirst({
      where: { id: vacancyId, tenantId },
      include: {
        stages: { orderBy: { position: 'asc' } },
        responsibles: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async replaceStages(tenantId: string, actor: JwtPayload, vacancyId: string, dto: ReplaceVacancyStagesDto) {
    await this.assertVacancy(tenantId, actor, vacancyId);
    const codes = dto.stages.map((stage) => stage.code.trim().toUpperCase());
    const positions = dto.stages.map((stage) => stage.position);
    if (new Set(codes).size !== codes.length || new Set(positions).size !== positions.length) {
      throw new BadRequestException('Stage codes and positions must be unique');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vacancyStage.deleteMany({ where: { vacancyId, interviews: { none: {} } } });
      for (const stage of dto.stages) {
        await tx.vacancyStage.upsert({
          where: { vacancyId_code: { vacancyId, code: stage.code.trim().toUpperCase() } },
          update: {
            name: stage.name.trim(),
            position: stage.position,
            color: stage.color,
            isTerminal: stage.isTerminal ?? false,
          },
          create: {
            tenantId,
            vacancyId,
            code: stage.code.trim().toUpperCase(),
            name: stage.name.trim(),
            position: stage.position,
            color: stage.color,
            isTerminal: stage.isTerminal ?? false,
          },
        });
      }
    });
    return this.getVacancySetup(tenantId, actor, vacancyId);
  }

  async replaceResponsibles(tenantId: string, actor: JwtPayload, vacancyId: string, dto: ReplaceVacancyResponsiblesDto) {
    const vacancy = await this.assertVacancy(tenantId, actor, vacancyId);
    const userIds = [...new Set(dto.responsibles.map((item) => item.userId))];
    const count = await this.prisma.user.count({
      where: {
        tenantId,
        id: { in: userIds },
        status: 'ACTIVE',
        OR: [
          { isSuperAdmin: true },
          {
            userRoles: {
              some: { role: { code: { in: ['TENANT_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'] } } },
            },
          },
          { branchAccesses: { some: { branchId: vacancy.branchId } } },
        ],
      },
    });
    if (count !== userIds.length) throw new BadRequestException('Every responsible must belong to the tenant');
    await this.prisma.$transaction([
      this.prisma.vacancyResponsible.deleteMany({ where: { vacancyId } }),
      this.prisma.vacancyResponsible.createMany({
        data: dto.responsibles.map((item) => ({ tenantId, vacancyId, userId: item.userId, role: item.role })),
        skipDuplicates: true,
      }),
    ]);
    return this.getVacancySetup(tenantId, actor, vacancyId);
  }

  async listInterviews(tenantId: string, actor: JwtPayload, query: ListInterviewsDto) {
    const interviewerOnly = actor.roles.includes('INTERVIEWER') || actor.role === 'INTERVIEWER';
    return this.prisma.applicationInterview.findMany({
      where: {
        tenantId,
        applicationId: query.applicationId,
        application: query.vacancyId ? { vacancyId: query.vacancyId } : undefined,
        interviewerUserId: interviewerOnly ? actor.sub : query.interviewerUserId,
        status: query.status,
        ...this.interviewBranchScope(actor),
      },
      include: interviewInclude,
      orderBy: { startsAt: 'asc' },
    });
  }

  async scheduleInterview(tenantId: string, actor: JwtPayload, dto: ScheduleInterviewDto) {
    const startsAt = this.parseDate(dto.startsAt, 'startsAt');
    const endsAt = this.parseDate(dto.endsAt, 'endsAt');
    if (endsAt <= startsAt) throw new BadRequestException('endsAt must be after startsAt');
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: dto.applicationId, tenantId },
      select: { id: true, vacancyId: true, vacancy: { select: { branchId: true } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    this.assertActorCanAccessBranch(actor, application.vacancy.branchId);
    const interviewer = await this.prisma.user.findFirst({
      where: {
        id: dto.interviewerUserId,
        tenantId,
        status: 'ACTIVE',
        OR: [
          { isSuperAdmin: true },
          {
            userRoles: {
              some: { role: { code: { in: ['TENANT_ADMIN', 'ADMIN', 'PLATFORM_ADMIN'] } } },
            },
          },
          { branchAccesses: { some: { branchId: application.vacancy.branchId } } },
        ],
      },
    });
    if (!interviewer) throw new BadRequestException('Interviewer must belong to the tenant');
    if (dto.stageId) {
      const stage = await this.prisma.vacancyStage.findFirst({ where: { id: dto.stageId, vacancyId: application.vacancyId, tenantId } });
      if (!stage) throw new BadRequestException('Stage does not belong to the vacancy');
    }
    return this.prisma.$transaction(async (tx) => {
      const interview = await tx.applicationInterview.create({
        data: {
          tenantId,
          applicationId: dto.applicationId,
          stageId: dto.stageId,
          interviewerUserId: dto.interviewerUserId,
          createdByUserId: actor.sub,
          title: dto.title.trim(),
          type: dto.type,
          timezone: dto.timezone,
          startsAt,
          endsAt,
          location: dto.location,
          meetingUrl: dto.meetingUrl,
          notes: dto.notes,
        },
        include: interviewInclude,
      });
      await tx.vacancyApplication.update({
        where: { id: dto.applicationId },
        data: {
          status: 'INTERVIEW',
          interviewType: dto.type,
          interviewScheduledAt: startsAt,
          interviewerUserId: dto.interviewerUserId,
          timelineEvents: {
            create: {
              type: 'INTERVIEW_SCHEDULED',
              occurredAt: startsAt,
              note: dto.title.trim(),
            },
          },
        },
      });
      return interview;
    });
  }

  async updateInterview(tenantId: string, actor: JwtPayload, id: string, dto: UpdateInterviewDto) {
    const interview = await this.assertInterview(tenantId, actor, id);
    const startsAt = dto.startsAt ? this.parseDate(dto.startsAt, 'startsAt') : undefined;
    const endsAt = dto.endsAt ? this.parseDate(dto.endsAt, 'endsAt') : undefined;
    const effectiveStartsAt = startsAt ?? interview.startsAt;
    const effectiveEndsAt = endsAt ?? interview.endsAt;
    if (effectiveEndsAt <= effectiveStartsAt) throw new BadRequestException('endsAt must be after startsAt');
    return this.prisma.applicationInterview.update({
      where: { id },
      data: { ...dto, startsAt, endsAt },
      include: interviewInclude,
    });
  }

  async submitScorecard(tenantId: string, actor: JwtPayload, interviewId: string, dto: SubmitScorecardDto) {
    const interview = await this.assertInterview(tenantId, actor, interviewId);
    const interviewerOnly = actor.roles.includes('INTERVIEWER') || actor.role === 'INTERVIEWER';
    if (interviewerOnly && interview.interviewerUserId !== actor.sub) {
      throw new NotFoundException('Interview not found');
    }
    const scorecard = await this.prisma.interviewScorecard.upsert({
      where: { interviewId_reviewerUserId: { interviewId, reviewerUserId: actor.sub } },
      update: { ...dto, criteria: dto.criteria as Prisma.InputJsonValue, submittedAt: new Date() },
      create: {
        tenantId,
        interviewId,
        reviewerUserId: actor.sub,
        ...dto,
        criteria: dto.criteria as Prisma.InputJsonValue,
      },
      include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.prisma.applicationInterview.update({
      where: { id: interviewId },
      data: { status: InterviewStatus.COMPLETED },
    });
    return scorecard;
  }

  private async assertVacancy(tenantId: string, actor: JwtPayload, id: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id, tenantId, ...this.vacancyBranchScope(actor) },
      select: { id: true, branchId: true },
    });
    if (!vacancy) throw new NotFoundException('Vacancy not found');
    return vacancy;
  }

  private async assertInterview(tenantId: string, actor: JwtPayload, id: string) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: { id, tenantId, ...this.interviewBranchScope(actor) },
    });
    if (!interview) throw new NotFoundException('Interview not found');
    return interview;
  }

  private vacancyBranchScope(actor: JwtPayload): Prisma.VacancyWhereInput {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) return {};
    return { branchId: { in: actor.allowedBranchIds } };
  }

  private interviewBranchScope(actor: JwtPayload): Prisma.ApplicationInterviewWhereInput {
    const branchScope =
      actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH
        ? {}
        : {
            AND: [
              { application: { vacancy: { branchId: { in: actor.allowedBranchIds } } } },
            ],
          };
    const interviewerScope =
      actor.roles.includes('INTERVIEWER') || actor.role === 'INTERVIEWER'
        ? { interviewerUserId: actor.sub }
        : {};
    return { ...branchScope, ...interviewerScope };
  }

  private assertActorCanAccessBranch(actor: JwtPayload, branchId: string) {
    if (
      !actor.isSuperAdmin &&
      actor.scope === AccessScope.BRANCH &&
      !actor.allowedBranchIds.includes(branchId)
    ) {
      throw new ForbiddenException('Branch is outside the actor access scope');
    }
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid ISO date`);
    return date;
  }
}
