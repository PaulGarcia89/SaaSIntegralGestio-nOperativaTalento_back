import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApplicationStatus,
  AtsCommunicationAudience,
  AtsCommunicationType,
  ApplicationTimelineEventType as PrismaApplicationTimelineEventType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { JwtPayload } from "../common/interfaces/jwt-payload.interface";
import { AccessScope } from "../common/enums/access-scope.enum";
import { normalizeOffsetPagination } from "../common/utils/pagination.util";
import { CreatePublicApplicationDto } from "./dto/create-public-application.dto";
import {
  ApplicationInterviewDto,
  ApplicationTimelineEventDto,
  ApplicationTrackingDto,
} from "./dto/application-tracking.dto";
import { ListApplicationsDto } from "./dto/list-applications.dto";
import { UpdateApplicationStatusDto } from "./dto/update-application-status.dto";
import { BulkUpdateApplicationsDto } from "./dto/bulk-update-applications.dto";
import { AtsPrivateFileService } from "../common/files/ats-private-file.service";
import { TrainingAntivirusService } from "../training/training-antivirus.service";
import { AtsCommunicationsService } from "../ats-communications/ats-communications.service";

const applicationInclude = {
  candidate: {
    include: {
      resumeFiles: {
        where: { status: "ACTIVE" },
        orderBy: { version: "desc" },
        take: 1,
        select: {
          id: true,
          version: true,
          originalName: true,
          mimeType: true,
          sizeBytes: true,
        },
      },
    },
  },
  vacancy: {
    include: {
      branch: true,
      stages: {
        orderBy: { position: "asc" },
      },
    },
  },
  currentStage: true,
  timelineEvents: {
    orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  },
  interviews: {
    include: {
      stage: true,
      interviewer: {
        select: { id: true, firstName: true, lastName: true },
      },
      scorecards: true,
    },
    orderBy: { startsAt: "asc" },
  },
  transitionRequests: {
    where: { status: "PENDING" },
    include: {
      fromStage: true,
      toStage: true,
      approvals: true,
    },
    orderBy: { requestedAt: "desc" },
  },
} satisfies Prisma.VacancyApplicationInclude;

