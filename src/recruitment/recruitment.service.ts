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
import {
  ListInterviewsDto,
  ReplaceVacancyResponsiblesDto,
  ReplaceVacancyStagesDto,
  ScheduleInterviewDto,
  UpdateInterviewDto,
} from "./dto/recruitment.dto";

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
} satisfies Prisma.ApplicationInterviewInclude;

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly communications?: AtsCommunicationsService,
    private readonly calendars?: InterviewCalendarService,
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
    return this.prisma.applicationInterview.findMany({
      where: {
        tenantId,
        applicationId: query.applicationId,
        application: query.vacancyId
          ? { vacancyId: query.vacancyId }
          : undefined,
        interviewerUserId: interviewerOnly
          ? actor.sub
          : query.interviewerUserId,
        status: query.status,
        ...this.interviewBranchScope(actor),
      },
      include: interviewInclude,
      orderBy: { startsAt: "asc" },
    });
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
    if (!dto.allowConflict) {
      await this.calendars?.assertNoConflict(
        tenantId,
        dto.interviewerUserId,
        startsAt,
        endsAt,
      );
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
    return this.prisma.applicationInterview.findUnique({
      where: { id: created.id },
      include: interviewInclude,
    });
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
      await this.calendars?.assertNoConflict(
        tenantId,
        interview.interviewerUserId,
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
    const interviewerScope =
      actor.roles.includes("INTERVIEWER") || actor.role === "INTERVIEWER"
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
