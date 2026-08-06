import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AtsCommunicationAudience,
  AtsCommunicationType,
  CalendarProvider,
  InterviewStatus,
  Prisma,
  VideoConferenceProvider,
} from "@prisma/client";
import { AtsCommunicationsService } from "../ats-communications/ats-communications.service";
import { InterviewCalendarService } from "./interview-calendar.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { AccessScope } from "../common/enums/access-scope.enum";
import { normalizeOffsetPagination } from "../common/utils/pagination.util";
import {
  ListInterviewsDto,
  ReplaceVacancyResponsiblesDto,
  ReplaceVacancyStagesDto,
  ScheduleInterviewDto,
  ScheduleInterviewSequenceDto,
  CreateInterviewPoolDto,
  CreateInterviewResourceDto,
  UpdateInterviewerProfileDto,
  UpdateInterviewDto,
} from "./dto/recruitment.dto";
import { DomainEventsService } from '../domain-events/domain-events.service';

const interviewInclude = {
  application: { include: { candidate: true, vacancy: true } },
  stage: true,
  interviewer: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  scorecards: {
    include: {
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { submittedAt: "desc" as const },
  },
  participants: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ role: "asc" as const }, { createdAt: "asc" as const }],
  },
  resourceBookings: {
    include: { resource: true },
    orderBy: { createdAt: "asc" as const },
  },
  sequence: true,
} satisfies Prisma.ApplicationInterviewInclude;

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly communications?: AtsCommunicationsService,
    private readonly calendars?: InterviewCalendarService,
    private readonly domainEvents?: DomainEventsService,
  ) {}

  async getVacancySetup(
    tenantId: string,
    actor: JwtPayload,
    vacancyId: string,
  ) {
    await this.assertVacancy(tenantId, actor, vacancyId);
    return this.prisma.vacancy.findFirst({
      where: { id: vacancyId, tenantId },
      include: {
        stages: { orderBy: { position: "asc" } },
        responsibles: {
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
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  async replaceStages(
    tenantId: string,
    actor: JwtPayload,
    vacancyId: string,
    dto: ReplaceVacancyStagesDto,
  ) {
    await this.assertVacancy(tenantId, actor, vacancyId);
    const codes = dto.stages.map((stage) => stage.code.trim().toUpperCase());
    const positions = dto.stages.map((stage) => stage.position);
    if (
      new Set(codes).size !== codes.length ||
      new Set(positions).size !== positions.length
    ) {
      throw new BadRequestException("Stage codes and positions must be unique");
    }
    const knownCodes = new Set(codes);
    const invalidDestination = dto.stages
      .flatMap((stage) => stage.allowedNextStageCodes ?? [])
      .map((code) => code.trim().toUpperCase())
      .find((code) => !knownCodes.has(code));
    if (invalidDestination) {
      throw new BadRequestException(
        `Unknown destination stage code: ${invalidDestination}`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.vacancyStage.deleteMany({
        where: {
          vacancyId,
          interviews: { none: {} },
          applications: { none: {} },
        },
      });
      for (const stage of dto.stages) {
        await tx.vacancyStage.upsert({
          where: {
            vacancyId_code: {
              vacancyId,
              code: stage.code.trim().toUpperCase(),
            },
          },
          update: {
            name: stage.name.trim(),
            position: stage.position,
            color: stage.color,
            applicationStatus: stage.applicationStatus,
            allowedNextStageCodes: stage.allowedNextStageCodes?.map((code) =>
              code.trim().toUpperCase(),
            ),
            requiredFields: stage.requiredFields,
            requiresApproval: stage.requiresApproval ?? false,
            requiredApprovals: stage.requiresApproval
              ? Math.max(1, stage.requiredApprovals ?? 1)
              : 0,
            allowReopen: stage.allowReopen ?? false,
            slaHours: stage.slaHours,
            isTerminal: stage.isTerminal ?? false,
          },
          create: {
            tenantId,
            vacancyId,
            code: stage.code.trim().toUpperCase(),
            name: stage.name.trim(),
            position: stage.position,
            color: stage.color,
            applicationStatus: stage.applicationStatus,
            allowedNextStageCodes: stage.allowedNextStageCodes?.map((code) =>
              code.trim().toUpperCase(),
            ),
            requiredFields: stage.requiredFields,
            requiresApproval: stage.requiresApproval ?? false,
            requiredApprovals: stage.requiresApproval
              ? Math.max(1, stage.requiredApprovals ?? 1)
              : 0,
            allowReopen: stage.allowReopen ?? false,
            slaHours: stage.slaHours,
            isTerminal: stage.isTerminal ?? false,
          },
        });
      }
    });
    return this.getVacancySetup(tenantId, actor, vacancyId);
  }

  async replaceResponsibles(
    tenantId: string,
    actor: JwtPayload,
    vacancyId: string,
    dto: ReplaceVacancyResponsiblesDto,
  ) {
    const vacancy = await this.assertVacancy(tenantId, actor, vacancyId);
    const userIds = [...new Set(dto.responsibles.map((item) => item.userId))];
    const count = await this.prisma.user.count({
      where: {
        tenantId,
        id: { in: userIds },
        status: "ACTIVE",
        OR: [
          { isSuperAdmin: true },
          {
            userRoles: {
              some: {
                role: {
                  code: { in: ["TENANT_ADMIN", "ADMIN", "PLATFORM_ADMIN"] },
                },
              },
            },
          },
          { branchAccesses: { some: { branchId: vacancy.branchId } } },
        ],
      },
    });
    if (count !== userIds.length)
      throw new BadRequestException(
        "Every responsible must belong to the tenant",
      );
    await this.prisma.$transaction([
      this.prisma.vacancyResponsible.deleteMany({ where: { vacancyId } }),
      this.prisma.vacancyResponsible.createMany({
        data: dto.responsibles.map((item) => ({
          tenantId,
          vacancyId,
          userId: item.userId,
          role: item.role,
        })),
        skipDuplicates: true,
      }),
    ]);
    return this.getVacancySetup(tenantId, actor, vacancyId);
  }

  async listInterviews(
    tenantId: string,
    actor: JwtPayload,
    query: ListInterviewsDto,
  ) {
    const interviewerOnly =
      actor.roles.includes("INTERVIEWER") || actor.role === "INTERVIEWER";
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.ApplicationInterviewWhereInput = {
      tenantId,
      applicationId: query.applicationId,
      status: query.status,
      sequenceId: query.sequenceId,
      application:
        query.vacancyId || query.branchId
          ? {
              vacancyId: query.vacancyId,
              vacancy: query.branchId ? { branchId: query.branchId } : undefined,
            }
          : undefined,
      resourceBookings: query.resourceId
        ? { some: { resourceId: query.resourceId } }
        : undefined,
      startsAt:
        query.startsFrom || query.startsTo
          ? {
              gte: query.startsFrom ? this.parseDate(query.startsFrom, "startsFrom") : undefined,
              lte: query.startsTo ? this.parseDate(query.startsTo, "startsTo") : undefined,
            }
          : undefined,
      AND: [
        this.interviewBranchScope(actor),
        ...(interviewerOnly
          ? [{
              OR: [
                { interviewerUserId: actor.sub },
                { participants: { some: { userId: actor.sub, status: { not: "DECLINED" as const } } } },
              ],
            }]
          : []),
        ...(!interviewerOnly && query.interviewerUserId
          ? [{
              OR: [
                { interviewerUserId: query.interviewerUserId },
                { participants: { some: { userId: query.interviewerUserId, status: { not: "DECLINED" as const } } } },
              ],
            }]
          : []),
        ...(query.search
          ? [{
              OR: [
                { title: { contains: query.search, mode: "insensitive" as const } },
                { application: { candidate: { fullName: { contains: query.search, mode: "insensitive" as const } } } },
                { application: { vacancy: { title: { contains: query.search, mode: "insensitive" as const } } } },
              ],
            }]
          : []),
      ],
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.applicationInterview.findMany({ where, include: interviewInclude, orderBy: { startsAt: "asc" }, skip: pagination.skip, take: pagination.pageSize }),
      this.prisma.applicationInterview.count({ where }),
    ]);
    return { data, meta: { total, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.ceil(total / pagination.pageSize) } };
  }

  async scheduleInterview(
    tenantId: string,
    actor: JwtPayload,
    dto: ScheduleInterviewDto,
  ) {
    const startsAt = this.parseDate(dto.startsAt, "startsAt");
    const endsAt = this.parseDate(dto.endsAt, "endsAt");
    if (endsAt <= startsAt)
      throw new BadRequestException("endsAt must be after startsAt");
    this.assertProviderCombination(
      dto.calendarProvider,
      dto.videoProvider,
      dto.meetingUrl,
    );
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: dto.applicationId, tenantId },
      select: {
        id: true,
        vacancyId: true,
        status: true,
        currentStageId: true,
        currentStage: true,
        vacancy: { select: { branchId: true } },
      },
    });
    if (!application) throw new NotFoundException("Application not found");
    this.assertActorCanAccessBranch(actor, application.vacancy.branchId);
    const interviewer = await this.prisma.user.findFirst({
      where: {
        id: dto.interviewerUserId,
        tenantId,
        status: "ACTIVE",
        OR: [
          { isSuperAdmin: true },
          {
            userRoles: {
              some: {
                role: {
                  code: { in: ["TENANT_ADMIN", "ADMIN", "PLATFORM_ADMIN"] },
                },
              },
            },
          },
          {
            branchAccesses: {
              some: { branchId: application.vacancy.branchId },
            },
          },
        ],
      },
    });
    if (!interviewer)
      throw new BadRequestException("Interviewer must belong to the tenant");
    const panelUserIds = [
      ...new Set([dto.interviewerUserId, ...(dto.participantUserIds ?? [])]),
    ];
    const shadowUserIds = [
      ...new Set(dto.shadowUserIds ?? []),
    ].filter((userId) => !panelUserIds.includes(userId));
    await this.assertPanelEligible(
      tenantId,
      application.vacancy.branchId,
      panelUserIds,
      shadowUserIds,
      startsAt,
      endsAt,
    );
    await this.assertResourcesAvailable(
      tenantId,
      application.vacancy.branchId,
      dto.resourceIds ?? [],
      startsAt,
      endsAt,
    );
    if (dto.poolId) {
      const pool = await this.prisma.interviewPool.findFirst({
        where: {
          id: dto.poolId,
          tenantId,
          active: true,
          OR: [{ branchId: null }, { branchId: application.vacancy.branchId }],
        },
      });
      if (!pool) throw new BadRequestException("Interview pool is not available for this branch");
    }
    if (!dto.allowConflict) {
      for (const userId of [...panelUserIds, ...shadowUserIds]) {
        await this.calendars?.assertNoConflict(tenantId, userId, startsAt, endsAt);
      }
    }
    const pipelineStage = dto.stageId
      ? await this.prisma.vacancyStage.findFirst({
          where: {
            id: dto.stageId,
            vacancyId: application.vacancyId,
            tenantId,
          },
        })
      : await this.prisma.vacancyStage.findFirst({
          where: {
            vacancyId: application.vacancyId,
            tenantId,
            applicationStatus: "INTERVIEW",
          },
          orderBy: { position: "asc" },
        });
    if (dto.stageId && !pipelineStage) {
      throw new BadRequestException("Stage does not belong to the vacancy");
    }
    if (pipelineStage?.applicationStatus === "HIRED") {
      throw new BadRequestException(
        "A hiring stage cannot be used to schedule an interview",
      );
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const interview = await tx.applicationInterview.create({
        data: {
          tenantId,
          applicationId: dto.applicationId,
          stageId: pipelineStage?.id,
          interviewerUserId: dto.interviewerUserId,
          createdByUserId: actor.sub,
          sequenceId: dto.sequenceId,
          sequenceOrder: dto.sequenceOrder,
          title: dto.title.trim(),
          type: dto.type,
          timezone: dto.timezone,
          startsAt,
          endsAt,
          location: dto.location,
          meetingUrl: dto.meetingUrl,
          calendarProvider: dto.calendarProvider,
          videoProvider:
            dto.videoProvider ??
            (dto.meetingUrl
              ? VideoConferenceProvider.MANUAL
              : VideoConferenceProvider.NONE),
          calendarSyncStatus:
            dto.calendarProvider ||
            dto.videoProvider === VideoConferenceProvider.ZOOM
              ? "PENDING"
              : "NOT_CONNECTED",
          notes: dto.notes,
          participants: {
            create: [
              ...panelUserIds.map((userId) => ({
                tenantId,
                userId,
                role: userId === dto.interviewerUserId ? ("LEAD" as const) : ("PANELIST" as const),
                status: userId === dto.interviewerUserId ? ("ACCEPTED" as const) : ("PENDING" as const),
                poolId: dto.poolId,
                respondedAt: userId === dto.interviewerUserId ? new Date() : undefined,
              })),
              ...shadowUserIds.map((userId) => ({
                tenantId,
                userId,
                role: "SHADOW" as const,
                status: "PENDING" as const,
                poolId: dto.poolId,
              })),
            ],
          },
          resourceBookings: dto.resourceIds?.length
            ? {
                create: dto.resourceIds.map((resourceId) => ({
                  tenantId,
                  resourceId,
                  startsAt,
                  endsAt,
                })),
              }
            : undefined,
        },
        include: interviewInclude,
      });
      await tx.vacancyApplication.update({
        where: { id: dto.applicationId },
        data: {
          status: pipelineStage?.applicationStatus ?? "INTERVIEW",
          ...(pipelineStage
            ? { currentStage: { connect: { id: pipelineStage.id } } }
            : {}),
          ...(pipelineStage && pipelineStage.id !== application.currentStageId
            ? { stageEnteredAt: new Date() }
            : {}),
          interviewType: dto.type,
          interviewScheduledAt: startsAt,
          interviewer: { connect: { id: dto.interviewerUserId } },
          timelineEvents: {
            create: [
              {
                tenantId,
                type: "INTERVIEW_SCHEDULED",
                occurredAt: new Date(),
                note: dto.title.trim(),
                actorType: "USER",
                actorId: actor.sub,
                actorDisplayName: this.actorDisplayName(actor),
                previousValue: {
                  scheduledAt: null,
                },
                newValue: {
                  scheduledAt: startsAt.toISOString(),
                  interviewerUserId: dto.interviewerUserId,
                  interviewType: dto.type,
                },
                source: "ATS_INTERVIEW",
              },
              ...(pipelineStage &&
              pipelineStage.id !== application.currentStageId
                ? [
                    {
                      tenantId,
                      type: "STAGE_CHANGED" as const,
                      occurredAt: new Date(),
                      note: `Etapa actualizada a ${pipelineStage.name} al programar entrevista`,
                      actorType: "USER",
                      actorId: actor.sub,
                      actorDisplayName: this.actorDisplayName(actor),
                      previousValue: {
                        status: application.status,
                        stageId: application.currentStage?.id ?? null,
                        stageCode: application.currentStage?.code ?? null,
                        stageName: application.currentStage?.name ?? null,
                      },
                      newValue: {
                        status: pipelineStage.applicationStatus,
                        stageId: pipelineStage.id,
                        stageCode: pipelineStage.code,
                        stageName: pipelineStage.name,
                      },
                      reason: "Entrevista programada",
                      source: "ATS_INTERVIEW",
                    },
                  ]
                : []),
            ],
          },
        },
      });
      const interviewDate = startsAt.toISOString();
      const interviewLocation = dto.meetingUrl || dto.location || "";
      await this.communications?.enqueueEvent(tx, {
        tenantId,
        applicationId: dto.applicationId,
        interviewId: interview.id,
        type: AtsCommunicationType.INTERVIEW_SCHEDULED,
        audiences: [
          AtsCommunicationAudience.CANDIDATE,
          AtsCommunicationAudience.RESPONSIBLE,
        ],
        deduplicationSuffix: `${interview.id}:${interviewDate}`,
        actorType: "USER",
        actorId: actor.sub,
        variables: { interviewDate, interviewLocation },
      });
      await this.enqueueInterviewReminder(tx, {
        tenantId,
        applicationId: dto.applicationId,
        interviewId: interview.id,
        startsAt,
        location: interviewLocation,
        actor,
      });
      return interview;
    });
    if (
      dto.calendarProvider ||
      dto.videoProvider === VideoConferenceProvider.ZOOM
    ) {
      try {
        await this.calendars?.syncInterview(tenantId, created.id, "UPSERT");
      } catch {
        // The interview remains valid and exposes FAILED so an operator can retry.
      }
    }
    await this.domainEvents?.interviewScheduled(actor, {
      applicationId: created.applicationId,
      candidateId: created.application.candidate.id,
      vacancyId: created.application.vacancy.id,
      branchId: created.application.vacancy.branchId,
      interviewId: created.id,
      status: created.status,
      payload: {
        interviewId: created.id,
        interviewerUserId: created.interviewerUserId,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt.toISOString(),
        vacancyId: created.application.vacancy.id,
      },
    }, { idempotencyKey: `ats:interview-scheduled:${created.id}` });
    return this.prisma.applicationInterview.findUnique({
      where: { id: created.id },
      include: interviewInclude,
    });
  }

  async scheduleSequence(tenantId: string, actor: JwtPayload, dto: ScheduleInterviewSequenceDto) {
    if (dto.rounds.some((round) => round.applicationId !== dto.applicationId)) {
      throw new BadRequestException("Every sequence round must belong to the same application");
    }
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id: dto.applicationId, tenantId, vacancy: this.vacancyBranchScope(actor) },
      select: { id: true },
    });
    if (!application) throw new NotFoundException("Application not found");
    const sequence = await this.prisma.interviewSequence.create({
      data: { tenantId, applicationId: application.id, title: dto.title.trim(), status: "SCHEDULING" },
    });
    const createdIds: string[] = [];
    try {
      for (const [index, round] of dto.rounds.entries()) {
        const interview = await this.scheduleInterview(tenantId, actor, { ...round, sequenceId: sequence.id, sequenceOrder: index });
        if (interview) createdIds.push(interview.id);
      }
      return this.prisma.interviewSequence.update({
        where: { id: sequence.id },
        data: { status: "SCHEDULED" },
        include: { interviews: { include: interviewInclude, orderBy: { sequenceOrder: "asc" } } },
      });
    } catch (error) {
      for (const interviewId of createdIds) {
        try { await this.calendars?.syncInterview(tenantId, interviewId, "CANCEL"); } catch { /* Best-effort external rollback. */ }
      }
      await this.prisma.$transaction([
        this.prisma.applicationInterview.deleteMany({ where: { sequenceId: sequence.id, tenantId } }),
        this.prisma.interviewSequence.deleteMany({ where: { id: sequence.id, tenantId } }),
      ]);
      throw error;
    }
  }

  listPools(tenantId: string, actor: JwtPayload) {
    return this.prisma.interviewPool.findMany({
      where: { tenantId, active: true, ...(actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { OR: [{ branchId: null }, { branchId: { in: actor.allowedBranchIds } }] } : {}) },
      include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }, orderBy: { priority: "asc" } } },
      orderBy: { name: "asc" },
    });
  }

  async createPool(tenantId: string, actor: JwtPayload, dto: CreateInterviewPoolDto) {
    if (dto.branchId) {
      this.assertActorCanAccessBranch(actor, dto.branchId);
      const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId }, select: { id: true } });
      if (!branch) throw new NotFoundException("Branch not found");
    }
    const userIds = [...new Set(dto.members.map((item) => item.userId))];
    const users = await this.prisma.user.count({ where: { tenantId, id: { in: userIds }, status: "ACTIVE" } });
    if (users !== userIds.length) throw new BadRequestException("Every pool member must be an active tenant user");
    return this.prisma.interviewPool.create({
      data: { tenantId, branchId: dto.branchId, name: dto.name.trim(), description: dto.description?.trim(), members: { create: dto.members.map((item) => ({ tenantId, userId: item.userId, defaultRole: item.defaultRole, priority: item.priority ?? 100 })) } },
      include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } },
    });
  }

  listResources(tenantId: string, actor: JwtPayload, branchId?: string) {
    if (branchId) this.assertActorCanAccessBranch(actor, branchId);
    return this.prisma.interviewResource.findMany({
      where: { tenantId, active: true, branchId: branchId ?? (actor.scope === AccessScope.BRANCH && !actor.isSuperAdmin ? { in: actor.allowedBranchIds } : undefined) },
      orderBy: [{ branchId: "asc" }, { name: "asc" }],
    });
  }

  async createResource(tenantId: string, actor: JwtPayload, dto: CreateInterviewResourceDto) {
    this.assertActorCanAccessBranch(actor, dto.branchId);
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId }, select: { id: true } });
    if (!branch) throw new NotFoundException("Branch not found");
    return this.prisma.interviewResource.create({ data: { tenantId, branchId: branch.id, name: dto.name.trim(), type: dto.type, capacity: dto.capacity ?? 1, location: dto.location?.trim() } });
  }

  listInterviewerProfiles(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, email: true, interviewerProfile: true },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
  }

  async updateInterviewerProfile(tenantId: string, userId: string, dto: UpdateInterviewerProfileDto) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId, status: "ACTIVE" }, select: { id: true } });
    if (!user) throw new NotFoundException("Interviewer not found");
    const existing = await this.prisma.interviewerProfile.findFirst({ where: { userId: user.id, tenantId }, select: { id: true } });
    const data = { ...dto, trainedAt: dto.trainingStatus === "CERTIFIED" ? new Date() : undefined };
    return existing
      ? this.prisma.interviewerProfile.update({ where: { id: existing.id }, data })
      : this.prisma.interviewerProfile.create({ data: { tenantId, userId: user.id, ...data } });
  }

  async respondToInvitation(tenantId: string, actor: JwtPayload, interviewId: string, accepted: boolean) {
    const participant = await this.prisma.applicationInterviewParticipant.findFirst({
      where: { tenantId, interviewId, userId: actor.sub, status: { in: ["PENDING", "ACCEPTED"] } },
      include: { interview: { include: { application: { include: { vacancy: true } }, participants: true } } },
    });
    if (!participant) throw new NotFoundException("Interview invitation not found");
    if (accepted) {
      return this.prisma.applicationInterviewParticipant.update({ where: { id: participant.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    }
    const replacement = await this.findSubstitute(tenantId, participant);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.applicationInterviewParticipant.update({ where: { id: participant.id }, data: { status: replacement ? "SUBSTITUTED" : "DECLINED", respondedAt: new Date() } });
      if (!replacement) return { declined: true, substituted: false };
      await tx.applicationInterviewParticipant.create({ data: { tenantId, interviewId, userId: replacement.userId, role: participant.role, status: "PENDING", poolId: participant.poolId, substitutedForUserId: participant.userId } });
      if (participant.role === "LEAD") await tx.applicationInterview.update({ where: { id: interviewId }, data: { interviewerUserId: replacement.userId, calendarSyncStatus: "PENDING" } });
      await tx.notification.create({ data: { tenantId, userId: replacement.userId, type: "WARNING", category: "ATS", title: "Sustitución de entrevista", message: "Fuiste asignado como sustituto en una entrevista.", sourceModule: "ats-interviews", actionUrl: "/ats/interviews", deduplicationKey: `interview-substitute:${interviewId}:${replacement.userId}` } });
      return { declined: true, substituted: true, replacementUserId: replacement.userId };
    });
    if (replacement && participant.role === "LEAD") {
      try { await this.calendars?.syncInterview(tenantId, interviewId, "UPSERT"); } catch { /* Retry remains available in the coordinator queue. */ }
    }
    return result;
  }

  async coordinationQueue(tenantId: string, actor: JwtPayload, page = 1, pageSize = 20) {
    const normalizedPage = Math.max(1, page);
    const normalizedSize = Math.min(100, Math.max(1, pageSize));
    const interviewWhere: Prisma.ApplicationInterviewWhereInput = {
      tenantId,
      AND: [this.interviewBranchScope(actor)],
      OR: [
        { calendarSyncStatus: "FAILED" },
        { participants: { some: { status: "PENDING" } } },
      ],
      status: { in: ["SCHEDULED", "CONFIRMED"] },
    };
    const requestWhere: Prisma.InterviewSchedulingRequestWhereInput = {
      tenantId,
      status: "OPEN",
      application: { vacancy: this.vacancyBranchScope(actor) },
    };
    const [interviews, requests, interviewCount, requestCount] = await this.prisma.$transaction([
      this.prisma.applicationInterview.findMany({ where: interviewWhere, include: interviewInclude, orderBy: { startsAt: "asc" }, skip: (normalizedPage - 1) * normalizedSize, take: normalizedSize }),
      this.prisma.interviewSchedulingRequest.findMany({ where: requestWhere, include: { application: { include: { candidate: true, vacancy: true } }, pool: true }, orderBy: { createdAt: "asc" }, skip: (normalizedPage - 1) * normalizedSize, take: normalizedSize }),
      this.prisma.applicationInterview.count({ where: interviewWhere }),
      this.prisma.interviewSchedulingRequest.count({ where: requestWhere }),
    ]);
    return { interviews, schedulingRequests: requests, meta: { page: normalizedPage, pageSize: normalizedSize, interviewCount, requestCount } };
  }

  private actorDisplayName(actor: JwtPayload) {
    return (
      [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() ||
      actor.email ||
      actor.sub
    );
  }

  async updateInterview(
    tenantId: string,
    actor: JwtPayload,
    id: string,
    dto: UpdateInterviewDto,
  ) {
    const interview = await this.assertInterview(tenantId, actor, id);
    const startsAt = dto.startsAt
      ? this.parseDate(dto.startsAt, "startsAt")
      : undefined;
    const endsAt = dto.endsAt
      ? this.parseDate(dto.endsAt, "endsAt")
      : undefined;
    const effectiveStartsAt = startsAt ?? interview.startsAt;
    const effectiveEndsAt = endsAt ?? interview.endsAt;
    if (effectiveEndsAt <= effectiveStartsAt)
      throw new BadRequestException("endsAt must be after startsAt");
    const effectiveCalendarProvider =
      dto.calendarProvider ?? interview.calendarProvider;
    const effectiveVideoProvider = dto.videoProvider ?? interview.videoProvider;
    const effectiveMeetingUrl = dto.meetingUrl ?? interview.meetingUrl;
    this.assertProviderCombination(
      effectiveCalendarProvider ?? undefined,
      effectiveVideoProvider,
      effectiveMeetingUrl ?? undefined,
    );
    const wasRescheduled =
      effectiveStartsAt.getTime() !== interview.startsAt.getTime() ||
      effectiveEndsAt.getTime() !== interview.endsAt.getTime();
    const isCancelled =
      dto.status === InterviewStatus.CANCELED &&
      interview.status !== InterviewStatus.CANCELED;
    if (wasRescheduled && !dto.allowConflict) {
      for (const userId of [...new Set([interview.interviewerUserId, ...interview.participants.map((item) => item.userId)])]) {
        await this.calendars?.assertNoConflict(tenantId, userId, effectiveStartsAt, effectiveEndsAt, id);
      }
      await this.assertResourcesAvailable(
        tenantId,
        interview.application.vacancy.branchId,
        interview.resourceBookings.map((item) => item.resourceId),
        effectiveStartsAt,
        effectiveEndsAt,
        id,
      );
    }
    const providerChanged =
      dto.calendarProvider !== undefined || dto.videoProvider !== undefined;
    const updatedInterview = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.applicationInterview.update({
        where: { id },
        data: {
          status: dto.status,
          completedAt: dto.status === InterviewStatus.COMPLETED
            ? interview.completedAt ?? new Date()
            : dto.status !== undefined
              ? null
              : undefined,
          startsAt,
          endsAt,
          timezone: dto.timezone,
          location: dto.location,
          meetingUrl: dto.meetingUrl,
          notes: dto.notes,
          calendarProvider: dto.calendarProvider,
          videoProvider: dto.videoProvider,
          ...(wasRescheduled || providerChanged
            ? { calendarSyncStatus: "PENDING", calendarSyncError: null }
            : {}),
        },
        include: interviewInclude,
      });
      if (wasRescheduled) {
        await tx.interviewResourceBooking.updateMany({
          where: { interviewId: id },
          data: { startsAt: effectiveStartsAt, endsAt: effectiveEndsAt },
        });
      }
      if (!wasRescheduled && !isCancelled) return updated;

      await this.communications?.cancelPendingInterviewMessages(tx, id);
      const type = isCancelled
        ? AtsCommunicationType.INTERVIEW_CANCELLED
        : AtsCommunicationType.INTERVIEW_RESCHEDULED;
      const interviewDate = effectiveStartsAt.toISOString();
      const interviewLocation = updated.meetingUrl || updated.location || "";
      await tx.applicationTimelineEvent.create({
        data: {
          tenantId,
          applicationId: updated.applicationId,
          type: isCancelled ? "INTERVIEW_CANCELLED" : "INTERVIEW_RESCHEDULED",
          occurredAt: new Date(),
          note: updated.title,
          actorType: "USER",
          actorId: actor.sub,
          actorDisplayName: this.actorDisplayName(actor),
          previousValue: {
            startsAt: interview.startsAt.toISOString(),
            endsAt: interview.endsAt.toISOString(),
            status: interview.status,
          },
          newValue: {
            startsAt: effectiveStartsAt.toISOString(),
            endsAt: effectiveEndsAt.toISOString(),
            status: updated.status,
          },
          reason: isCancelled
            ? "Entrevista cancelada"
            : "Entrevista reprogramada",
          source: "ATS_INTERVIEW",
        },
      });
      await this.communications?.enqueueEvent(tx, {
        tenantId,
        applicationId: updated.applicationId,
        interviewId: id,
        type,
        audiences: [
          AtsCommunicationAudience.CANDIDATE,
          AtsCommunicationAudience.RESPONSIBLE,
        ],
        deduplicationSuffix: `${id}:${type}:${interviewDate}`,
        actorType: "USER",
        actorId: actor.sub,
        variables: { interviewDate, interviewLocation },
      });
      if (!isCancelled) {
        await this.enqueueInterviewReminder(tx, {
          tenantId,
          applicationId: updated.applicationId,
          interviewId: id,
          startsAt: effectiveStartsAt,
          location: interviewLocation,
          actor,
        });
      }
      return updated;
    });
    if (
      isCancelled ||
      wasRescheduled ||
      providerChanged ||
      dto.meetingUrl !== undefined
    ) {
      try {
        await this.calendars?.syncInterview(
          tenantId,
          id,
          isCancelled ? "CANCEL" : "UPSERT",
        );
      } catch {
        // Synchronization status and error are persisted for manual retry.
      }
    }
    if (dto.status === InterviewStatus.COMPLETED && interview.status !== InterviewStatus.COMPLETED) {
      await this.domainEvents?.interviewCompleted(actor, {
        applicationId: updatedInterview.applicationId,
        candidateId: updatedInterview.application.candidate.id,
        vacancyId: updatedInterview.application.vacancy.id,
        branchId: updatedInterview.application.vacancy.branchId,
        interviewId: id,
        status: InterviewStatus.COMPLETED,
        payload: { interviewId: id, vacancyId: updatedInterview.application.vacancy.id },
      }, { idempotencyKey: `ats:interview-completed:${id}:${updatedInterview.completedAt?.toISOString() ?? 'completed'}` });
    }
    return this.prisma.applicationInterview.findUnique({
      where: { id: updatedInterview.id },
      include: interviewInclude,
    });
  }

  private async enqueueInterviewReminder(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      applicationId: string;
      interviewId: string;
      startsAt: Date;
      location: string;
      actor: JwtPayload;
    },
  ) {
    const reminderAt = new Date(
      Math.max(Date.now(), input.startsAt.getTime() - 24 * 60 * 60 * 1000),
    );
    await this.communications?.enqueueEvent(tx, {
      tenantId: input.tenantId,
      applicationId: input.applicationId,
      interviewId: input.interviewId,
      type: AtsCommunicationType.INTERVIEW_REMINDER,
      audiences: [
        AtsCommunicationAudience.CANDIDATE,
        AtsCommunicationAudience.RESPONSIBLE,
      ],
      scheduledAt: reminderAt,
      deduplicationSuffix: `${input.interviewId}:${input.startsAt.toISOString()}:24h`,
      actorType: "USER",
      actorId: input.actor.sub,
      variables: {
        interviewDate: input.startsAt.toISOString(),
        interviewLocation: input.location,
      },
    });
  }

  private async assertPanelEligible(
    tenantId: string,
    branchId: string,
    panelUserIds: string[],
    shadowUserIds: string[],
    startsAt: Date,
    endsAt: Date,
  ) {
    const allIds = [...new Set([...panelUserIds, ...shadowUserIds])];
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        id: { in: allIds },
        status: "ACTIVE",
        OR: [
          { isSuperAdmin: true },
          { userRoles: { some: { role: { code: { in: ["TENANT_ADMIN", "ADMIN", "PLATFORM_ADMIN"] } } } } },
          { branchAccesses: { some: { branchId } } },
        ],
      },
      include: { interviewerProfile: true },
    });
    if (users.length !== allIds.length) throw new BadRequestException("Every interviewer must be active and have branch access");
    for (const user of users) {
      const profile = user.interviewerProfile;
      const shadow = shadowUserIds.includes(user.id);
      if (profile?.trainingStatus === "SUSPENDED") throw new BadRequestException(`${user.email} is suspended from interviewing`);
      if (!shadow && profile && profile.trainingStatus !== "CERTIFIED") {
        throw new BadRequestException(`${user.email} must complete interviewer training or join as shadow`);
      }
      const dayStart = new Date(startsAt); dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 86_400_000);
      const weekStart = new Date(dayStart.getTime() - ((dayStart.getUTCDay() + 6) % 7) * 86_400_000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
      const [daily, weekly] = await Promise.all([
        this.prisma.applicationInterview.count({ where: { tenantId, startsAt: { gte: dayStart, lt: dayEnd }, status: { in: ["SCHEDULED", "CONFIRMED"] }, OR: [{ interviewerUserId: user.id }, { participants: { some: { userId: user.id, status: { not: "DECLINED" } } } }] } }),
        this.prisma.applicationInterview.count({ where: { tenantId, startsAt: { gte: weekStart, lt: weekEnd }, status: { in: ["SCHEDULED", "CONFIRMED"] }, OR: [{ interviewerUserId: user.id }, { participants: { some: { userId: user.id, status: { not: "DECLINED" } } } }] } }),
      ]);
      if (daily >= (profile?.maxInterviewsPerDay ?? 4) || weekly >= (profile?.maxInterviewsPerWeek ?? 12)) {
        throw new BadRequestException(`${user.email} reached the configured interview load limit`);
      }
    }
    if (endsAt <= startsAt) throw new BadRequestException("Interview end must be after start");
  }

  private async assertResourcesAvailable(
    tenantId: string,
    branchId: string,
    resourceIds: string[],
    startsAt: Date,
    endsAt: Date,
    excludeInterviewId?: string,
  ) {
    if (!resourceIds.length) return;
    const uniqueIds = [...new Set(resourceIds)];
    const resources = await this.prisma.interviewResource.count({ where: { id: { in: uniqueIds }, tenantId, branchId, active: true } });
    if (resources !== uniqueIds.length) throw new BadRequestException("Every interview resource must be active in the vacancy branch");
    const conflict = await this.prisma.interviewResourceBooking.findFirst({
      where: { tenantId, resourceId: { in: uniqueIds }, interviewId: excludeInterviewId ? { not: excludeInterviewId } : undefined, startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, interview: { status: { in: ["SCHEDULED", "CONFIRMED"] } } },
    });
    if (conflict) throw new BadRequestException("An interview room or resource is already reserved for this time");
  }

  private async findSubstitute(
    tenantId: string,
    participant: Prisma.ApplicationInterviewParticipantGetPayload<{ include: { interview: { include: { application: { include: { vacancy: true } }; participants: true } } } }>,
  ) {
    if (!participant.poolId) return null;
    const profile = await this.prisma.interviewerProfile.findFirst({ where: { tenantId, userId: participant.userId } });
    if (profile && !profile.autoSubstitutionEnabled) return null;
    const excluded = participant.interview.participants.map((item) => item.userId);
    const candidates = await this.prisma.interviewPoolMember.findMany({
      where: { tenantId, poolId: participant.poolId, active: true, userId: { notIn: excluded }, user: { status: "ACTIVE", interviewerProfile: { trainingStatus: "CERTIFIED" } } },
      include: { user: true },
      orderBy: { priority: "asc" },
    });
    for (const candidate of candidates) {
      try {
        await this.assertPanelEligible(tenantId, participant.interview.application.vacancy.branchId, [candidate.userId], [], participant.interview.startsAt, participant.interview.endsAt);
        await this.calendars?.assertNoConflict(tenantId, candidate.userId, participant.interview.startsAt, participant.interview.endsAt, participant.interviewId);
        return candidate;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async assertVacancy(tenantId: string, actor: JwtPayload, id: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: { id, tenantId, ...this.vacancyBranchScope(actor) },
      select: { id: true, branchId: true },
    });
    if (!vacancy) throw new NotFoundException("Vacancy not found");
    return vacancy;
  }

  private async assertInterview(
    tenantId: string,
    actor: JwtPayload,
    id: string,
  ) {
    const interview = await this.prisma.applicationInterview.findFirst({
      where: { id, tenantId, ...this.interviewBranchScope(actor) },
      include: {
        participants: true,
        resourceBookings: true,
        application: { select: { vacancy: { select: { branchId: true } } } },
      },
    });
    if (!interview) throw new NotFoundException("Interview not found");
    return interview;
  }

  private vacancyBranchScope(actor: JwtPayload): Prisma.VacancyWhereInput {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) return {};
    return { branchId: { in: actor.allowedBranchIds } };
  }

  private interviewBranchScope(
    actor: JwtPayload,
  ): Prisma.ApplicationInterviewWhereInput {
    const branchScope =
      actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH
        ? {}
        : {
            AND: [
              {
                application: {
                  vacancy: { branchId: { in: actor.allowedBranchIds } },
                },
              },
            ],
          };
    const interviewerScope: Prisma.ApplicationInterviewWhereInput =
      actor.roles.includes("INTERVIEWER") || actor.role === "INTERVIEWER"
        ? {
            OR: [
              { interviewerUserId: actor.sub },
              {
                participants: {
                  some: { userId: actor.sub, status: { not: "DECLINED" } },
                },
              },
            ],
          }
        : {};
    return { AND: [branchScope, interviewerScope] };
  }

  private assertActorCanAccessBranch(actor: JwtPayload, branchId: string) {
    if (
      !actor.isSuperAdmin &&
      actor.scope === AccessScope.BRANCH &&
      !actor.allowedBranchIds.includes(branchId)
    ) {
      throw new ForbiddenException("Branch is outside the actor access scope");
    }
  }

  private parseDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
      throw new BadRequestException(`${field} must be a valid ISO date`);
    return date;
  }

  private assertProviderCombination(
    calendarProvider?: CalendarProvider,
    videoProvider?: VideoConferenceProvider,
    meetingUrl?: string,
  ) {
    if (
      videoProvider === VideoConferenceProvider.GOOGLE_MEET &&
      calendarProvider !== CalendarProvider.GOOGLE
    ) {
      throw new BadRequestException("Google Meet requires Google Calendar");
    }
    if (
      videoProvider === VideoConferenceProvider.MICROSOFT_TEAMS &&
      calendarProvider !== CalendarProvider.MICROSOFT
    ) {
      throw new BadRequestException(
        "Microsoft Teams requires Microsoft Calendar",
      );
    }
    if (videoProvider === VideoConferenceProvider.MANUAL && !meetingUrl) {
      throw new BadRequestException(
        "A manual video conference requires meetingUrl",
      );
    }
  }
}
