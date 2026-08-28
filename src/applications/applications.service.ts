import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
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
import { CreateEmployeeReferralDto } from './dto/application-operations.dto';
import { randomBytes } from 'crypto';
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
import { DomainEventsService } from '../domain-events/domain-events.service';
import { createHash } from 'crypto';
import { Response } from 'express';

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
      tenant: { select: { id: true, name: true, slug: true } },
      branch: { select: { id: true, name: true, location: true } },
      responsibles: {
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      },
      stages: {
        orderBy: { position: "asc" },
      },
    },
  },
  currentStage: true,
  assignedRecruiter: { select: { id: true, firstName: true, lastName: true, email: true } },
  structuredRejectionReason: true,
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

const PUBLIC_DRAFT_COOKIE = 'public_application_draft';
const PUBLIC_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PUBLIC_LIMIT_WINDOW_MS = 60 * 1000;
const PUBLIC_LIMIT_MAX = 20;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files?: AtsPrivateFileService,
    private readonly antivirus?: TrainingAntivirusService,
    private readonly communications?: AtsCommunicationsService,
    private readonly domainEvents?: DomainEventsService,
  ) {}

  listReferrals(user: JwtPayload, tenantId: string) { return this.prisma.employeeReferral.findMany({ where: { tenantId, referrerUserId: user.sub }, include: { vacancy: { select: { id: true, title: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }); }

  async conversionMetrics(actor: JwtPayload, tenantId: string) {
    const vacancies = await this.prisma.vacancy.findMany({
      where: { tenantId, ...(actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH ? {} : { branchId: { in: actor.allowedBranchIds } }) },
      select: { id: true, title: true },
    });
    if (!vacancies.length) return { totals: { started: 0, paused: 0, resumed: 0, submitted: 0, completionRate: 0, resumeRate: 0 }, vacancies: [] };
    const rows = await this.prisma.candidateConversionEvent.groupBy({
      by: ["vacancyId", "kind"],
      where: { tenantId, vacancyId: { in: vacancies.map((vacancy) => vacancy.id) } },
      _count: { _all: true },
    });
    const byVacancy = new Map(vacancies.map((vacancy) => [vacancy.id, { vacancyId: vacancy.id, title: vacancy.title, started: 0, paused: 0, resumed: 0, submitted: 0 }]));
    rows.forEach((row) => {
      const metric = byVacancy.get(row.vacancyId);
      if (!metric) return;
      if (row.kind === "DRAFT_STARTED") metric.started = row._count._all;
      if (row.kind === "DRAFT_PAUSED") metric.paused = row._count._all;
      if (row.kind === "DRAFT_RESUMED") metric.resumed = row._count._all;
      if (row.kind === "APPLICATION_SUBMITTED") metric.submitted = row._count._all;
    });
    const items = [...byVacancy.values()].map((item) => ({ ...item, completionRate: this.percentage(item.submitted, item.started), resumeRate: this.percentage(item.resumed, item.paused) })).sort((a, b) => b.started - a.started);
    const totals = items.reduce((total, item) => ({ started: total.started + item.started, paused: total.paused + item.paused, resumed: total.resumed + item.resumed, submitted: total.submitted + item.submitted }), { started: 0, paused: 0, resumed: 0, submitted: 0 });
    return { totals: { ...totals, completionRate: this.percentage(totals.submitted, totals.started), resumeRate: this.percentage(totals.resumed, totals.paused) }, vacancies: items };
  }

  async getPublicDraft(vacancyId: string, token: string | undefined, cookieHeader: string, response: Response, clientIp?: string) {
    const resolvedToken = this.resolvePublicDraftToken(token, cookieHeader, response);
    await this.assertPublicRateLimit(`draft:get:${vacancyId}:${this.resolveClientKey(resolvedToken, clientIp)}`);
    const tokenHash = this.hashDraftToken(resolvedToken);
    const draft = await this.prisma.publicApplicationDraft.findFirst({ where: { vacancyId, tokenHash } });
    if (!draft) return { token: resolvedToken, value: null, expiresAt: null };
    if (draft.expiresAt.getTime() <= Date.now()) {
      await this.prisma.publicApplicationDraft.deleteMany({ where: { id: draft.id } });
      return { token: resolvedToken, value: null, expiresAt: null };
    }
    return { token: resolvedToken, value: draft.payload, expiresAt: draft.expiresAt };
  }

  async savePublicDraft(vacancyId: string, token: string | undefined, cookieHeader: string, value: unknown, response: Response, clientIp?: string) {
    const resolvedToken = this.resolvePublicDraftToken(token, cookieHeader, response);
    await this.assertPublicRateLimit(`draft:put:${vacancyId}:${this.resolveClientKey(resolvedToken, clientIp)}`);
    const tokenHash = this.hashDraftToken(resolvedToken);
    const expiresAt = new Date(Date.now() + PUBLIC_DRAFT_TTL_MS);
    const [existing, vacancy] = await Promise.all([
      this.prisma.publicApplicationDraft.findUnique({ where: { tokenHash } }),
      this.prisma.vacancy.findUnique({ where: { id: vacancyId }, select: { tenantId: true } }),
    ]);
    if (!vacancy) throw new NotFoundException("Vacancy not found");
    await this.prisma.publicApplicationDraft.upsert({
      where: { tokenHash },
      update: { vacancyId, payload: value as Prisma.InputJsonValue, expiresAt },
      create: { vacancyId, tokenHash, payload: value as Prisma.InputJsonValue, expiresAt },
    });
    const previous = existing?.payload as { pausedAt?: string } | undefined;
    const progress = value as { pausedAt?: string; resumedAt?: string; step?: number };
    const kind = !existing ? "DRAFT_STARTED" : previous?.pausedAt && !progress.pausedAt ? "DRAFT_RESUMED" : progress.pausedAt && progress.pausedAt !== previous?.pausedAt ? "DRAFT_PAUSED" : null;
    if (kind) await this.recordConversionEvent(vacancy.tenantId, vacancyId, `${tokenHash}:${kind}:${kind === "DRAFT_STARTED" ? "initial" : progress.pausedAt ?? progress.resumedAt ?? Date.now()}`, kind, { step: progress.step ?? 0 });
    return { token: resolvedToken, expiresAt };
  }

  async deletePublicDraft(vacancyId: string, token: string | undefined, cookieHeader: string, response: Response, clientIp?: string) {
    const resolvedToken = this.resolvePublicDraftToken(token, cookieHeader, response);
    await this.assertPublicRateLimit(`draft:delete:${vacancyId}:${this.resolveClientKey(resolvedToken, clientIp)}`);
    const tokenHash = this.hashDraftToken(resolvedToken);
    await this.prisma.publicApplicationDraft.deleteMany({ where: { vacancyId, tokenHash } });
    return { ok: true };
  }

  async getCandidateDraft(vacancyId: string, candidateAccountId: string) {
    const draft = await this.prisma.publicApplicationDraft.findFirst({ where: { vacancyId, candidateAccountId } });
    if (!draft || draft.expiresAt.getTime() <= Date.now()) return { value: null, expiresAt: null };
    return { value: draft.payload, expiresAt: draft.expiresAt };
  }

  async saveCandidateDraft(vacancyId: string, candidateAccountId: string, value: unknown) {
    const vacancy = await this.prisma.vacancy.findUnique({ where: { id: vacancyId }, select: { id: true } });
    if (!vacancy) throw new NotFoundException('Vacancy not found');
    const expiresAt = new Date(Date.now() + PUBLIC_DRAFT_TTL_MS);
    await this.prisma.publicApplicationDraft.upsert({
      where: { candidateAccountId_vacancyId: { candidateAccountId, vacancyId } },
      create: { vacancyId, candidateAccountId, tokenHash: this.hashDraftToken(`account:${candidateAccountId}:${vacancyId}`), payload: value as Prisma.InputJsonValue, expiresAt },
      update: { payload: value as Prisma.InputJsonValue, expiresAt },
    });
    return { expiresAt };
  }

  async createReferral(user: JwtPayload, tenantId: string, dto: CreateEmployeeReferralDto) {
    const vacancy = await this.prisma.vacancy.findFirst({ where: { id: dto.vacancyId, tenantId, status: 'OPEN', ...(user.scope === AccessScope.BRANCH && !user.isSuperAdmin ? { branchId: { in: user.allowedBranchIds } } : {}) }, select: { id: true } });
    if (!vacancy) throw new NotFoundException('Vacante no disponible para referidos.');
    return this.prisma.employeeReferral.create({ data: { tenantId, vacancyId: vacancy.id, referrerUserId: user.sub, referralCode: `REF-${randomBytes(5).toString('hex').toUpperCase()}`, candidateEmail: dto.candidateEmail?.trim().toLowerCase(), candidateName: dto.candidateName?.trim() }, include: { vacancy: { select: { id: true, title: true } } } });
  }

  async createPublic(
    vacancyId: string,
    candidateAccountId: string,
    authenticatedEmail: string,
    dto: CreatePublicApplicationDto,
    resume?: Express.Multer.File,
    consentContext?: { ip?: string; userAgent?: string; portalId?: string },
  ) {
    if (dto.website) throw new BadRequestException('No fue posible validar la postulación');
    const startedAt = dto.formStartedAt ? new Date(dto.formStartedAt).getTime() : 0;
    if (startedAt && (!Number.isFinite(startedAt) || Date.now() - startedAt < 2500)) {
      throw new BadRequestException('Completa la postulación con calma e inténtalo nuevamente');
    }
    await this.assertPublicRateLimit(`apply:${vacancyId}:${this.hashDraftToken(consentContext?.ip ?? "unknown")}`);
    if (
      dto.email.trim().toLowerCase() !== authenticatedEmail.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        "Application email must match the candidate identity",
      );
    }
    const applicantIdentity = this.prisma.applicantIdentity?.findFirst
      ? await this.prisma.applicantIdentity.findFirst({
          where: { legacyAccountId: candidateAccountId },
          select: { id: true, profile: { select: { reusableData: true } } },
        })
      : null;
    const reusableData = applicantIdentity?.profile?.reusableData;
    const reusableValues = reusableData && typeof reusableData === 'object' && !Array.isArray(reusableData)
      ? reusableData as Record<string, unknown>
      : {};
    const submittedDynamicResponses = { ...(dto.dynamicResponses ?? {}) };
    delete submittedDynamicResponses.socialSecurityNumber;
    const vacancy = await this.prisma.vacancy.findFirst({
      where: {
        id: vacancyId,
        status: "OPEN",
        publications: {
          some: {
            status: "PUBLISHED",
            publishedAt: { lte: new Date() },
            OR: [
              ...(consentContext?.portalId
                ? [{ portalId: consentContext.portalId }]
                : [{ channel: "PUBLIC_MARKETPLACE" as const, portalId: null }]),
              ...(consentContext?.portalId ? [] : [{ channel: "BRANDED_CAREER_SITE" as const, portalId: null }]),
            ],
            AND: [{ OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] }],
          },
        },
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
      { ...reusableValues, ...submittedDynamicResponses },
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
      const quarantined = await this.files.store(
        "resume",
        vacancy.tenantId,
        candidateAccountId,
        resume,
        mimeType,
      );
      try {
        const scan = await this.scanResume(resume.buffer);
        const promoted = await this.files.promote(quarantined.storageKey);
        storedResume = {
          ...quarantined,
          ...promoted,
          mimeType,
          scanStatus: scan.status,
          scanEngine: scan.engine ?? "static-structure-v1",
        };
      } catch (error) {
        await this.files.delete(quarantined.storageKey);
        throw error;
      }
      resumeConsentVersion = consentVersion;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (tx.applicantIdentity?.upsert && tx.applicantProfile?.upsert) {
          const identity = await tx.applicantIdentity.upsert({
            where: { email: authenticatedEmail.trim().toLowerCase() },
            update: { legacyAccountId: candidateAccountId },
            create: { email: authenticatedEmail.trim().toLowerCase(), legacyAccountId: candidateAccountId, profile: { create: {} } },
            select: { id: true },
          });
          const reusableKeys = new Set([
            'lastName', 'address', 'apartmentNumber', 'state', 'zipCode', 'dateOfBirth',
            'emergencyContactName', 'emergencyContactRelationship', 'emergencyContactPhone',
            'is18OrOlder', 'authorizedToWorkInUS', 'workedForCompany', 'workedForCompanyExplanation',
            'familyWorksForCompany', 'familyWorksForCompanyExplanation', 'felonyConviction',
            'felonyConvictionExplanation', 'educationLevel', 'schoolName', 'schoolLocation',
            'previousEmployerCompany', 'previousEmployerPosition', 'previousEmployerAddress',
            'previousEmployerLocation', 'previousEmployerStartDate', 'previousEmployerEndDate',
            'previousEmployerEndingSalary', 'previousEmployerSupervisor', 'previousEmployerPhone',
            'previousEmployerLeavingReason', 'previousEmployerMayContactSupervisor',
            'employmentPreference', 'shiftPreference', 'employmentType', 'desiredHourlyWage',
            'reference1Name', 'reference1Relationship', 'reference1Phone', 'reference2Name',
            'reference2Relationship', 'reference2Phone', 'reference3Name', 'reference3Relationship',
            'reference3Phone',
          ]);
          const nextReusable = Object.fromEntries(Object.entries({ ...reusableValues, ...(normalizedDynamicResponses as Record<string, unknown>) }).filter(([key]) => reusableKeys.has(key)));
          await tx.applicantProfile.upsert({
            where: { identityId: identity.id },
            update: { reusableData: Object.keys(nextReusable).length ? nextReusable as Prisma.InputJsonValue : undefined, version: { increment: 1 } },
            create: { identityId: identity.id, reusableData: Object.keys(nextReusable).length ? nextReusable as Prisma.InputJsonValue : undefined },
          });
        }
        const matchedCandidate = await tx.candidate.upsert({
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
            source: dto.source?.trim() || undefined,
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
            source: dto.source?.trim() || undefined,
          },
        });
        const candidate = matchedCandidate.mergedIntoId
          ? await tx.candidate.update({
              where: { id: matchedCandidate.mergedIntoId },
              data: {
                fullName: dto.fullName,
                phone: dto.phone,
                city: dto.city,
                linkedinUrl: dto.linkedinUrl,
                portfolioUrl: dto.portfolioUrl,
              },
            })
          : matchedCandidate;

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
              dynamicResponses: { ...(normalizedDynamicResponses as Record<string, unknown>), attribution: { source: dto.source?.trim() || 'CAREERS_PAGE', referralCode: dto.referralCode?.trim() || null, utmSource: dto.utmSource?.trim() || null, utmMedium: dto.utmMedium?.trim() || null, utmCampaign: dto.utmCampaign?.trim() || null } },
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

        if (dto.referralCode?.trim()) {
          await tx.employeeReferral.updateMany({ where: { tenantId: vacancy.tenantId, vacancyId, referralCode: dto.referralCode.trim(), applicationId: null }, data: { applicationId: created.id, candidateEmail: candidate.email, candidateName: candidate.fullName, acceptedAt: new Date() } });
        }

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

        await tx.candidateConversionEvent.upsert({
          where: { eventKey: `application:${created.id}:submitted` },
          update: {},
          create: { eventKey: `application:${created.id}:submitted`, tenantId: vacancy.tenantId, vacancyId, kind: "APPLICATION_SUBMITTED" },
        });
        return this.serializeApplication(created);
      });
    } catch (error) {
      if (storedResume && this.files)
        await this.files.delete(storedResume.storageKey);
      throw error;
    }
  }

  private resolvePublicDraftToken(token: string | undefined, cookieHeader: string, response: Response) {
    const cookieToken = this.readCookie(cookieHeader, PUBLIC_DRAFT_COOKIE);
    const resolved = (token ?? cookieToken ?? randomBytes(24).toString('hex')).trim();
    const encoded = encodeURIComponent(resolved);
    response.setHeader('Set-Cookie', `${PUBLIC_DRAFT_COOKIE}=${encoded}; Max-Age=${PUBLIC_DRAFT_TTL_MS / 1000}; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return resolved;
  }

  private resolveClientKey(token: string, clientIp?: string) {
    return this.hashDraftToken(`${token}:${clientIp ?? "unknown"}`);
  }

  private async assertPublicRateLimit(key: string): Promise<void> {
    const now = new Date();
    const activeSince = new Date(now.getTime() - PUBLIC_LIMIT_WINDOW_MS);
    const keyHash = this.hashDraftToken(key);
    await this.prisma.publicRequestRateLimit.deleteMany({ where: { expiresAt: { lte: now } } });
    const incremented = await this.prisma.publicRequestRateLimit.updateMany({
      where: { keyHash, windowStartedAt: { gte: activeSince }, hits: { lt: PUBLIC_LIMIT_MAX } },
      data: { hits: { increment: 1 } },
    });
    if (incremented.count) return;
    const existing = await this.prisma.publicRequestRateLimit.findUnique({ where: { keyHash } });
    if (!existing) {
      try {
        await this.prisma.publicRequestRateLimit.create({ data: { keyHash, hits: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + PUBLIC_LIMIT_WINDOW_MS * 2) } });
        return;
      } catch {
        return this.assertPublicRateLimit(key);
      }
    }
    if (existing.windowStartedAt < activeSince) {
      await this.prisma.publicRequestRateLimit.update({ where: { keyHash }, data: { hits: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + PUBLIC_LIMIT_WINDOW_MS * 2) } });
      return;
    }
    throw new HttpException('Has realizado demasiados intentos. Espera un momento y vuelve a intentarlo.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async recordConversionEvent(tenantId: string, vacancyId: string, eventKey: string, kind: string, metadata?: Record<string, unknown>) {
    await this.prisma.candidateConversionEvent.upsert({
      where: { eventKey },
      update: {},
      create: { eventKey, tenantId, vacancyId, kind, metadata: metadata as Prisma.InputJsonValue | undefined },
    });
  }

  private percentage(value: number, total: number) {
    return total ? Math.round((value / total) * 1000) / 10 : 0;
  }

  private hashDraftToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private readCookie(cookieHeader: string, name: string) {
    return cookieHeader.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
  }

  async listForCandidate(candidateAccountId: string) {
    const applications = await this.prisma.vacancyApplication.findMany({
      where: {
        candidate: {
          OR: [
            { accountId: candidateAccountId },
            { mergedCandidates: { some: { accountId: candidateAccountId } } },
          ],
        },
      },
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
    const where = this.buildListWhere(actor, tenantId, query);

    if (query.overdueOnly) {
      const all = await this.prisma.vacancyApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: { stageEnteredAt: "asc" },
      });
      const overdue = all.map((item) => this.serializeApplication(item)).filter((item) => item.isStageOverdue);
      const start = pagination.skip;
      return {
        data: overdue.slice(start, start + pagination.pageSize),
        meta: { total: overdue.length, page: pagination.page, pageSize: pagination.pageSize, totalPages: Math.ceil(overdue.length / pagination.pageSize) },
      };
    }

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
    const where = this.buildListWhere(actor, tenantId, query);
    const data: ReturnType<ApplicationsService["serializeApplication"]>[] = [];
    let cursor: string | undefined;
    do {
      const batch = await this.prisma.vacancyApplication.findMany({
        where,
        include: applicationInclude,
        orderBy: [{ appliedAt: "desc" }, { id: "asc" }],
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      data.push(...batch.map((item) => this.serializeApplication(item)).filter((item) => !query.overdueOnly || item.isStageOverdue));
      cursor = batch.length === 1000 ? batch.at(-1)?.id : undefined;
    } while (cursor);
    return {
      generatedAt: new Date().toISOString(),
      tenantId,
      count: data.length,
      data,
    };
  }

  async decisionEvidence(id: string, actor: JwtPayload, tenantId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({
      where: { id, tenantId, ...this.buildBranchScopedWhere(actor) },
      include: {
        candidate: { select: { id: true, fullName: true, email: true, phone: true, city: true } },
        vacancy: { select: { id: true, title: true, branch: { select: { id: true, name: true } } } },
        currentStage: { select: { id: true, code: true, name: true } },
        timelineEvents: { orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }] },
        interviews: {
          orderBy: { startsAt: 'asc' },
          include: {
            stage: { select: { id: true, code: true, name: true } },
            scorecards: {
              include: { reviewer: { select: { id: true, firstName: true, lastName: true, email: true } }, signedBy: { select: { id: true, firstName: true, lastName: true, email: true } }, template: { select: { id: true, name: true, version: true } }, responses: { include: { criterion: { select: { key: true, label: true, competencyName: true } } } } },
            },
          },
        },
        decisionCommittee: { include: { members: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } } },
      },
    });
    if (!application) throw new NotFoundException('Application not found');
    return {
      format: 'ATS_DECISION_EVIDENCE_V1',
      generatedAt: new Date().toISOString(),
      generatedBy: { id: actor.sub, email: actor.email },
      application,
      disclaimer: 'Expediente operativo para revisión interna, auditoría y asesoría legal. Verifique requisitos locales de retención, privacidad y admisibilidad probatoria.',
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
      select: {
        id: true,
        assignedRecruiterId: true,
        notes: true,
        stageEnteredAt: true,
        currentStage: { select: { slaHours: true } },
      },
    });
    if (authorized.length !== ids.length) {
      throw new NotFoundException("One or more applications were not found");
    }

    if (!dto.status && !dto.currentStageId && !dto.assignedRecruiterId && dto.notes === undefined) {
      throw new BadRequestException("A stage, status, recruiter assignment or note is required");
    }
    const now = Date.now();
    const applicable = authorized.filter((application) => {
      if (dto.onlyUnassigned && application.assignedRecruiterId) return false;
      if (dto.onlyOverdue) {
        const slaHours = application.currentStage?.slaHours;
        if (!slaHours || application.stageEnteredAt.getTime() + slaHours * 60 * 60 * 1000 > now) return false;
      }
      return true;
    });
    if (dto.assignedRecruiterId) {
      await this.assertRecruiterCanAccessApplications(dto.assignedRecruiterId, tenantId, ids);
      await this.prisma.$transaction(async (tx) => {
        for (const application of applicable) {
          if (application.assignedRecruiterId === dto.assignedRecruiterId) continue;
          await tx.vacancyApplication.update({ where: { id: application.id }, data: { assignedRecruiterId: dto.assignedRecruiterId } });
          await this.createTimelineEvent(tx, {
            tenantId,
            applicationId: application.id,
            type: PrismaApplicationTimelineEventType.RECRUITER_ASSIGNED,
            actor,
            previousValue: { assignedRecruiterId: application.assignedRecruiterId },
            newValue: { assignedRecruiterId: dto.assignedRecruiterId },
            note: 'Responsable de reclutamiento actualizado mediante acción masiva',
            source: 'ATS_BULK',
          });
        }
      });
    }
    if (dto.status || dto.currentStageId) {
      for (const application of applicable) {
        await this.updateStatus(application.id, actor, tenantId, {
          status: dto.status,
          currentStageId: dto.currentStageId,
          reason: dto.reason,
          rejectionReasonId: dto.rejectionReasonId,
        });
      }
    }
    if (dto.notes !== undefined) {
      await this.prisma.$transaction(async (tx) => {
        for (const application of applicable) {
          if (application.notes === dto.notes) continue;
          await tx.vacancyApplication.update({
            where: { id: application.id },
            data: { notes: dto.notes },
          });
          await this.createTimelineEvent(tx, {
            tenantId,
            applicationId: application.id,
            type: PrismaApplicationTimelineEventType.APPLICATION_UPDATED,
            actor,
            previousValue: { notes: application.notes },
            newValue: { notes: dto.notes },
            note: 'Nota interna actualizada mediante acción masiva',
            source: 'ATS_BULK',
          });
        }
      });
    }
    return { updated: applicable.length, skipped: authorized.length - applicable.length };
  }

  listSavedViews(actor: JwtPayload, tenantId: string) {
    return this.prisma.applicationSavedView.findMany({ where: { tenantId, userId: actor.sub }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] });
  }

  async createSavedView(actor: JwtPayload, tenantId: string, dto: { name: string; filters: Record<string, unknown>; isDefault?: boolean }) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.applicationSavedView.updateMany({ where: { tenantId, userId: actor.sub }, data: { isDefault: false } });
      return tx.applicationSavedView.create({ data: { tenantId, userId: actor.sub, name: dto.name.trim(), filters: dto.filters as Prisma.InputJsonValue, isDefault: dto.isDefault ?? false } });
    });
  }

  async updateSavedView(id: string, actor: JwtPayload, tenantId: string, dto: { name: string; filters: Record<string, unknown>; isDefault?: boolean }) {
    const view = await this.prisma.applicationSavedView.findFirst({ where: { id, tenantId, userId: actor.sub } });
    if (!view) throw new NotFoundException("Saved view not found");
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.applicationSavedView.updateMany({ where: { tenantId, userId: actor.sub, id: { not: id } }, data: { isDefault: false } });
      return tx.applicationSavedView.update({ where: { id }, data: { name: dto.name.trim(), filters: dto.filters as Prisma.InputJsonValue, isDefault: dto.isDefault ?? false } });
    });
  }

  async deleteSavedView(id: string, actor: JwtPayload, tenantId: string) {
    const result = await this.prisma.applicationSavedView.deleteMany({ where: { id, tenantId, userId: actor.sub } });
    if (!result.count) throw new NotFoundException("Saved view not found");
    return { deleted: true };
  }

  async listRejectionReasons(tenantId: string) {
    const count = await this.prisma.recruitmentRejectionReason.count({ where: { tenantId } });
    if (!count) {
      await this.prisma.recruitmentRejectionReason.createMany({ data: [
        { tenantId, code: "QUALIFICATIONS_MISMATCH", label: "No cumple requisitos mínimos", category: "QUALIFICATIONS", position: 10 },
        { tenantId, code: "INSUFFICIENT_EXPERIENCE", label: "Experiencia insuficiente", category: "EXPERIENCE", position: 20 },
        { tenantId, code: "COMPENSATION_MISMATCH", label: "Expectativa salarial fuera de rango", category: "COMPENSATION", position: 30 },
        { tenantId, code: "AVAILABILITY_MISMATCH", label: "Disponibilidad incompatible", category: "AVAILABILITY", position: 40 },
        { tenantId, code: "LOCATION_MISMATCH", label: "Ubicación o modalidad incompatible", category: "LOCATION", position: 50 },
        { tenantId, code: "CANDIDATE_WITHDREW", label: "Candidato desistió del proceso", category: "CANDIDATE_DECISION", position: 60 },
        { tenantId, code: "POSITION_CLOSED", label: "Vacante cerrada o cancelada", category: "POSITION_CLOSED", position: 70 },
        { tenantId, code: "DUPLICATE_APPLICATION", label: "Postulación duplicada", category: "DUPLICATE", position: 80 },
        { tenantId, code: "OTHER", label: "Otro motivo", category: "OTHER", position: 90 },
      ], skipDuplicates: true });
    }
    return this.prisma.recruitmentRejectionReason.findMany({ where: { tenantId, active: true }, orderBy: [{ position: "asc" }, { label: "asc" }] });
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
    const quarantined = await this.files.store(
      "resume",
      tenantId,
      application.candidate.id,
      file,
      mimeType,
    );
    let stored: { storageKey: string; sha256: string };
    let scan: Awaited<ReturnType<TrainingAntivirusService["scan"]>>;
    try {
      scan = await this.scanResume(file.buffer);
      stored = { ...quarantined, ...await this.files.promote(quarantined.storageKey) };
    } catch (error) {
      await this.files.delete(quarantined.storageKey);
      throw error;
    }
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
            scanEngine: scan.engine ?? "static-structure-v1",
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
    const scopedWhere = {
      tenantId,
      ...this.buildBranchScopedWhere(actor),
    };
    let application = await this.prisma.vacancyApplication.findFirst({
      where: {
        ...scopedWhere,
        id,
      },
      include: applicationInclude,
    });

    // Candidate-facing links can carry a candidate ID while ATS links carry an
    // application ID. Resolve the latest in-scope application in either case.
    if (!application) {
      application = await this.prisma.vacancyApplication.findFirst({
        where: { ...scopedWhere, candidateId: id },
        include: applicationInclude,
        orderBy: { appliedAt: "desc" },
      });
    }

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
    this.assertExpectedVersion(application.updatedAt, dto.expectedUpdatedAt);
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
    if (targetStatus === ApplicationStatus.REJECTED) {
      await this.assertRejectionReason(tenantId, dto.rejectionReasonId, dto.reason);
    }
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
                rejectionReasonId: dto.rejectionReasonId,
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

    let automationEventId: string | null = null;
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
                slaWarningSentAt: null,
                slaEscalatedAt: null,
                slaReassignedAt: null,
                rejectionReason:
                  targetStatus === ApplicationStatus.REJECTED
                    ? dto.reason?.trim()
                    : null,
                structuredRejectionReason:
                  targetStatus === ApplicationStatus.REJECTED && dto.rejectionReasonId
                    ? { connect: { id: dto.rejectionReasonId } }
                    : { disconnect: true },
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
        automationEventId = timelineEvent.id;
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

    if (automationEventId) {
      const event = {
        applicationId: id,
        candidateId: application.candidate.id,
        vacancyId: application.vacancyId,
        branchId: actor.activeBranchId ?? undefined,
        stageCode: targetStage?.code,
        status: targetStatus,
        payload: {
          previousStageCode: application.currentStage?.code ?? null,
          stageCode: targetStage?.code ?? null,
          status: targetStatus,
          reason: dto.reason ?? null,
          rejectionReasonId: dto.rejectionReasonId ?? null,
          vacancyId: application.vacancyId,
        },
      };
      const context = { idempotencyKey: `ats:application-stage:${automationEventId}` };
      if (targetStatus === ApplicationStatus.REJECTED) {
        await this.domainEvents?.applicationRejected(actor, event, context);
      } else {
        await this.domainEvents?.applicationStageChanged(actor, event, context);
      }
    }

    return this.findOneForTenant(id, actor, tenantId);
  }

  async undoLatestTransition(
    id: string,
    actor: JwtPayload,
    tenantId: string,
    expectedUpdatedAt: string,
  ) {
    const application = await this.findApplicationState(id, actor, tenantId);
    this.assertExpectedVersion(application.updatedAt, expectedUpdatedAt);
    const latestOverall = await this.prisma.applicationTimelineEvent.findFirst({
      where: { tenantId, applicationId: id, type: PrismaApplicationTimelineEventType.STAGE_CHANGED },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    const latest = await this.prisma.applicationTimelineEvent.findFirst({
      where: {
        tenantId,
        applicationId: id,
        type: PrismaApplicationTimelineEventType.STAGE_CHANGED,
        actorId: actor.sub,
        source: 'ATS_TRANSITION',
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
    const previous = latest?.previousValue as { status?: ApplicationStatus; stageId?: string | null } | null;
    if (!latest || latestOverall?.id !== latest.id || !previous?.status || !previous.stageId) {
      throw new BadRequestException('No hay una transición propia que se pueda deshacer');
    }
    const previousStatus = previous.status;
    const previousStage = application.vacancy.stages.find((stage) => stage.id === previous.stageId);
    if (!previousStage) throw new BadRequestException('La etapa anterior ya no está disponible');

    await this.prisma.$transaction(async (tx) => {
      await tx.vacancyApplication.update({
        where: { id },
        data: {
          status: previousStatus,
          currentStageId: previousStage.id,
          stageEnteredAt: new Date(),
          slaWarningSentAt: null,
          slaEscalatedAt: null,
          slaReassignedAt: null,
          rejectionReason: null,
          rejectionReasonId: null,
        },
      });
      await this.createTimelineEvent(tx, {
        tenantId,
        applicationId: id,
        type: PrismaApplicationTimelineEventType.STAGE_CHANGED,
        actor,
        previousValue: this.applicationStateSnapshot(application.status, application.currentStage),
        newValue: this.applicationStateSnapshot(previousStatus, previousStage),
        note: `Cambio deshecho: ${previousStage.name}`,
        source: 'ATS_UNDO',
        metadata: { undoneTimelineEventId: latest.id },
      });
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
        updatedAt: true,
        status: true,
        currentStageId: true,
        currentStage: true,
        vacancy: { select: { stages: { orderBy: { position: 'asc' } } } },
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
    allowRequesterApproval = false,
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
    if (approved && request.requestedByUserId === actor.sub && !allowRequesterApproval) {
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
            slaWarningSentAt: null,
            slaEscalatedAt: null,
            slaReassignedAt: null,
            rejectionReason:
              request.toStage.applicationStatus === "REJECTED"
                ? request.reason
                : null,
            structuredRejectionReason:
              request.toStage.applicationStatus === "REJECTED" && request.rejectionReasonId
                ? { connect: { id: request.rejectionReasonId } }
                : { disconnect: true },
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

  async approvePendingTransitionFromHiringManager(
    id: string,
    actor: JwtPayload,
    tenantId: string,
  ) {
    const request = await this.prisma.applicationStageTransitionRequest.findFirst({
      where: { applicationId: id, tenantId, status: "PENDING" },
      orderBy: { requestedAt: "desc" },
      select: { id: true },
    });
    if (!request) return null;

    return this.decideTransition(id, request.id, actor, tenantId, true, "Aprobación automática del hiring manager", true);
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
          `La transición de ${current.name} a ${targetStage.name} no está permitida. Selecciona la siguiente etapa autorizada.`,
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
        `Faltan campos obligatorios para ${targetStage.name}: ${missing.map((field) => this.requiredFieldLabel(field)).join(", ")}`,
      );
    }
  }

  private requiredFieldLabel(field: string) {
    const labels: Record<string, string> = {
      "candidate.fullName": "nombre completo del candidato",
      "candidate.email": "correo del candidato",
      "candidate.phone": "teléfono del candidato",
      "candidate.city": "ciudad del candidato",
      "candidate.resumeUrl": "currículum del candidato",
      "application.coverLetter": "carta de presentación",
      "interview.completed": "entrevista completada",
      scorecard: "evaluación de entrevista",
    };
    return labels[field] ?? (field.startsWith("dynamic.") ? `respuesta ${field.slice("dynamic.".length)}` : field);
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

  private buildListWhere(actor: JwtPayload, tenantId: string, query: ListApplicationsDto): Prisma.VacancyApplicationWhereInput {
    const effectiveBranchFilter = this.resolveBranchFilter(actor, query.branchId);
    return {
      tenantId,
      ...(actor.role === "INTERVIEWER" || actor.roles.includes("INTERVIEWER") ? { interviewerUserId: actor.sub } : {}),
      ...(effectiveBranchFilter ? { vacancy: { branchId: effectiveBranchFilter } } : {}),
      ...(query.vacancyId ? { vacancyId: query.vacancyId } : {}),
      ...(query.currentStageId ? { currentStageId: query.currentStageId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedRecruiterId ? { assignedRecruiterId: query.assignedRecruiterId } : {}),
      ...(query.rejectionReasonId ? { rejectionReasonId: query.rejectionReasonId } : {}),
      ...(query.appliedFrom || query.appliedTo ? { appliedAt: { ...(query.appliedFrom ? { gte: new Date(query.appliedFrom) } : {}), ...(query.appliedTo ? { lte: new Date(query.appliedTo) } : {}) } } : {}),
      ...(query.search ? { OR: [
        { candidate: { fullName: { contains: query.search, mode: "insensitive" } } },
        { candidate: { email: { contains: query.search, mode: "insensitive" } } },
        { vacancy: { title: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
  }

  private async assertRejectionReason(tenantId: string, rejectionReasonId?: string, detail?: string) {
    if (!rejectionReasonId) throw new BadRequestException("A rejection reason is required and must use the structured catalog");
    const reason = await this.prisma.recruitmentRejectionReason.findFirst({ where: { id: rejectionReasonId, tenantId, active: true } });
    if (!reason) throw new BadRequestException("Invalid rejection reason");
    if (reason.category === "OTHER" && !detail?.trim()) throw new BadRequestException("A rejection detail is required for OTHER");
  }

  private async assertRecruiterCanAccessApplications(userId: string, tenantId: string, applicationIds: string[]) {
    const [user, applications] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: userId, tenantId, status: "ACTIVE" }, include: { branchAccesses: true } }),
      this.prisma.vacancyApplication.findMany({ where: { id: { in: applicationIds }, tenantId }, select: { vacancy: { select: { branchId: true } } } }),
    ]);
    if (!user) throw new BadRequestException("Recruiter not found");
    const allowed = new Set([user.activeBranchId, ...user.branchAccesses.map((item) => item.branchId)].filter(Boolean));
    if (allowed.size && applications.some((item) => !allowed.has(item.vacancy.branchId))) {
      throw new BadRequestException("Recruiter cannot access every selected branch");
    }
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

  private assertExpectedVersion(current: Date, expected?: string) {
    if (!expected) return;
    const parsed = new Date(expected);
    if (Number.isNaN(parsed.getTime()) || current.getTime() !== parsed.getTime()) {
      throw new ConflictException(
        'La postulación fue modificada por otra persona. Actualiza la vista antes de continuar.',
      );
    }
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
      structuredRejectionReason: application.structuredRejectionReason,
      assignedRecruiter: application.assignedRecruiter,
      sla: {
        warningSentAt: application.slaWarningSentAt,
        escalatedAt: application.slaEscalatedAt,
        reassignedAt: application.slaReassignedAt,
      },
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
    const source = responses ?? {};
    const fixedKeys = new Set([
      "lastName", "address", "apartmentNumber", "state", "zipCode", "dateOfBirth",
      "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone",
      "educationLevel", "educationInstitution", "educationStatus", "educationStartDate",
      "educationEndDate", "educationDescription", "schoolName", "schoolLocation",
      "is18OrOlder", "authorizedToWorkInUS", "workedForCompany", "familyWorksForCompany",
      "felonyConviction", "workedForCompanyExplanation", "familyWorksForCompanyExplanation",
      "felonyConvictionExplanation", "employmentPreference", "shiftPreference", "employmentType",
      "desiredHourlyWage", "availability", "workAuthorization", "relocation", "preferredWorkMode",
      "previousEmployerCompany", "previousEmployerPosition", "previousEmployerAddress",
      "previousEmployerLocation", "previousEmployerStartDate", "previousEmployerEndDate",
      "previousEmployerEndingSalary", "previousEmployerSupervisor", "previousEmployerPhone",
      "previousEmployerLeavingReason", "previousEmployerMayContactSupervisor",
      "reference1Name", "reference1Relationship", "reference1Phone", "reference2Name",
      "reference2Relationship", "reference2Phone", "reference3Name", "reference3Relationship",
      "reference3Phone",
    ]);
    for (const [key, value] of Object.entries(source)) {
      if (fixedKeys.has(key)) this.validateFixedDynamicResponse(key, value);
    }

    if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
      const unknown = Object.keys(source).filter((key) => !fixedKeys.has(key));
      if (unknown.length) throw new BadRequestException(`Unknown dynamic fields: ${unknown.join(", ")}`);
      return Object.keys(source).length > 0 ? source : undefined;
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

    const allowedKeys = new Set([
      ...fixedKeys,
      ...fields.map((field) => typeof field.key === "string" ? field.key : "").filter(Boolean),
    ]);
    const unknown = Object.keys(source).filter((key) => !allowedKeys.has(key));
    if (unknown.length) throw new BadRequestException(`Unknown dynamic fields: ${unknown.join(", ")}`);
    if (fields.length === 0) return Object.keys(source).length > 0 ? source : undefined;

    const normalized: Record<string, unknown> = {};
    for (const key of fixedKeys) {
      if (source[key] !== undefined && source[key] !== null && source[key] !== "") normalized[key] = source[key];
    }

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
          if (!Number.isFinite(numeric)) {
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

  private validateFixedDynamicResponse(key: string, value: unknown) {
    if (value === null || value === undefined) return;
    if ([
      "relocation", "workAuthorization", "is18OrOlder", "authorizedToWorkInUS",
      "workedForCompany", "familyWorksForCompany", "felonyConviction",
    ].includes(key) && typeof value !== "boolean") {
      throw new BadRequestException(`Invalid boolean for dynamic field: ${key}`);
    }
    if (key === "educationLevel" && !["PRIMARIA", "SECUNDARIA", "GED", "UNIVERSIDAD", "OTRO"].includes(String(value))) {
      throw new BadRequestException(`Invalid education level for dynamic field: ${key}`);
    }
    if (key === "desiredHourlyWage") {
      const amount = Number(value);
      if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) {
        throw new BadRequestException(`Invalid number for dynamic field: ${key}`);
      }
    }
    if (["educationStartDate", "educationEndDate"].includes(key)) {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        throw new BadRequestException(`Invalid date for dynamic field: ${key}`);
      }
    }
    if (typeof value === "string" && (value.length > 2000 || /<\s*script|<[^>]+>/i.test(value))) {
      throw new BadRequestException(`Invalid text for dynamic field: ${key}`);
    }
  }

  private async scanResume(buffer: Buffer) {
    try {
      return await this.antivirus!.scan(buffer);
    } catch (error) {
      // Temporary CV-only fallback until the Railway ClamAV service is provisioned.
      // Other document types remain protected by their normal scan requirements.
      if (this.antivirus?.mode === 'disabled' && error instanceof HttpException && error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE) {
        return { status: 'SKIPPED' as const, engine: null };
      }
      throw error;
    }
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
