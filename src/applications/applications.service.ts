import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApplicationStatus,
  ApplicationTimelineEventType as PrismaApplicationTimelineEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreatePublicApplicationDto } from './dto/create-public-application.dto';
import {
  ApplicationInterviewDto,
  ApplicationTimelineEventDto,
  ApplicationTrackingDto,
} from './dto/application-tracking.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

const applicationInclude = {
  candidate: true,
  vacancy: {
    include: {
      branch: true,
    },
  },
  timelineEvents: {
    orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.VacancyApplicationInclude;

type ApplicationWithRelations = Prisma.VacancyApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createPublic(vacancyId: string, dto: CreatePublicApplicationDto) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: {
        id: vacancyId,
        status: 'OPEN',
      },
      select: {
        id: true,
        tenantId: true,
        applicationFormSchema: true,
      },
    });

    if (!vacancy) {
      throw new NotFoundException('Vacancy not found');
    }

    const normalizedDynamicResponses = this.normalizeDynamicResponses(
      vacancy.applicationFormSchema,
      dto.dynamicResponses,
    ) as Prisma.InputJsonValue | undefined;

    const candidate = await this.prisma.candidate.upsert({
      where: { email: dto.email },
      update: {
        fullName: dto.fullName,
        phone: dto.phone,
        city: dto.city,
        linkedinUrl: dto.linkedinUrl,
        portfolioUrl: dto.portfolioUrl,
        resumeUrl: dto.resumeUrl,
      },
      create: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        city: dto.city,
        linkedinUrl: dto.linkedinUrl,
        portfolioUrl: dto.portfolioUrl,
        resumeUrl: dto.resumeUrl,
      },
    });

    const existing = await this.prisma.vacancyApplication.findUnique({
      where: {
        vacancyId_candidateId: {
          vacancyId,
          candidateId: candidate.id,
        },
      },
      include: applicationInclude,
    });

    if (existing) {
      return this.serializeApplication(existing);
    }

    const created = await this.prisma.vacancyApplication.create({
      data: {
        tenantId: vacancy.tenantId,
        vacancyId,
        candidateId: candidate.id,
        coverLetter: dto.coverLetter,
        dynamicResponses: normalizedDynamicResponses,
      },
      include: applicationInclude,
    });

    return this.serializeApplication(created);
  }

  async listForTenant(tenantId: string, query: ListApplicationsDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.VacancyApplicationWhereInput = {
      tenantId,
      ...(query.branchId ? { vacancy: { branchId: query.branchId } } : {}),
      ...(query.vacancyId ? { vacancyId: query.vacancyId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { candidate: { fullName: { contains: query.search, mode: 'insensitive' } } },
              { candidate: { email: { contains: query.search, mode: 'insensitive' } } },
              { vacancy: { title: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vacancyApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: { appliedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.vacancyApplication.count({ where }),
    ]);

    return {
      data: items.map((item) => this.serializeApplication(item)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async listForBranch(tenantId: string, branchId: string, query: ListApplicationsDto) {
    return this.listForTenant(tenantId, {
      ...query,
      branchId,
    });
  }

  async findOneForTenant(id: string, tenantId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
      },
      include: applicationInclude,
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return this.serializeApplication(application);
  }

  async updateStatus(id: string, tenantId: string, dto: UpdateApplicationStatusDto) {
    await this.assertBelongsToTenant(id, tenantId);

    await this.prisma.vacancyApplication.update({
      where: { id },
      data: this.buildUpdateData(dto),
    });

    if (dto.tracking !== undefined) {
      await this.replaceTimelineEvents(id, dto.tracking);
    }

    return this.findOneForTenant(id, tenantId);
  }

  async findOneForBranch(id: string, tenantId: string, branchId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
        vacancy: {
          branchId,
        },
      },
      include: applicationInclude,
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return this.serializeApplication(application);
  }

  async updateStatusForBranch(
    id: string,
    tenantId: string,
    branchId: string,
    dto: UpdateApplicationStatusDto,
  ) {
    await this.assertBelongsToBranch(id, tenantId, branchId);

    await this.prisma.vacancyApplication.update({
      where: { id },
      data: this.buildUpdateData(dto),
    });

    if (dto.tracking !== undefined) {
      await this.replaceTimelineEvents(id, dto.tracking);
    }

    return this.findOneForBranch(id, tenantId, branchId);
  }

  private async assertBelongsToTenant(id: string, tenantId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }
  }

  private async assertBelongsToBranch(id: string, tenantId: string, branchId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
        vacancy: {
          branchId,
        },
      },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }
  }

  private buildUpdateData(dto: UpdateApplicationStatusDto): Prisma.VacancyApplicationUpdateInput {
    const data: Prisma.VacancyApplicationUpdateInput = {
      status: dto.status,
      reviewedAt: dto.status === ApplicationStatus.SUBMITTED ? null : new Date(),
    };

    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }

    if (dto.interview !== undefined) {
      if (dto.interview === null) {
        data.interviewType = null;
        data.interviewScheduledAt = null;
        data.interviewFollowUpAt = null;
        data.interviewObservations = null;
      } else {
        const interview = this.normalizeInterview(dto.interview);
        data.interviewType = interview.type;
        data.interviewScheduledAt = interview.scheduledAt;
        data.interviewFollowUpAt = interview.followUpAt;
        data.interviewObservations = interview.observations;
      }
    }

    if (dto.tracking !== undefined) {
      if (dto.tracking === null) {
        data.contactedAt = null;
        data.interviewCompletedAt = null;
      } else {
        const tracking = this.normalizeTracking(dto.tracking);
        data.contactedAt = tracking.contactedAt;
        data.interviewCompletedAt = tracking.interviewCompletedAt;
      }
    }

    return data;
  }

  private async replaceTimelineEvents(
    applicationId: string,
    tracking: ApplicationTrackingDto | null | undefined,
  ) {
    await this.prisma.applicationTimelineEvent.deleteMany({
      where: { applicationId },
    });

    if (!tracking || !Array.isArray(tracking.timelineEvents) || tracking.timelineEvents.length === 0) {
      return;
    }

    const timelineEvents = tracking.timelineEvents.map((event) =>
      this.normalizeTimelineEvent(event),
    );

    await this.prisma.applicationTimelineEvent.createMany({
      data: timelineEvents.map((event) => ({
        applicationId,
        type: event.type,
        occurredAt: event.at,
        note: event.note,
      })),
    });
  }

  private serializeApplication(application: ApplicationWithRelations) {
    const interview =
      application.interviewType ||
      application.interviewScheduledAt ||
      application.interviewFollowUpAt ||
      application.interviewObservations
        ? {
            type: application.interviewType,
            scheduledAt: application.interviewScheduledAt,
            followUpAt: application.interviewFollowUpAt,
            observations: application.interviewObservations,
          }
        : null;

    const timelineEvents = this.buildTimelineEvents(application);
    const tracking =
      application.contactedAt ||
      application.interviewCompletedAt ||
      timelineEvents.length > 0
        ? {
            contactedAt: application.contactedAt,
            interviewCompletedAt: application.interviewCompletedAt,
            timelineEvents,
          }
        : null;

    return {
      id: application.id,
      tenantId: application.tenantId,
      vacancyId: application.vacancyId,
      candidateId: application.candidateId,
      status: application.status,
      coverLetter: application.coverLetter,
      dynamicResponses: application.dynamicResponses,
      notes: application.notes,
      interview,
      tracking,
      appliedAt: application.appliedAt,
      reviewedAt: application.reviewedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      candidate: application.candidate,
      vacancy: application.vacancy,
    };
  }

  private buildTimelineEvents(application: ApplicationWithRelations) {
    const persistedByType = new Map(
      application.timelineEvents.map((event) => [
        event.type,
        {
          type: event.type as PrismaApplicationTimelineEventType,
          at: event.occurredAt,
          note: event.note,
        },
      ]),
    );

    const events = [
      this.buildBaseTimelineEvent(
        PrismaApplicationTimelineEventType.VACANCY_PUBLISHED,
        application.vacancy.createdAt,
        persistedByType,
      ),
      this.buildBaseTimelineEvent(
        PrismaApplicationTimelineEventType.APPLIED,
        application.appliedAt,
        persistedByType,
      ),
      this.buildBaseTimelineEvent(
        PrismaApplicationTimelineEventType.CONTACTED,
        application.contactedAt,
        persistedByType,
      ),
      this.buildBaseTimelineEvent(
        PrismaApplicationTimelineEventType.INTERVIEW_SCHEDULED,
        application.interviewScheduledAt,
        persistedByType,
      ),
      this.buildBaseTimelineEvent(
        PrismaApplicationTimelineEventType.INTERVIEW_COMPLETED,
        application.interviewCompletedAt,
        persistedByType,
      ),
    ];

    return events.filter((event) => event.at !== null || event.note !== null);
  }

  private buildBaseTimelineEvent(
    type: PrismaApplicationTimelineEventType,
    at: Date | null,
    persistedByType: Map<
      PrismaApplicationTimelineEventType,
      { type: PrismaApplicationTimelineEventType; at: Date | null; note: string | null }
    >,
  ) {
    const persisted = persistedByType.get(type);

    return {
      type,
      at: at ?? persisted?.at ?? null,
      note: persisted?.note ?? null,
    };
  }

  private normalizeDynamicResponses(
    schema: Prisma.JsonValue | null,
    responses: Record<string, unknown> | undefined,
  ) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return responses && Object.keys(responses).length > 0 ? responses : undefined;
    }

    const sections = Array.isArray((schema as { sections?: unknown }).sections)
      ? ((schema as { sections: Array<{ fields?: Array<Record<string, unknown>> }> }).sections ?? [])
      : [];

    const fields = sections.flatMap((section) =>
      Array.isArray(section.fields) ? section.fields : [],
    );

    if (fields.length === 0) {
      return responses && Object.keys(responses).length > 0 ? responses : undefined;
    }

    const source = responses ?? {};
    const normalized: Record<string, unknown> = {};

    for (const field of fields) {
      const key = typeof field.key === 'string' ? field.key : '';
      const label = typeof field.label === 'string' ? field.label : 'campo';
      const type = typeof field.type === 'string' ? field.type : 'TEXT';
      const required = Boolean(field.required);
      const options = Array.isArray(field.options)
        ? field.options.map((option) => String(option))
        : [];
      const rawValue = source[key];

      const isEmptyArray = Array.isArray(rawValue) && rawValue.length === 0;
      const isEmptyString =
        typeof rawValue === 'string' && rawValue.trim().length === 0;

      if (required && (rawValue === undefined || rawValue === null || isEmptyArray || isEmptyString)) {
        throw new BadRequestException(`Missing required dynamic field: ${label}`);
      }

      if (rawValue === undefined || rawValue === null || isEmptyArray || isEmptyString) {
        continue;
      }

      switch (type) {
        case 'NUMBER': {
          const numeric = Number(rawValue);
          if (Number.isNaN(numeric)) {
            throw new BadRequestException(`Invalid number for dynamic field: ${label}`);
          }
          normalized[key] = numeric;
          break;
        }
        case 'BOOLEAN': {
          if (typeof rawValue === 'boolean') {
            normalized[key] = rawValue;
          } else if (rawValue === 'true' || rawValue === 'false') {
            normalized[key] = rawValue === 'true';
          } else {
            throw new BadRequestException(`Invalid boolean for dynamic field: ${label}`);
          }
          break;
        }
        case 'MULTI_SELECT': {
          const values = Array.isArray(rawValue) ? rawValue.map((value) => String(value)) : [String(rawValue)];
          if (options.length > 0 && values.some((value) => !options.includes(value))) {
            throw new BadRequestException(`Invalid option for dynamic field: ${label}`);
          }
          normalized[key] = values;
          break;
        }
        case 'SINGLE_SELECT': {
          const value = String(rawValue);
          if (options.length > 0 && !options.includes(value)) {
            throw new BadRequestException(`Invalid option for dynamic field: ${label}`);
          }
          normalized[key] = value;
          break;
        }
        default:
          normalized[key] = String(rawValue);
      }
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private normalizeInterview(interview: ApplicationInterviewDto) {
    return {
      type: interview.type,
      scheduledAt: interview.scheduledAt ? new Date(interview.scheduledAt) : null,
      followUpAt: interview.followUpAt ? new Date(interview.followUpAt) : null,
      observations: interview.observations?.trim() || null,
    };
  }

  private normalizeTracking(tracking: ApplicationTrackingDto) {
    return {
      contactedAt: tracking.contactedAt ? new Date(tracking.contactedAt) : null,
      interviewCompletedAt: tracking.interviewCompletedAt
        ? new Date(tracking.interviewCompletedAt)
        : null,
    };
  }

  private normalizeTimelineEvent(event: ApplicationTimelineEventDto) {
    return {
      type: event.type,
      at: event.at ? new Date(event.at) : null,
      note: event.note?.trim() || null,
    };
  }
}
