import {
  BadRequestException,
  ForbiddenException,
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

@Injectable()
export class VacanciesService {
  constructor(private readonly prisma: PrismaService, private readonly planLimits?: PlanLimitsService) {}

  async create(tenantId: string, actor: JwtPayload, dto: CreateVacancyDto) {
    await this.planLimits?.assertCapacity(tenantId, 'maxActiveVacancies');
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    this.assertActorCanAccessBranch(actor, dto.branchId);
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
          imageUrl: dto.imageUrl,
          applicationFormSchema,
          status: dto.status,
        },
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

      return tx.vacancy.findUniqueOrThrow({
        where: { id: vacancy.id },
        include: {
          branch: true,
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
      ...(query.branchId ? { branchId: query.branchId } : {}),
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
          createdByUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.vacancy.count({ where }),
    ]);

    return {
      data: items,
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
        createdByUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!vacancy) {
      throw new NotFoundException('Vacancy not found');
    }

    return vacancy;
  }

  async update(id: string, tenantId: string, actor: JwtPayload, dto: UpdateVacancyDto) {
    await this.findOne(id, tenantId, actor);
    if (dto.branchId) {
      await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
      this.assertActorCanAccessBranch(actor, dto.branchId);
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
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.applicationFormSchema !== undefined
        ? {
            applicationFormSchema: this.normalizeApplicationFormSchema(dto.applicationFormSchema),
          }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };

    await this.prisma.vacancy.update({
      where: { id },
      data,
    });

    return this.findOne(id, tenantId, actor);
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
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.vacancy.count({ where }),
    ]);

    return {
      data: items,
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
      },
    });

    if (!vacancy) {
      throw new NotFoundException('Vacancy not found');
    }

    return vacancy;
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

    return { branchId: { in: actor.allowedBranchIds } };
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