type ApplicationWithRelations = Prisma.VacancyApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files?: AtsPrivateFileService,
    private readonly antivirus?: TrainingAntivirusService,
    private readonly communications?: AtsCommunicationsService,
  ) {}

  async createPublic(
    vacancyId: string,
    candidateAccountId: string,
    authenticatedEmail: string,
    dto: CreatePublicApplicationDto,
    resume?: Express.Multer.File,
    consentContext?: { ip?: string; userAgent?: string },
  ) {
    if (
      dto.email.trim().toLowerCase() !== authenticatedEmail.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        "Application email must match the candidate identity",
      );
    }
    const vacancy = await this.prisma.vacancy.findFirst({
      where: {
        id: vacancyId,
        status: "OPEN",
      },
      select: {
        id: true,
        tenantId: true,
        applicationFormSchema: true,
        stages: {
          orderBy: { position: "asc" },
        },
      },
    });

    if (!vacancy) {
      throw new NotFoundException("Vacancy not found");
    }

    const normalizedDynamicResponses = this.normalizeDynamicResponses(
      vacancy.applicationFormSchema,
      dto.dynamicResponses,
    ) as Prisma.InputJsonValue | undefined;

    let storedResume: {
      storageKey: string;
      sha256: string;
      mimeType: string;
      scanStatus: "CLEAN" | "SKIPPED";
      scanEngine: string | null;
    } | null = null;
    let resumeConsentVersion: string | null = null;
    if (resume) {
      const consentVersion = dto.resumeConsentVersion?.trim();
      if (!dto.resumeConsent || !consentVersion) {
        throw new BadRequestException("Resume processing consent is required");
      }
      if (!this.files || !this.antivirus) {
        throw new BadRequestException("Resume upload is not available");
      }
      const mimeType = this.files.validateResume(resume);
      const scan = await this.antivirus.scan(resume.buffer);
      const stored = await this.files.store(
        "resume",
        vacancy.tenantId,
        candidateAccountId,
        resume,
        mimeType,
      );
      storedResume = {
        ...stored,
        mimeType,
        scanStatus: scan.status,
        scanEngine: scan.engine,
      };
      resumeConsentVersion = consentVersion;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const candidate = await tx.candidate.upsert({
          where: {
            tenantId_email: {
              tenantId: vacancy.tenantId,
              email: dto.email,
            },
          },
          update: {
            accountId: candidateAccountId,
            fullName: dto.fullName,
            phone: dto.phone,
            city: dto.city,
            linkedinUrl: dto.linkedinUrl,
            portfolioUrl: dto.portfolioUrl,
          },
          create: {
            accountId: candidateAccountId,
            tenantId: vacancy.tenantId,
            fullName: dto.fullName,
            email: dto.email,
            phone: dto.phone,
            city: dto.city,
            linkedinUrl: dto.linkedinUrl,
            portfolioUrl: dto.portfolioUrl,
          },
        });

        const existing = await tx.vacancyApplication.findUnique({
          where: {
            vacancyId_candidateId: {
              vacancyId,
              candidateId: candidate.id,
            },
          },
          include: applicationInclude,
        });

        const initialStage = vacancy.stages[0];
        const initialStatus =
          initialStage &&
          initialStage.applicationStatus !== ApplicationStatus.HIRED
            ? initialStage.applicationStatus
            : ApplicationStatus.SUBMITTED;
        const created =
          existing ??
          (await tx.vacancyApplication.create({
            data: {
              tenantId: vacancy.tenantId,
              vacancyId,
              candidateId: candidate.id,
              currentStageId: initialStage?.id,
              stageEnteredAt: new Date(),
              status: initialStatus,
              coverLetter: dto.coverLetter,
              dynamicResponses: normalizedDynamicResponses,
              timelineEvents: {
                create: {
                  tenantId: vacancy.tenantId,
                  type: PrismaApplicationTimelineEventType.APPLIED,
                  occurredAt: new Date(),
                  note: "Postulación recibida",
                  actorType: "CANDIDATE",
                  actorId: candidateAccountId,
                  actorDisplayName: dto.fullName.trim(),
                  previousValue: Prisma.JsonNull,
                  newValue: {
                    status: initialStatus,
                    stageId: initialStage?.id ?? null,
                    stageCode: initialStage?.code ?? null,
                    stageName: initialStage?.name ?? null,
                  },
                  source: "PUBLIC_APPLICATION",
                },
              },
            },
            include: applicationInclude,
          }));

        if (storedResume && resume) {
          const latest = await tx.candidateResumeFile.aggregate({
            where: { candidateId: candidate.id },
            _max: { version: true },
          });
          await tx.candidateResumeFile.updateMany({
            where: { candidateId: candidate.id, status: "ACTIVE" },
            data: { status: "SUPERSEDED", supersededAt: new Date() },
          });
          await tx.candidateResumeFile.create({
            data: {
              tenantId: vacancy.tenantId,
              candidateId: candidate.id,
              applicationId: created.id,
              version: (latest._max.version ?? 0) + 1,
              storageKey: storedResume.storageKey,
              originalName: resume.originalname,
              mimeType: storedResume.mimeType,
              sizeBytes: resume.size,
              sha256: storedResume.sha256,
              scanStatus: storedResume.scanStatus,
              scanEngine: storedResume.scanEngine,
              uploadedByType: "CANDIDATE",
              uploadedById: candidateAccountId,
              consentGrantedAt: new Date(),
              consentVersion: resumeConsentVersion!,
              consentIp: consentContext?.ip,
              consentUserAgent: consentContext?.userAgent,
              retainUntil: this.files!.retentionDate("resume"),
            },
          });
        }

        await this.communications?.enqueueEvent(tx, {
          tenantId: vacancy.tenantId,
          applicationId: created.id,
          type: AtsCommunicationType.APPLICATION_CONFIRMATION,
          audiences: [
            AtsCommunicationAudience.CANDIDATE,
            AtsCommunicationAudience.RESPONSIBLE,
          ],
          stageCode: initialStage?.code,
          deduplicationSuffix: "application-created",
          actorType: "CANDIDATE",
          actorId: candidateAccountId,
        });

        return this.serializeApplication(created);
      });
    } catch (error) {
      if (storedResume && this.files)
        await this.files.delete(storedResume.storageKey);
      throw error;
    }
  }

  async listForCandidate(candidateAccountId: string) {
    const applications = await this.prisma.vacancyApplication.findMany({
      where: { candidate: { accountId: candidateAccountId } },
      include: applicationInclude,
      orderBy: { appliedAt: "desc" },
    });

    return applications.map((application) =>
      this.serializeApplication(application),
    );
  }

  async listForTenant(
    actor: JwtPayload,
    tenantId: string,
    query: ListApplicationsDto,
  ) {
    const pagination = normalizeOffsetPagination(query);
    const effectiveBranchFilter = this.resolveBranchFilter(
      actor,
      query.branchId,
    );
    const where: Prisma.VacancyApplicationWhereInput = {
      tenantId,
      ...(actor.role === "INTERVIEWER" || actor.roles.includes("INTERVIEWER")
        ? { interviewerUserId: actor.sub }
        : {}),
      ...(effectiveBranchFilter
        ? {
            vacancy: {
              branchId: effectiveBranchFilter,
            },
          }
        : {}),
      ...(query.vacancyId ? { vacancyId: query.vacancyId } : {}),
      ...(query.currentStageId ? { currentStageId: query.currentStageId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              {
                candidate: {
                  fullName: { contains: query.search, mode: "insensitive" },
                },
              },
              {
                candidate: {
                  email: { contains: query.search, mode: "insensitive" },
                },
              },
              {
                vacancy: {
                  title: { contains: query.search, mode: "insensitive" },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vacancyApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: { appliedAt: "desc" },
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

  async exportForTenant(
    actor: JwtPayload,
    tenantId: string,
    query: ListApplicationsDto,
  ) {
    const result = await this.listForTenant(actor, tenantId, {
      ...query,
      page: 1,
      pageSize: Math.min(query.pageSize ?? 100, 100),
    });
    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      count: result.data.length,
      data: result.data,
    };
  }

  async bulkUpdateStatus(
    actor: JwtPayload,
    tenantId: string,
    dto: BulkUpdateApplicationsDto,
  ) {
    const ids = [...new Set(dto.ids)];
    const where: Prisma.VacancyApplicationWhereInput = {
      id: { in: ids },
      tenantId,
      ...this.buildBranchScopedWhere(actor),
    };
    const authorized = await this.prisma.vacancyApplication.findMany({
      where,
      select: { id: true },
    });
    if (authorized.length !== ids.length) {
      throw new NotFoundException("One or more applications were not found");
    }

    for (const application of authorized) {
      await this.updateStatus(application.id, actor, tenantId, {
        status: dto.status,
      });
    }
    return { updated: authorized.length };
  }

  async getResumeFile(id: string, actor: JwtPayload, tenantId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor),
      },
      select: {
        id: true,
        candidate: {
          select: {
            resumeFiles: {
              where: { status: "ACTIVE" },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
      },
    });
    if (!application) {
      throw new NotFoundException("Application file not found");
    }
    const resume = application.candidate.resumeFiles[0];
    if (!resume || !this.files) {
      throw new NotFoundException("Resume file not found");
    }
    return {
      applicationId: application.id,
      fileId: resume.id,
      version: resume.version,
      originalName: resume.originalName,
      mimeType: resume.mimeType,
      sizeBytes: resume.sizeBytes,
      ...this.files.createSignedUrl("resume", resume.id),
    };
  }

  async listResumeVersions(id: string, actor: JwtPayload, tenantId: string) {
    const application = await this.findApplicationState(id, actor, tenantId);
    return this.prisma.candidateResumeFile.findMany({
      where: { tenantId, candidateId: application.candidate.id },
      select: {
        id: true,
        version: true,
        status: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        scanStatus: true,
        consentGrantedAt: true,
        consentVersion: true,
        retainUntil: true,
        createdAt: true,
        deletedAt: true,
        deletionReason: true,
      },
      orderBy: { version: "desc" },
    });
  }

  async replaceResume(
    id: string,
    actor: JwtPayload,
    tenantId: string,
    file: Express.Multer.File,
    reason?: string,
  ) {
    const application = await this.findApplicationState(id, actor, tenantId);
    if (!this.files || !this.antivirus)
      throw new BadRequestException("Resume upload is not available");
    const mimeType = this.files.validateResume(file);
    const scan = await this.antivirus.scan(file.buffer);
    const stored = await this.files.store(
      "resume",
      tenantId,
      application.candidate.id,
      file,
      mimeType,
    );
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.candidateResumeFile.aggregate({
          where: { candidateId: application.candidate.id },
          _max: { version: true },
        });
        await tx.candidateResumeFile.updateMany({
          where: { candidateId: application.candidate.id, status: "ACTIVE" },
          data: { status: "SUPERSEDED", supersededAt: new Date() },
        });
        return tx.candidateResumeFile.create({
          data: {
            tenantId,
            candidateId: application.candidate.id,
            applicationId: id,
            version: (latest._max.version ?? 0) + 1,
            storageKey: stored.storageKey,
            originalName: file.originalname,
            mimeType,
            sizeBytes: file.size,
            sha256: stored.sha256,
            scanStatus: scan.status,
            scanEngine: scan.engine,
            uploadedByType: "USER",
            uploadedById: actor.sub,
            consentGrantedAt: new Date(),
            consentVersion: "internal-authorized-replacement-v1",
            retainUntil: this.files!.retentionDate("resume"),
            deletionReason: reason?.trim() || null,
          },
        });
      });
      return {
        ...created,
        storageKey: undefined,
        ...this.files.createSignedUrl("resume", created.id),
      };
    } catch (error) {
      await this.files.delete(stored.storageKey);
      throw error;
    }
  }

  async deleteResumeVersion(
    id: string,
    fileId: string,
    actor: JwtPayload,
    tenantId: string,
    reason: string,
  ) {
    const application = await this.findApplicationState(id, actor, tenantId);
    const file = await this.prisma.candidateResumeFile.findFirst({
      where: {
        id: fileId,
        tenantId,
        candidateId: application.candidate.id,
        status: { not: "DELETED" },
      },
    });
    if (!file) throw new NotFoundException("Resume version not found");
    if (!reason?.trim())
      throw new BadRequestException("Deletion reason is required");
    const deleted = await this.prisma.candidateResumeFile.update({
      where: { id: file.id },
      data: {
        status: "DELETED",
        deletedAt: new Date(),
        deletedByUserId: actor.sub,
        deletionReason: reason.trim(),
      },
      select: {
        id: true,
        version: true,
        status: true,
        deletedAt: true,
        deletionReason: true,
      },
    });
    await this.files?.delete(file.storageKey);
    return deleted;
  }

  async listForBranch(
    tenantId: string,
    branchId: string,
    query: ListApplicationsDto,
  ) {
    return this.listForTenant(
      {
        sub: "branch-context",
        userId: "branch-context",
        tenantId,
        allowedBranchIds: [branchId],
        allowedTenantIds: [tenantId],
        activeTenantId: tenantId,
        tenantSlug: "",
        tenantName: "",
        email: "",
        firstName: "",
        lastName: "",
        role: "BRANCH_USER",
        activeBranchId: branchId,
        scope: AccessScope.BRANCH,
        isSuperAdmin: false,
        roleScope: "branch_user",
        roles: ["BRANCH_USER"],
        permissions: [],
        enabledModules: [],
        isGlobalContext: false,
        impersonation: {
          active: false,
          tenantId: null,
          startedAt: null,
          reason: null,
        },
        subscriptionStatus: "ACTIVE",
        subscriptionGraceEndsAt: null,
      } as JwtPayload,
      tenantId,
      {
        ...query,
        branchId,
      },
    );
  }

  async findOneForTenant(id: string, actor: JwtPayload, tenantId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor),
      },
      include: applicationInclude,
    });

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    return this.serializeApplication(application);
  }

  async updateStatus(
    id: string,
    actor: JwtPayload,
    tenantId: string,
    dto: UpdateApplicationStatusDto,
  ) {
    const application = await this.findApplicationState(id, actor, tenantId);
    const targetStage = await this.resolveTargetStage(
      tenantId,
      application.vacancyId,
      dto.currentStageId,
      dto.status,
    );
    if (dto.status && !targetStage && dto.status !== application.status) {
      throw new BadRequestException(
        "The requested status is not mapped to a stage in this vacancy",
      );
    }
    const targetStatus =
      targetStage?.applicationStatus ?? dto.status ?? application.status;
    this.assertStatusCanBeChangedDirectly(targetStatus);
    await this.assertInterviewerBelongsToTenant(
      dto.interview?.interviewerUserId,
      tenantId,
    );
    const changesStage = Boolean(
      targetStage && targetStage.id !== application.currentStageId,
    );
    if (changesStage && targetStage) {
      this.assertTransitionAllowed(application, targetStage, dto.reason);
      this.assertRequiredFields(application, targetStage);
      if (targetStage.requiresApproval) {
        await this.prisma.$transaction(async (tx) => {
          await tx.applicationStageTransitionRequest.updateMany({
            where: { applicationId: id, status: "PENDING" },
            data: { status: "CANCELLED", decidedAt: new Date() },
          });
          const transitionRequest =
            await tx.applicationStageTransitionRequest.create({
              data: {
                tenantId,
                applicationId: id,
                fromStageId: application.currentStageId,
                toStageId: targetStage.id,
                requestedByUserId: actor.sub,
                requiredApprovals: Math.max(1, targetStage.requiredApprovals),
                reason: dto.reason?.trim() || null,
              },
            });
          await this.createTimelineEvent(tx, {
            tenantId,
            applicationId: id,
            type: PrismaApplicationTimelineEventType.STAGE_CHANGE_REQUESTED,
            actor,
            previousValue: this.applicationStateSnapshot(
              application.status,
              application.currentStage,
            ),
            newValue: this.applicationStateSnapshot(targetStatus, targetStage),
            reason: dto.reason,
            note: `Cambio solicitado hacia ${targetStage.name}`,
            source: "ATS_TRANSITION",
            metadata: { transitionRequestId: transitionRequest.id },
          });
          await this.communications?.enqueueEvent(tx, {
            tenantId,
            applicationId: id,
            type: AtsCommunicationType.APPROVAL_REQUEST,
            audiences: [AtsCommunicationAudience.RESPONSIBLE],
            stageCode: targetStage.code,
            deduplicationSuffix: `request:${transitionRequest.id}`,
            actorType: "USER",
            actorId: actor.sub,
            variables: { stageName: targetStage.name, reason: dto.reason },
          });
          if (dto.notes !== undefined) {
            await tx.vacancyApplication.update({
              where: { id },
              data: { notes: dto.notes },
            });
          }
        });
        return this.findOneForTenant(id, actor, tenantId);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.vacancyApplication.update({
        where: { id },
        data: {
          ...this.buildUpdateData(dto, targetStatus),
          ...(targetStage
            ? { currentStage: { connect: { id: targetStage.id } } }
            : {}),
          ...(changesStage
            ? {
                stageEnteredAt: new Date(),
                rejectionReason:
                  targetStatus === ApplicationStatus.REJECTED
                    ? dto.reason?.trim()
                    : null,
              }
            : {}),
        },
      });

      if (changesStage || targetStatus !== application.status) {
        const timelineEvent = await this.createTimelineEvent(tx, {
          tenantId,
          applicationId: id,
          type: PrismaApplicationTimelineEventType.STAGE_CHANGED,
          actor,
          previousValue: this.applicationStateSnapshot(
            application.status,
            application.currentStage,
          ),
          newValue: this.applicationStateSnapshot(targetStatus, targetStage),
          reason: dto.reason,
          note: targetStage
            ? `Etapa actualizada a ${targetStage.name}`
            : `Estado actualizado a ${targetStatus}`,
          source: "ATS_TRANSITION",
        });
        const communicationType =
          targetStatus === ApplicationStatus.REJECTED
            ? AtsCommunicationType.REJECTION
            : targetStatus === ApplicationStatus.APPROVED
              ? AtsCommunicationType.OFFER
              : AtsCommunicationType.STAGE_UPDATE;
        await this.communications?.enqueueEvent(tx, {
          tenantId,
          applicationId: id,
          type: communicationType,
          audiences: [
            AtsCommunicationAudience.CANDIDATE,
            AtsCommunicationAudience.RESPONSIBLE,
          ],
          stageCode: targetStage?.code,
          deduplicationSuffix: `timeline:${timelineEvent.id}`,
          actorType: "USER",
          actorId: actor.sub,
          variables: {
            stageName: targetStage?.name ?? targetStatus,
            reason: dto.reason,
          },
        });
      }

      if (dto.tracking !== undefined) {
        await this.appendTimelineEvents(tx, tenantId, id, actor, dto.tracking);
      }
    });

    return this.findOneForTenant(id, actor, tenantId);
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
      throw new NotFoundException("Application not found");
    }

    return this.serializeApplication(application);
  }

  async updateStatusForBranch(
    id: string,
    actor: JwtPayload,
    tenantId: string,
    branchId: string,
    dto: UpdateApplicationStatusDto,
  ) {
    if (!actor.allowedBranchIds.includes(branchId)) {
      throw new NotFoundException("Application not found");
    }
    return this.updateStatus(id, actor, tenantId, dto);
  }

  private async findApplicationState(
    id: string,
    actor: JwtPayload,
    tenantId: string,
  ) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor),
      },
      select: {
        id: true,
        vacancyId: true,
        status: true,
        currentStageId: true,
        currentStage: true,
        candidate: {
          include: {
            resumeFiles: {
              where: { status: "ACTIVE" },
              orderBy: { version: "desc" },
              take: 1,
            },
          },
        },
        coverLetter: true,
        dynamicResponses: true,
        interviews: {
          include: { scorecards: true },
        },
      },
    });

    if (!application) {
      throw new NotFoundException("Application not found");
    }

    return application;
  }

  async decideTransition(
    id: string,
    requestId: string,
    actor: JwtPayload,
    tenantId: string,
    approved: boolean,
    note?: string,
  ) {
    const application = await this.findApplicationState(id, actor, tenantId);
    const request =
      await this.prisma.applicationStageTransitionRequest.findFirst({
        where: {
          id: requestId,
          applicationId: id,
          tenantId,
          status: "PENDING",
        },
        include: { fromStage: true, toStage: true },
      });
    if (!request)
      throw new NotFoundException("Pending transition request not found");
    if (approved && request.requestedByUserId === actor.sub) {
      throw new BadRequestException(
        "The requester cannot approve their own transition",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.applicationStageTransitionApproval.upsert({
        where: {
          requestId_reviewerUserId: { requestId, reviewerUserId: actor.sub },
        },
        update: { approved, note: note?.trim() || null, decidedAt: new Date() },
        create: {
          requestId,
          reviewerUserId: actor.sub,
          approved,
          note: note?.trim() || null,
        },
      });
      if (!approved) {
        await tx.applicationStageTransitionRequest.update({
          where: { id: requestId },
          data: { status: "REJECTED", decidedAt: new Date() },
        });
        await this.createTimelineEvent(tx, {
          tenantId,
          applicationId: id,
          type: PrismaApplicationTimelineEventType.STAGE_CHANGE_REJECTED,
          actor,
          previousValue: this.applicationStateSnapshot(
            application.status,
            application.currentStage,
          ),
          newValue: this.applicationStateSnapshot(
            request.toStage.applicationStatus,
            request.toStage,
          ),
          reason: note,
          note: `Solicitud de cambio hacia ${request.toStage.name} rechazada`,
          source: "ATS_APPROVAL",
          metadata: { transitionRequestId: request.id },
        });
        return;
      }
      const approvals = await tx.applicationStageTransitionApproval.count({
        where: { requestId, approved: true },
      });
      if (approvals >= request.requiredApprovals) {
        await tx.vacancyApplication.update({
          where: { id },
          data: {
            currentStage: { connect: { id: request.toStageId } },
            status: request.toStage.applicationStatus,
            stageEnteredAt: new Date(),
            rejectionReason:
              request.toStage.applicationStatus === "REJECTED"
                ? request.reason
                : null,
            reviewedAt: new Date(),
          },
        });
        await tx.applicationStageTransitionRequest.update({
          where: { id: requestId },
          data: { status: "APPROVED", decidedAt: new Date() },
        });
        await this.createTimelineEvent(tx, {
          tenantId,
          applicationId: id,
          type: PrismaApplicationTimelineEventType.STAGE_CHANGED,
          actor,
          previousValue: this.applicationStateSnapshot(
            application.status,
            request.fromStage,
          ),
          newValue: this.applicationStateSnapshot(
            request.toStage.applicationStatus,
            request.toStage,
          ),
          reason: request.reason,
          note: `Cambio aprobado hacia ${request.toStage.name}`,
          source: "ATS_APPROVAL",
          metadata: { transitionRequestId: request.id, approvals },
        });
        const communicationType =
          request.toStage.applicationStatus === ApplicationStatus.REJECTED
            ? AtsCommunicationType.REJECTION
            : request.toStage.applicationStatus === ApplicationStatus.APPROVED
              ? AtsCommunicationType.OFFER
              : AtsCommunicationType.STAGE_UPDATE;
        await this.communications?.enqueueEvent(tx, {
          tenantId,
          applicationId: id,
          type: communicationType,
          audiences: [
            AtsCommunicationAudience.CANDIDATE,
            AtsCommunicationAudience.RESPONSIBLE,
          ],
          stageCode: request.toStage.code,
          deduplicationSuffix: `approved-request:${request.id}`,
          actorType: "USER",
          actorId: actor.sub,
          variables: {
            stageName: request.toStage.name,
            reason: request.reason,
          },
        });
      } else {
        await this.createTimelineEvent(tx, {
          tenantId,
          applicationId: id,
          type: PrismaApplicationTimelineEventType.STAGE_CHANGE_APPROVED,
          actor,
          previousValue: this.applicationStateSnapshot(
            application.status,
            application.currentStage,
          ),
          newValue: this.applicationStateSnapshot(
            request.toStage.applicationStatus,
            request.toStage,
          ),
          reason: note,
          note: `Aprobación ${approvals} de ${request.requiredApprovals} registrada`,
          source: "ATS_APPROVAL",
          metadata: { transitionRequestId: request.id, approvals },
        });
      }
    });
    return this.findOneForTenant(id, actor, tenantId);
  }

  private assertTransitionAllowed(
    application: Awaited<
      ReturnType<ApplicationsService["findApplicationState"]>
    >,
    targetStage: NonNullable<
      Awaited<ReturnType<ApplicationsService["resolveTargetStage"]>>
    >,
    reason?: string,
  ) {
    const current = application.currentStage;
    if (current) {
      if (!(current.allowedNextStageCodes ?? []).includes(targetStage.code)) {
        throw new BadRequestException(
          `Transition from ${current.name} to ${targetStage.name} is not allowed`,
        );
      }
      if (
        application.status === ApplicationStatus.REJECTED &&
        !current.allowReopen
      ) {
        throw new BadRequestException(
          "This rejected application cannot be reopened",
        );
      }
    }
    if (
      targetStage.applicationStatus === ApplicationStatus.REJECTED &&
      !reason?.trim()
    ) {
      throw new BadRequestException("A rejection reason is required");
    }
  }

  private assertRequiredFields(
    application: Awaited<
      ReturnType<ApplicationsService["findApplicationState"]>
    >,
    targetStage: NonNullable<
      Awaited<ReturnType<ApplicationsService["resolveTargetStage"]>>
    >,
  ) {
    const missing = (targetStage.requiredFields ?? []).filter((field) => {
      if (field.startsWith("dynamic.")) {
        const key = field.slice("dynamic.".length);
        const responses = application.dynamicResponses as Record<
          string,
          unknown
        > | null;
        return responses?.[key] === undefined || responses[key] === "";
      }
      const values: Record<string, unknown> = {
        "candidate.fullName": application.candidate.fullName,
        "candidate.email": application.candidate.email,
        "candidate.phone": application.candidate.phone,
        "candidate.city": application.candidate.city,
        "candidate.resumeUrl":
          (application.candidate.resumeFiles?.length ?? 0) > 0 ||
          Boolean(application.candidate.resumeUrl),
        "application.coverLetter": application.coverLetter,
        "interview.completed": application.interviews.some(
          (item) => item.status === "COMPLETED",
        ),
        scorecard: application.interviews.some(
          (item) => item.scorecards.length > 0,
        ),
      };
      return !values[field];
    });
    if (missing.length) {
      throw new BadRequestException(
        `Missing required fields for ${targetStage.name}: ${missing.join(", ")}`,
      );
    }
  }

  private async resolveTargetStage(
    tenantId: string,
    vacancyId: string,
    currentStageId?: string,
    status?: ApplicationStatus,
  ) {
    if (currentStageId) {
      const stage = await this.prisma.vacancyStage.findFirst({
        where: {
          id: currentStageId,
          tenantId,
          vacancyId,
        },
      });
      if (!stage) {
        throw new BadRequestException(
          "Stage does not belong to the application vacancy",
        );
      }
      return stage;
    }

    if (!status) {
      return null;
    }

    return this.prisma.vacancyStage.findFirst({
      where: {
        tenantId,
        vacancyId,
        applicationStatus: status,
      },
      orderBy: { position: "asc" },
    });
  }

  private async assertBelongsToTenant(
    id: string,
    actor: JwtPayload,
    tenantId: string,
  ) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor),
      },
      select: { id: true },
    });

    if (!application) {
      throw new NotFoundException("Application not found");
    }
  }

  private async assertBelongsToBranch(
    id: string,
    tenantId: string,
    branchId: string,
  ) {
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
      throw new NotFoundException("Application not found");
    }
  }

  private buildUpdateData(
    dto: UpdateApplicationStatusDto,
    status: ApplicationStatus,
  ): Prisma.VacancyApplicationUpdateInput {
    const data: Prisma.VacancyApplicationUpdateInput = {
      status,
      reviewedAt: status === ApplicationStatus.SUBMITTED ? null : new Date(),
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
        data.interviewer = { disconnect: true };
      } else {
        const interview = this.normalizeInterview(dto.interview);
        data.interviewType = interview.type;
        data.interviewScheduledAt = interview.scheduledAt;
        data.interviewFollowUpAt = interview.followUpAt;
        data.interviewObservations = interview.observations;
        data.interviewer = interview.interviewerUserId
          ? { connect: { id: interview.interviewerUserId } }
          : { disconnect: true };
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

  private assertStatusCanBeChangedDirectly(status: ApplicationStatus) {
    if (status === ApplicationStatus.HIRED) {
      throw new BadRequestException(
        "Use the hiring workflow to mark an application as hired and create the employee",
      );
    }
  }

  private async appendTimelineEvents(
    tx: Prisma.TransactionClient,
    tenantId: string,
    applicationId: string,
    actor: JwtPayload,
    tracking: ApplicationTrackingDto | null | undefined,
  ) {
    if (
      !tracking ||
      !Array.isArray(tracking.timelineEvents) ||
      tracking.timelineEvents.length === 0
    ) {
      return;
    }

    const timelineEvents = tracking.timelineEvents.map((event) =>
      this.normalizeTimelineEvent(event),
    );

    await tx.applicationTimelineEvent.createMany({
      data: timelineEvents.map((event) => ({
        tenantId,
        applicationId,
        type: event.type,
        occurredAt: event.at,
        note: event.note,
        ...this.actorSnapshot(actor),
        source: "ATS_MANUAL",
      })),
    });
  }

  private async createTimelineEvent(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      applicationId: string;
      type: PrismaApplicationTimelineEventType;
      actor?: JwtPayload;
      previousValue?: Prisma.InputJsonValue;
      newValue?: Prisma.InputJsonValue;
      reason?: string | null;
      note?: string | null;
      source: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return tx.applicationTimelineEvent.create({
      data: {
        tenantId: input.tenantId,
        applicationId: input.applicationId,
        type: input.type,
        occurredAt: new Date(),
        note: input.note?.trim() || null,
        ...(input.actor ? this.actorSnapshot(input.actor) : {}),
        previousValue: input.previousValue,
        newValue: input.newValue,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        reason: input.reason?.trim() || null,
        source: input.source,
      },
    });
  }

  private actorSnapshot(actor: JwtPayload) {
    const displayName = [actor.firstName, actor.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      actorType: "USER",
      actorId: actor.sub,
      actorDisplayName: displayName || actor.email || actor.sub,
    };
  }

  private applicationStateSnapshot(
    status: ApplicationStatus,
    stage: { id: string; code: string; name: string } | null | undefined,
  ): Prisma.InputJsonObject {
    return {
      status,
      stageId: stage?.id ?? null,
      stageCode: stage?.code ?? null,
      stageName: stage?.name ?? null,
    };
  }

  private buildBranchScopedWhere(
    actor: JwtPayload,
  ): Prisma.VacancyApplicationWhereInput {
    if (actor.role === "INTERVIEWER" || actor.roles.includes("INTERVIEWER")) {
      return {
        interviewerUserId: actor.sub,
        vacancy: {
          branchId: {
            in: actor.allowedBranchIds,
          },
        },
      };
    }

    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) {
      return {};
    }

    return {
      vacancy: {
        branchId: {
          in: actor.allowedBranchIds,
        },
      },
    };
  }

  private resolveBranchFilter(actor: JwtPayload, requestedBranchId?: string) {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) {
      return requestedBranchId;
    }

    if (requestedBranchId) {
      if (!actor.allowedBranchIds.includes(requestedBranchId)) {
        throw new NotFoundException("Branch not found");
      }

      return requestedBranchId;
    }

    return actor.allowedBranchIds.length > 0
      ? {
          in: actor.allowedBranchIds,
        }
      : "__no_branch_access__";
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
      currentStageId: application.currentStageId,
      status: application.status,
      currentStage: application.currentStage,
      stageEnteredAt: application.stageEnteredAt,
      stageDueAt: application.currentStage?.slaHours
        ? new Date(
            application.stageEnteredAt.getTime() +
              application.currentStage.slaHours * 3_600_000,
          )
        : null,
      isStageOverdue: Boolean(
        application.currentStage?.slaHours &&
        Date.now() >
          application.stageEnteredAt.getTime() +
            application.currentStage.slaHours * 3_600_000,
      ),
      rejectionReason: application.rejectionReason,
      pendingTransitions: application.transitionRequests,
      coverLetter: application.coverLetter,
      dynamicResponses: application.dynamicResponses,
      notes: application.notes,
      interview,
      tracking,
      interviews: application.interviews.map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type,
        timezone: item.timezone,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        location: item.location,
        meetingUrl: item.meetingUrl,
        notes: item.notes,
        status: item.status,
        stage: item.stage,
        interviewer: item.interviewer,
      })),
      appliedAt: application.appliedAt,
      reviewedAt: application.reviewedAt,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      candidate: {
        ...application.candidate,
        resumeFiles: undefined,
        resumeUrl: undefined,
        resumeAvailable: (application.candidate.resumeFiles?.length ?? 0) > 0,
        resumeFile: application.candidate.resumeFiles?.[0] ?? null,
      },
      vacancy: application.vacancy,
    };
  }

  private buildTimelineEvents(application: ApplicationWithRelations) {
    const persisted = application.timelineEvents.map((event) => ({
      id: event.id,
      type: event.type as PrismaApplicationTimelineEventType,
      at: event.occurredAt ?? event.createdAt,
      note: event.note,
      actorType: event.actorType,
      actorId: event.actorId,
      actorDisplayName: event.actorDisplayName,
      previousValue: event.previousValue,
      newValue: event.newValue,
      metadata: event.metadata,
      reason: event.reason,
      source: event.source,
      immutable: true,
    }));
    const baseEvents = [
      [
        PrismaApplicationTimelineEventType.VACANCY_PUBLISHED,
        application.vacancy.createdAt,
      ],
      [PrismaApplicationTimelineEventType.APPLIED, application.appliedAt],
      [PrismaApplicationTimelineEventType.CONTACTED, application.contactedAt],
      [
        PrismaApplicationTimelineEventType.INTERVIEW_SCHEDULED,
        application.interviewScheduledAt,
      ],
      [
        PrismaApplicationTimelineEventType.INTERVIEW_COMPLETED,
        application.interviewCompletedAt,
      ],
    ] as const;
    const synthetic = baseEvents
      .filter(
        ([type, at]) => at && !persisted.some((event) => event.type === type),
      )
      .map(([type, at]) => ({
        id: `synthetic-${type}`,
        type,
        at,
        note: null,
        actorType: "SYSTEM",
        actorId: null,
        actorDisplayName: "Sistema",
        previousValue: null,
        newValue: null,
        metadata: null,
        reason: null,
        source: "LEGACY_DERIVED",
        immutable: true,
      }));

    return [...persisted, ...synthetic].sort(
      (left, right) =>
        new Date(left.at ?? 0).getTime() - new Date(right.at ?? 0).getTime(),
    );
  }

  private normalizeDynamicResponses(
    schema: Prisma.JsonValue | null,
    responses: Record<string, unknown> | undefined,
  ) {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      return responses && Object.keys(responses).length > 0
        ? responses
        : undefined;
    }

    const sections = Array.isArray((schema as { sections?: unknown }).sections)
      ? ((
          schema as {
            sections: Array<{ fields?: Array<Record<string, unknown>> }>;
          }
        ).sections ?? [])
      : [];

    const fields = sections.flatMap((section) =>
      Array.isArray(section.fields) ? section.fields : [],
    );

    if (fields.length === 0) {
      return responses && Object.keys(responses).length > 0
        ? responses
        : undefined;
    }

    const source = responses ?? {};
    const normalized: Record<string, unknown> = {};

    for (const field of fields) {
      const key = typeof field.key === "string" ? field.key : "";
      const label = typeof field.label === "string" ? field.label : "campo";
      const type = typeof field.type === "string" ? field.type : "TEXT";
      const required = Boolean(field.required);
      const options = Array.isArray(field.options)
        ? field.options.map((option) => String(option))
        : [];
      const rawValue = source[key];

      const isEmptyArray = Array.isArray(rawValue) && rawValue.length === 0;
      const isEmptyString =
        typeof rawValue === "string" && rawValue.trim().length === 0;

      if (
        required &&
        (rawValue === undefined ||
          rawValue === null ||
          isEmptyArray ||
          isEmptyString)
      ) {
        throw new BadRequestException(
          `Missing required dynamic field: ${label}`,
        );
      }

      if (
        rawValue === undefined ||
        rawValue === null ||
        isEmptyArray ||
        isEmptyString
      ) {
        continue;
      }

      switch (type) {
        case "NUMBER": {
          const numeric = Number(rawValue);
          if (Number.isNaN(numeric)) {
            throw new BadRequestException(
              `Invalid number for dynamic field: ${label}`,
            );
          }
          normalized[key] = numeric;
          break;
        }
        case "BOOLEAN": {
          if (typeof rawValue === "boolean") {
            normalized[key] = rawValue;
          } else if (rawValue === "true" || rawValue === "false") {
            normalized[key] = rawValue === "true";
          } else {
            throw new BadRequestException(
              `Invalid boolean for dynamic field: ${label}`,
            );
          }
          break;
        }
        case "MULTI_SELECT": {
          const values = Array.isArray(rawValue)
            ? rawValue.map((value) => String(value))
            : [String(rawValue)];
          if (
            options.length > 0 &&
            values.some((value) => !options.includes(value))
          ) {
            throw new BadRequestException(
              `Invalid option for dynamic field: ${label}`,
            );
          }
          normalized[key] = values;
          break;
        }
        case "SINGLE_SELECT": {
          const value = String(rawValue);
          if (options.length > 0 && !options.includes(value)) {
            throw new BadRequestException(
              `Invalid option for dynamic field: ${label}`,
            );
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
      scheduledAt: interview.scheduledAt
        ? new Date(interview.scheduledAt)
        : null,
      followUpAt: interview.followUpAt ? new Date(interview.followUpAt) : null,
      observations: interview.observations?.trim() || null,
      interviewerUserId: interview.interviewerUserId ?? null,
    };
  }

  private async assertInterviewerBelongsToTenant(
    interviewerUserId: string | null | undefined,
    tenantId: string,
  ) {
    if (!interviewerUserId) return;

    const interviewer = await this.prisma.user.findFirst({
      where: {
        id: interviewerUserId,
        tenantId,
        userRoles: {
          some: {
            role: {
              code: "INTERVIEWER",
            },
          },
        },
      },
      select: { id: true },
    });

    if (!interviewer) {
      throw new NotFoundException("Interviewer not found");
    }
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
