import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateVacancyDto } from './dto/create-vacancy.dto';
import { CreateVacancyFormTemplateDto } from './dto/create-vacancy-form-template.dto';
import { ListVacanciesDto } from './dto/list-vacancies.dto';
import { ListPublicVacanciesDto } from './dto/list-public-vacancies.dto';
import { UpdateVacancyDto } from './dto/update-vacancy.dto';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AccessScope } from '../common/enums/access-scope.enum';
import { PlanLimitsService } from '../plan-limits/plan-limits.service';
import { AtsPrivateFileService } from '../common/files/ats-private-file.service';
import { TrainingAntivirusService } from '../training/training-antivirus.service';

@Injectable()
export class VacanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits?: PlanLimitsService,
    private readonly files?: AtsPrivateFileService,
    private readonly antivirus?: TrainingAntivirusService,
  ) {}

  async create(tenantId: string, actor: JwtPayload, dto: CreateVacancyDto) {
    if (dto.imageUrl) {
      throw new BadRequestException('Use the private multipart image endpoint instead of imageUrl');
    }
    await this.planLimits?.assertCapacity(tenantId, 'maxActiveVacancies');
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    this.assertActorCanAccessBranch(actor, dto.branchId);
    const locationBranchIds = [...new Set([dto.branchId, ...(dto.locationBranchIds ?? [])])];
    for (const branchId of locationBranchIds) {
      await this.assertBranchBelongsToTenant(branchId, tenantId);
      this.assertActorCanAccessBranch(actor, branchId);
    }
    if (dto.requisitionId) {
      const requisition = await this.prisma.personnelRequisition.findFirst({
        where: { id: dto.requisitionId, tenantId },
        include: { locations: true },
      });
      if (!requisition) throw new NotFoundException('Personnel requisition not found');
      if (requisition.status !== 'APPROVED') {
        throw new BadRequestException('The personnel requisition must be approved before creating a vacancy');
      }
    }
    this.assertUniqueStages(dto.stages ?? []);
    await this.assertResponsiblesCanAccessBranch(
      tenantId,
      dto.branchId,
      dto.responsibles ?? [],
    );

    const applicationFormSchema = this.normalizeApplicationFormSchema(dto.applicationFormSchema);

    return this.prisma.$transaction(async (tx) => {
      const vacancy = await tx.vacancy.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          createdByUserId: actor.sub,
          requisitionId: dto.requisitionId,
          title: dto.title,
          summary: dto.summary,
          description: dto.description,
          requirements: dto.requirements,
          responsibilities: dto.responsibilities,
          benefits: dto.benefits,
          city: dto.city,
          country: dto.country,
          department: dto.department,
          seniority: dto.seniority,
          workMode: dto.workMode,
          employmentType: dto.employmentType,
          openings: dto.openings,
          salaryMin: dto.salaryMin,
          salaryMax: dto.salaryMax,
          currency: dto.currency,
          applicationFormSchema,
          status: dto.status,
        },
      });

      await tx.vacancyLocation.createMany({
        data: locationBranchIds.map((branchId) => ({
          tenantId,
          vacancyId: vacancy.id,
          branchId,
          city: dto.city,
          country: dto.country,
          isPrimary: branchId === dto.branchId,
        })),
      });

      if (dto.stages?.length) {
        await tx.vacancyStage.createMany({
          data: dto.stages.map((stage) => ({
            tenantId,
            vacancyId: vacancy.id,
            code: stage.code.trim().toUpperCase(),
            name: stage.name.trim(),
            position: stage.position,
            color: stage.color,
            applicationStatus: stage.applicationStatus,
            allowedNextStageCodes: stage.allowedNextStageCodes?.map((code) => code.trim().toUpperCase()),
            requiredFields: stage.requiredFields,
            requiresApproval: stage.requiresApproval ?? false,
            requiredApprovals: stage.requiresApproval ? Math.max(1, stage.requiredApprovals ?? 1) : 0,
            allowReopen: stage.allowReopen ?? false,
            slaHours: stage.slaHours,
            slaWarningHoursBefore: stage.slaWarningHoursBefore ?? 4,
            slaEscalationHours: stage.slaEscalationHours ?? 8,
            autoReassignAfterHours: stage.autoReassignAfterHours,
            isTerminal: stage.isTerminal ?? false,
          })),
        });
      }

      if (dto.responsibles?.length) {
        await tx.vacancyResponsible.createMany({
          data: dto.responsibles.map((responsible) => ({
            tenantId,
            vacancyId: vacancy.id,
            userId: responsible.userId,
            role: responsible.role,
          })),
          skipDuplicates: true,
        });
      }

      await tx.vacancyChangeEvent.create({
        data: {
          tenantId,
          vacancyId: vacancy.id,
          actorUserId: actor.sub,
          type: dto.requisitionId ? 'REQUISITION_LINKED' : 'CREATED',
          newValue: this.toJson({ title: vacancy.title, status: vacancy.status, branchIds: locationBranchIds, requisitionId: dto.requisitionId }),
        },
      });

      return tx.vacancy.findUniqueOrThrow({
        where: { id: vacancy.id },
        include: {
          branch: true,
          locations: { include: { branch: true }, orderBy: { isPrimary: 'desc' } },
          requisition: true,
          createdByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          stages: { orderBy: { position: 'asc' } },
          responsibles: {
            include: {
              user: {
                select: { id: true, email: true, firstName: true, lastName: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
    });
  }

  async findAll(tenantId: string, actor: JwtPayload, query: ListVacanciesDto) {
    const pagination = normalizeOffsetPagination(query);
    if (query.branchId) {
      await this.assertBranchBelongsToTenant(query.branchId, tenantId);
      this.assertActorCanAccessBranch(actor, query.branchId);
    }

    const where: Prisma.VacancyWhereInput = {
      tenantId,
      ...this.vacancyScope(actor),
      ...(query.branchId ? { locations: { some: { branchId: query.branchId } } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.workMode ? { workMode: query.workMode } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { department: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vacancy.findMany({
        where,
        include: {
          branch: true,
          locations: { include: { branch: true }, orderBy: { isPrimary: 'desc' } },
          requisition: { select: { id: true, title: true, status: true } },
          stages: { orderBy: { position: 'asc' } },
          responsibles: {
            include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
            orderBy: { createdAt: 'asc' },
          },
          createdByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          imageFiles: {
            where: { status: 'ACTIVE' },
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.vacancy.count({ where }),
    ]);

    return {
      data: items.map((item) => this.withSignedImage(item)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findOne(id: string, tenantId: string, actor?: JwtPayload) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: {
        id,
        tenantId,
        ...(actor ? this.vacancyScope(actor) : {}),
      },
      include: {
        branch: true,
        locations: { include: { branch: true }, orderBy: { isPrimary: 'desc' } },
        requisition: { select: { id: true, title: true, status: true } },
        stages: { orderBy: { position: 'asc' } },
        responsibles: {
          include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: 'asc' },
        },
        createdByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        imageFiles: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!vacancy) {
      throw new NotFoundException('Vacancy not found');
    }

    return this.withSignedImage(vacancy);
  }

  async update(id: string, tenantId: string, actor: JwtPayload, dto: UpdateVacancyDto) {
    const before = await this.findOne(id, tenantId, actor);
    if (dto.branchId) {
      await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
      this.assertActorCanAccessBranch(actor, dto.branchId);
    }
    const primaryBranchId = dto.branchId ?? before.branchId;
    const locationBranchIds = dto.locationBranchIds
      ? [...new Set([primaryBranchId, ...dto.locationBranchIds])]
      : undefined;
    if (locationBranchIds) {
      for (const branchId of locationBranchIds) {
        await this.assertBranchBelongsToTenant(branchId, tenantId);
        this.assertActorCanAccessBranch(actor, branchId);
      }
    }
    if (dto.stages) this.assertUniqueStages(dto.stages);
    if (dto.responsibles) {
      await this.assertResponsiblesCanAccessBranch(tenantId, primaryBranchId, dto.responsibles);
    }

    const data: Prisma.VacancyUncheckedUpdateInput = {
      ...(dto.branchId !== undefined ? { branchId: dto.branchId } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.requirements !== undefined ? { requirements: dto.requirements } : {}),
      ...(dto.responsibilities !== undefined
        ? { responsibilities: dto.responsibilities }
        : {}),
      ...(dto.benefits !== undefined ? { benefits: dto.benefits } : {}),
      ...(dto.city !== undefined ? { city: dto.city } : {}),
      ...(dto.country !== undefined ? { country: dto.country } : {}),
      ...(dto.department !== undefined ? { department: dto.department } : {}),
      ...(dto.seniority !== undefined ? { seniority: dto.seniority } : {}),
      ...(dto.workMode !== undefined ? { workMode: dto.workMode } : {}),
      ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
      ...(dto.openings !== undefined ? { openings: dto.openings } : {}),
      ...(dto.salaryMin !== undefined ? { salaryMin: dto.salaryMin } : {}),
      ...(dto.salaryMax !== undefined ? { salaryMax: dto.salaryMax } : {}),
      ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
      ...(dto.applicationFormSchema !== undefined
        ? {
            applicationFormSchema: this.normalizeApplicationFormSchema(dto.applicationFormSchema),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.vacancy.update({ where: { id }, data });
      if (locationBranchIds) {
        await tx.vacancyLocation.deleteMany({ where: { vacancyId: id } });
        await tx.vacancyLocation.createMany({
          data: locationBranchIds.map((branchId) => ({
            tenantId,
            vacancyId: id,
            branchId,
            city: dto.city ?? before.city,
            country: dto.country ?? before.country,
            isPrimary: branchId === primaryBranchId,
          })),
        });
      }
      if (dto.stages) {
        const pipelineChanged = JSON.stringify(dto.stages.map((stage) => ({
          code: stage.code.trim().toUpperCase(),
          name: stage.name.trim(),
          position: stage.position,
          color: stage.color ?? null,
          applicationStatus: stage.applicationStatus ?? 'REVIEWING',
          allowedNextStageCodes: stage.allowedNextStageCodes ?? [],
          requiredFields: stage.requiredFields ?? [],
          requiresApproval: stage.requiresApproval ?? false,
          requiredApprovals: stage.requiresApproval ? Math.max(1, stage.requiredApprovals ?? 1) : 0,
          allowReopen: stage.allowReopen ?? false,
          slaHours: stage.slaHours ?? null,
          slaWarningHoursBefore: stage.slaWarningHoursBefore ?? 4,
          slaEscalationHours: stage.slaEscalationHours ?? 8,
          autoReassignAfterHours: stage.autoReassignAfterHours ?? null,
          isTerminal: stage.isTerminal ?? false,
        }))) !== JSON.stringify(before.stages.map((stage) => ({
          code: stage.code,
          name: stage.name,
          position: stage.position,
          color: stage.color,
          applicationStatus: stage.applicationStatus,
          allowedNextStageCodes: stage.allowedNextStageCodes,
          requiredFields: stage.requiredFields,
          requiresApproval: stage.requiresApproval,
          requiredApprovals: stage.requiredApprovals,
          allowReopen: stage.allowReopen,
          slaHours: stage.slaHours,
          slaWarningHoursBefore: stage.slaWarningHoursBefore,
          slaEscalationHours: stage.slaEscalationHours,
          autoReassignAfterHours: stage.autoReassignAfterHours,
          isTerminal: stage.isTerminal,
        })));
        const applications = await tx.vacancyApplication.count({ where: { vacancyId: id } });
        if (pipelineChanged && applications > 0) {
          throw new BadRequestException('The pipeline cannot be replaced after applications exist');
        }
        if (pipelineChanged) {
          await tx.vacancyStage.deleteMany({ where: { vacancyId: id } });
          await tx.vacancyStage.createMany({
            data: dto.stages.map((stage) => ({
            tenantId,
            vacancyId: id,
            code: stage.code.trim().toUpperCase(),
            name: stage.name.trim(),
            position: stage.position,
            color: stage.color,
            applicationStatus: stage.applicationStatus,
            allowedNextStageCodes: stage.allowedNextStageCodes?.map((code) => code.trim().toUpperCase()),
            requiredFields: stage.requiredFields,
            requiresApproval: stage.requiresApproval ?? false,
            requiredApprovals: stage.requiresApproval ? Math.max(1, stage.requiredApprovals ?? 1) : 0,
            allowReopen: stage.allowReopen ?? false,
            slaHours: stage.slaHours,
            slaWarningHoursBefore: stage.slaWarningHoursBefore ?? 4,
            slaEscalationHours: stage.slaEscalationHours ?? 8,
            autoReassignAfterHours: stage.autoReassignAfterHours,
            isTerminal: stage.isTerminal ?? false,
            })),
          });
        }
      }
      if (dto.responsibles) {
        await tx.vacancyResponsible.deleteMany({ where: { vacancyId: id } });
        if (dto.responsibles.length) {
          await tx.vacancyResponsible.createMany({
            data: dto.responsibles.map((item) => ({ tenantId, vacancyId: id, userId: item.userId, role: item.role })),
            skipDuplicates: true,
          });
        }
      }
      await tx.vacancyChangeEvent.create({
        data: {
          tenantId,
          vacancyId: id,
          actorUserId: actor.sub,
          type: dto.status !== undefined && dto.status !== before.status ? 'STATUS_CHANGED' : locationBranchIds ? 'LOCATION_CHANGED' : 'UPDATED',
          previousValue: this.toJson(this.vacancySnapshot(before)),
          newValue: this.toJson({ ...this.vacancySnapshot(before), ...dto, locationBranchIds }),
        },
      });
    });

    return this.findOne(id, tenantId, actor);
  }

  async clone(id: string, tenantId: string, actor: JwtPayload, reason?: string) {
    const source = await this.prisma.vacancy.findFirst({
      where: { id, tenantId, ...this.vacancyScope(actor) },
      include: { locations: true, stages: { orderBy: { position: 'asc' } }, responsibles: true },
    });
    if (!source) throw new NotFoundException('Vacancy not found');
    await this.planLimits?.assertCapacity(tenantId, 'maxActiveVacancies');
    return this.prisma.$transaction(async (tx) => {
      const clone = await tx.vacancy.create({
        data: {
          tenantId,
          branchId: source.branchId,
          createdByUserId: actor.sub,
          clonedFromVacancyId: source.id,
          title: `${source.title} (copia)`,
          summary: source.summary,
          description: source.description,
          requirements: source.requirements,
          responsibilities: source.responsibilities,
          benefits: source.benefits,
          city: source.city,
          country: source.country,
          department: source.department,
          seniority: source.seniority,
          workMode: source.workMode,
          employmentType: source.employmentType,
          openings: source.openings,
          salaryMin: source.salaryMin,
          salaryMax: source.salaryMax,
          currency: source.currency,
          applicationFormSchema: source.applicationFormSchema ?? Prisma.JsonNull,
          status: 'PAUSED',
        },
      });
      await tx.vacancyLocation.createMany({
        data: source.locations.map((item) => ({ tenantId, vacancyId: clone.id, branchId: item.branchId, city: item.city, country: item.country, isPrimary: item.isPrimary })),
      });
      await tx.vacancyStage.createMany({
        data: source.stages.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...stage }) => ({ ...stage, vacancyId: clone.id })),
      });
      await tx.vacancyResponsible.createMany({
        data: source.responsibles.map(({ id: _id, createdAt: _createdAt, ...item }) => ({ ...item, vacancyId: clone.id })),
        skipDuplicates: true,
      });
      await tx.vacancyChangeEvent.create({
        data: {
          tenantId,
          vacancyId: clone.id,
          actorUserId: actor.sub,
          type: 'CLONED',
          reason: reason?.trim(),
          previousValue: this.toJson({ sourceVacancyId: source.id }),
          newValue: this.toJson({ title: clone.title, status: clone.status }),
        },
      });
      return clone;
    });
  }

  async archive(id: string, tenantId: string, actor: JwtPayload, reason?: string) {
    if (!reason?.trim()) throw new BadRequestException('An archive reason is required');
    const before = await this.findOne(id, tenantId, actor);
    if (before.status === 'ARCHIVED') return before;
    await this.prisma.$transaction([
      this.prisma.vacancy.update({ where: { id }, data: { status: 'ARCHIVED' } }),
      this.prisma.vacancyChangeEvent.create({
        data: {
          tenantId,
          vacancyId: id,
          actorUserId: actor.sub,
          type: 'STATUS_CHANGED',
          reason: reason.trim(),
          previousValue: this.toJson({ status: before.status }),
          newValue: this.toJson({ status: 'ARCHIVED' }),
        },
      }),
    ]);
    return this.findOne(id, tenantId, actor);
  }

  async history(id: string, tenantId: string, actor: JwtPayload) {
    await this.findOne(id, tenantId, actor);
    return this.prisma.vacancyChangeEvent.findMany({
      where: { vacancyId: id, tenantId },
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async findPublic(query: ListPublicVacanciesDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.VacancyWhereInput = {
      status: 'OPEN',
      ...(query.workMode ? { workMode: query.workMode } : {}),
      ...(query.employmentType ? { employmentType: query.employmentType } : {}),
      ...(query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              { summary: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { department: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { country: { contains: query.search, mode: 'insensitive' } },
              { tenant: { name: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.vacancy.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              location: true,
            },
          },
          locations: {
            include: { branch: { select: { id: true, name: true, location: true } } },
            orderBy: { isPrimary: 'desc' },
          },
          imageFiles: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.vacancy.count({ where }),
    ]);

    return {
      data: items.map((item) => this.withSignedImage(item)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findPublicOne(id: string) {
    const vacancy = await this.prisma.vacancy.findFirst({
      where: {
        id,
        status: 'OPEN',
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            location: true,
          },
        },
        locations: {
          include: { branch: { select: { id: true, name: true, location: true } } },
          orderBy: { isPrimary: 'desc' },
        },
        imageFiles: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 },
      },
    });

    if (!vacancy) {
      throw new NotFoundException('Vacancy not found');
    }

    return this.withSignedImage(vacancy);
  }

  async uploadImage(
    id: string,
    tenantId: string,
    actor: JwtPayload,
    file: Express.Multer.File,
  ) {
    await this.findOne(id, tenantId, actor);
    if (!this.files || !this.antivirus) throw new BadRequestException('Vacancy image upload is not available');
    const mimeType = this.files.validateVacancyImage(file);
    const quarantined = await this.files.store('vacancy-image', tenantId, id, file, mimeType);
    let stored: { storageKey: string; sha256: string };
    let scan: Awaited<ReturnType<TrainingAntivirusService['scan']>>;
    try {
      scan = await this.scanVacancyImage(file.buffer);
      stored = { ...quarantined, ...await this.files.promote(quarantined.storageKey) };
    } catch (error) {
      await this.files.delete(quarantined.storageKey);
      throw error;
    }
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const latest = await tx.vacancyImageFile.aggregate({
          where: { vacancyId: id },
          _max: { version: true },
        });
        await tx.vacancyImageFile.updateMany({
          where: { vacancyId: id, status: 'ACTIVE' },
          data: { status: 'SUPERSEDED', supersededAt: new Date() },
        });
        await tx.vacancy.update({ where: { id }, data: { imageUrl: null } });
        return tx.vacancyImageFile.create({
          data: {
            tenantId,
            vacancyId: id,
            version: (latest._max.version ?? 0) + 1,
            storageKey: stored.storageKey,
            originalName: file.originalname,
            mimeType,
            sizeBytes: file.size,
            sha256: stored.sha256,
            scanStatus: scan.status,
            scanEngine: scan.engine ?? 'static-structure-v1',
            uploadedByUserId: actor.sub,
            retainUntil: this.files!.retentionDate('vacancy-image'),
          },
        });
      });
      return {
        id: created.id,
        version: created.version,
        originalName: created.originalName,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        ...this.files.createSignedUrl('vacancy-image', created.id, 900),
      };
    } catch (error) {
      await this.files.delete(stored.storageKey);
      throw error;
    }
  }

  async listImageVersions(id: string, tenantId: string, actor: JwtPayload) {
    await this.findOne(id, tenantId, actor);
    return this.prisma.vacancyImageFile.findMany({
      where: { vacancyId: id, tenantId },
      select: {
        id: true,
        version: true,
        status: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        sha256: true,
        scanStatus: true,
        retainUntil: true,
        createdAt: true,
        deletedAt: true,
        deletionReason: true,
      },
      orderBy: { version: 'desc' },
    });
  }

  private async scanVacancyImage(buffer: Buffer) {
    try {
      return await this.antivirus!.scan(buffer);
    } catch (error) {
      // Temporary fallback while the shared antivirus service is disabled.
      // Image type and size checks still run before the file reaches this point.
      if (
        this.antivirus?.mode === 'disabled'
        && error instanceof HttpException
        && error.getStatus() === HttpStatus.SERVICE_UNAVAILABLE
      ) {
        return { status: 'SKIPPED' as const, engine: null };
      }
      throw error;
    }
  }

  async deleteImage(
    id: string,
    imageId: string,
    tenantId: string,
    actor: JwtPayload,
    reason: string,
  ) {
    await this.findOne(id, tenantId, actor);
    if (!reason?.trim()) throw new BadRequestException('Deletion reason is required');
    const image = await this.prisma.vacancyImageFile.findFirst({
      where: { id: imageId, vacancyId: id, tenantId, status: { not: 'DELETED' } },
    });
    if (!image) throw new NotFoundException('Vacancy image version not found');
    const deleted = await this.prisma.vacancyImageFile.update({
      where: { id: image.id },
      data: {
        status: 'DELETED',
        deletedAt: new Date(),
        deletedByUserId: actor.sub,
        deletionReason: reason.trim(),
      },
      select: { id: true, version: true, status: true, deletedAt: true, deletionReason: true },
    });
    await this.files?.delete(image.storageKey);
    return deleted;
  }

  private withSignedImage<T extends { imageUrl?: string | null; imageFiles?: Array<{ id: string }> }>(
    vacancy: T,
  ) {
    const active = vacancy.imageFiles?.[0];
    const { imageFiles: _imageFiles, ...rest } = vacancy;
    return {
      ...rest,
      imageUrl: active && this.files
        ? this.files.createSignedUrl('vacancy-image', active.id, 900).url
        : vacancy.imageUrl,
      imageFileId: active?.id ?? null,
    };
  }

  async listFormTemplates(tenantId: string) {
    return this.prisma.vacancyFormTemplate.findMany({
      where: { tenantId },
      orderBy: [{ name: 'asc' }],
    });
  }

  async createFormTemplate(tenantId: string, dto: CreateVacancyFormTemplateDto) {
    return this.prisma.vacancyFormTemplate.create({
      data: {
        tenantId,
        name: dto.name,
        roleTitle: dto.roleTitle,
        description: dto.description,
        schema: dto.schema as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async deleteFormTemplate(id: string, tenantId: string) {
    const template = await this.prisma.vacancyFormTemplate.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!template) {
      throw new NotFoundException('Vacancy form template not found');
    }

    await this.prisma.vacancyFormTemplate.delete({
      where: { id },
    });

    return { deleted: true };
  }

  private async assertBranchBelongsToTenant(branchId: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        tenantId,
      },
      select: { id: true },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
  }

  private vacancyScope(actor: JwtPayload): Prisma.VacancyWhereInput {
    if (actor.scope !== AccessScope.BRANCH || actor.isSuperAdmin) {
      return {};
    }

    return { locations: { some: { branchId: { in: actor.allowedBranchIds } } } };
  }

  private vacancySnapshot(vacancy: {
    title: string;
    summary?: string | null;
    description?: string | null;
    requirements?: string | null;
    responsibilities?: string | null;
    benefits?: string | null;
    city?: string | null;
    country?: string | null;
    department?: string | null;
    seniority?: string | null;
    workMode?: unknown;
    employmentType?: unknown;
    openings?: number | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    currency?: string | null;
    status?: unknown;
    branchId: string;
    locations?: Array<{ branchId: string }>;
  }) {
    return {
      title: vacancy.title,
      summary: vacancy.summary,
      description: vacancy.description,
      requirements: vacancy.requirements,
      responsibilities: vacancy.responsibilities,
      benefits: vacancy.benefits,
      city: vacancy.city,
      country: vacancy.country,
      department: vacancy.department,
      seniority: vacancy.seniority,
      workMode: vacancy.workMode,
      employmentType: vacancy.employmentType,
      openings: vacancy.openings,
      salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax,
      currency: vacancy.currency,
      status: vacancy.status,
      branchId: vacancy.branchId,
      locationBranchIds: vacancy.locations?.map((item) => item.branchId) ?? [vacancy.branchId],
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertActorCanAccessBranch(actor: JwtPayload, branchId: string) {
    if (
      actor.scope === AccessScope.BRANCH &&
      !actor.isSuperAdmin &&
      !actor.allowedBranchIds.includes(branchId)
    ) {
      throw new ForbiddenException('Branch is outside the actor access scope');
    }
  }

  private assertUniqueStages(stages: NonNullable<CreateVacancyDto['stages']>) {
    const codes = stages.map((stage) => stage.code.trim().toUpperCase());
    const positions = stages.map((stage) => stage.position);
    if (new Set(codes).size !== codes.length || new Set(positions).size !== positions.length) {
      throw new BadRequestException('Stage codes and positions must be unique');
    }
    const knownCodes = new Set(codes);
    const invalidDestination = stages
      .flatMap((stage) => stage.allowedNextStageCodes ?? [])
      .map((code) => code.trim().toUpperCase())
      .find((code) => !knownCodes.has(code));
    if (invalidDestination) {
      throw new BadRequestException(`Unknown destination stage code: ${invalidDestination}`);
    }
  }

  private async assertResponsiblesCanAccessBranch(
    tenantId: string,
    branchId: string,
    responsibles: NonNullable<CreateVacancyDto['responsibles']>,
  ) {
    const userIds = [...new Set(responsibles.map((item) => item.userId))];
    if (userIds.length === 0) {
      return;
    }

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
          { branchAccesses: { some: { branchId } } },
        ],
      },
    });

    if (count !== userIds.length) {
      throw new BadRequestException(
        'Every responsible must be active and have access to the vacancy branch',
      );
    }
  }

  private normalizeApplicationFormSchema(
    schema: { sections?: Array<unknown> } | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (!schema) {
      return undefined;
    }

    if (!Array.isArray(schema.sections) || schema.sections.length === 0) {
      return Prisma.JsonNull;
    }

    return schema as unknown as Prisma.InputJsonValue;
  }
}
