import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { SubscriptionAccessState } from '../common/auth/subscription-access-state.enum';
import { PrismaService } from '../common/prisma/prisma.service';
import { RoleScope } from '../common/enums/role-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AccessScope } from '../common/enums/access-scope.enum';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { RegisterEmployeeDto } from './dto/register-employee.dto';
import { BulkLoadEmployeesDto } from './dto/bulk-load-employees.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { AssignEmployeeBranchDto } from './dto/assign-employee-branch.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async register(tenantId: string, dto: RegisterEmployeeDto) {
    await this.assertBranchBelongsToTenant(dto.primaryBranchId, tenantId);

    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const jobTitle = dto.primaryRole.trim();

    const existing = await this.prisma.employee.findFirst({
      where: { tenantId, email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Ya existe un registro de empleado con este correo en la empresa');
    }

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          tenantId,
          name,
          email,
          jobTitle,
          status: dto.status,
        },
      });

      await tx.employeeBranch.create({
        data: {
          tenantId,
          employeeId: created.id,
          branchId: dto.primaryBranchId,
          role: jobTitle,
          isPrimary: true,
        },
      });

      return created;
    });

    return this.findOne(employee.id, this.buildSystemActor(tenantId), tenantId);
  }

  /** @deprecated Kept for internal compatibility. */
  create(tenantId: string, dto: RegisterEmployeeDto) {
    return this.register(tenantId, dto);
  }

  async validateBulkLoad(tenantId: string, dto: BulkLoadEmployeesDto) {
    const emails = dto.employees.map((employee) => employee.email.trim().toLowerCase());
    const branchIds = [...new Set(dto.employees.map((employee) => employee.primaryBranchId))];
    const [branches, existing] = await Promise.all([
      this.prisma.branch.findMany({
        where: { id: { in: branchIds }, tenantId },
        select: { id: true },
      }),
      this.prisma.employee.findMany({
        where: { tenantId, email: { in: emails, mode: 'insensitive' } },
        select: { email: true },
      }),
    ]);
    const validBranchIds = new Set(branches.map((branch) => branch.id));
    const existingEmails = new Set(existing.map((employee) => employee.email.trim().toLowerCase()));
    const emailCounts = new Map<string, number>();
    for (const email of emails) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);

    const rows = dto.employees.map((input, index) => {
      const email = input.email.trim().toLowerCase();
      const errors = [
        ...((emailCounts.get(email) ?? 0) > 1 ? ['DUPLICATE_EMAIL_IN_LOAD'] : []),
        ...(existingEmails.has(email) ? ['EMPLOYEE_EMAIL_ALREADY_REGISTERED'] : []),
        ...(!validBranchIds.has(input.primaryBranchId) ? ['BRANCH_NOT_AVAILABLE_IN_TENANT'] : []),
      ];
      return {
        row: index + 1,
        valid: errors.length === 0,
        errors,
        employee: {
          name: input.name.trim(),
          email,
          status: input.status,
          primaryBranchId: input.primaryBranchId,
          primaryRole: input.primaryRole.trim(),
        },
      };
    });

    return {
      total: rows.length,
      valid: rows.filter((row) => row.valid).length,
      invalid: rows.filter((row) => !row.valid).length,
      rows,
    };
  }

  async bulkLoad(tenantId: string, dto: BulkLoadEmployeesDto) {
    const validation = await this.validateBulkLoad(tenantId, dto);
    if (validation.invalid > 0) {
      throw new BadRequestException({
        message: 'La carga contiene registros de empleados que requieren corrección',
        validation,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const employees = [] as Array<{ id: string; email: string }>;
      for (const input of dto.employees) {
        const name = input.name.trim();
        const email = input.email.trim().toLowerCase();
        const jobTitle = input.primaryRole.trim();
        const employee = await tx.employee.create({
          data: {
            tenantId,
            name,
            email,
            jobTitle,
            status: input.status,
          },
        });
        await tx.employeeBranch.create({
          data: {
            tenantId,
            employeeId: employee.id,
            branchId: input.primaryBranchId,
            role: jobTitle,
            isPrimary: true,
          },
        });
        employees.push({ id: employee.id, email: employee.email });
      }
      return employees;
    });

    return {
      created: created.length,
      employees: created,
      message: `${created.length} registros de empleados cargados correctamente`,
    };
  }

  /** @deprecated Kept for internal compatibility. */
  bulkCreate(tenantId: string, dto: BulkLoadEmployeesDto) {
    return this.bulkLoad(tenantId, dto);
  }

  async findAll(tenantId: string, activeBranchId: string, query: ListEmployeesDto) {
    const pagination = normalizeOffsetPagination(query);
    const branchId = query.branchId ?? activeBranchId;
    await this.assertBranchBelongsToTenant(branchId, tenantId);

    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      branchAssignments: {
        some: {
          tenantId,
          branchId,
          releasedAt: null,
        },
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: {
          branchAssignments: {
            where: {
              tenantId,
              releasedAt: null,
            },
            include: {
              branch: true,
            },
            orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
          },
          _count: {
            select: {
              employeeDocuments: {
                where: { deletedAt: null, status: { not: 'SUPERSEDED' } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data: items.map((employee) => this.mapEmployee(employee)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findOne(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
      include: {
        branchAssignments: {
          where: {
            tenantId,
            releasedAt: null,
          },
          include: {
            branch: true,
          },
          orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'desc' }],
        },
        _count: {
          select: {
            employeeDocuments: {
              where: { deletedAt: null, status: { not: 'SUPERSEDED' } },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    return this.mapEmployee(employee);
  }

  async update(id: string, actor: JwtPayload, tenantId: string, dto: UpdateEmployeeDto) {
    await this.ensureEmployeeExists(id, actor, tenantId);

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() } : {}),
          ...(dto.jobTitle !== undefined ? { jobTitle: dto.jobTitle.trim() } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
        },
      });

      if (dto.jobTitle !== undefined) {
        await tx.employeeBranch.updateMany({
          where: { tenantId, employeeId: id, isPrimary: true, releasedAt: null },
          data: { role: dto.jobTitle.trim() },
        });
      }
    });

    if (dto.status === EmployeeStatus.TERMINATED) {
      await this.releaseActiveAssignments(id, tenantId);
    }

    return this.findOne(id, actor, tenantId);
  }

  async updateStatus(id: string, actor: JwtPayload, tenantId: string, dto: UpdateEmployeeStatusDto) {
    await this.ensureEmployeeExists(id, actor, tenantId);

    await this.prisma.employee.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });

    if (dto.status === EmployeeStatus.TERMINATED) {
      await this.releaseActiveAssignments(id, tenantId);
    }

    return this.findOne(id, actor, tenantId);
  }

  async history(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
      include: {
        branchAssignments: {
          where: {
            tenantId,
          },
          include: {
            branch: true,
          },
          orderBy: [{ assignedAt: 'desc' }],
        },
        employeeDocuments: {
          where: { tenantId, status: { not: 'SUPERSEDED' } },
          select: {
            id: true,
            category: true,
            originalName: true,
            status: true,
            version: true,
            createdAt: true,
            updatedAt: true,
            reviewedAt: true,
            expiresAt: true,
            deletedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }],
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    const auditTrail = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: 'Employee', entityId: employee.id },
      select: {
        id: true,
        action: true,
        userId: true,
        email: true,
        actorRole: true,
        before: true,
        after: true,
        correlationId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      employeeId: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      email: employee.email,
      status: employee.status,
      jobTitle: employee.jobTitle,
      source: employee.sourceCandidateId ? 'CANDIDATE_CONVERSION' : 'DIRECTORY_REGISTRATION',
      assignments: employee.branchAssignments.map((assignment) => ({
        id: assignment.id,
        employeeId: employee.id,
        branchId: assignment.branchId,
        role: assignment.role,
        isPrimary: assignment.isPrimary,
        active: assignment.releasedAt === null,
        assignedAt: assignment.assignedAt,
        unassignedAt: assignment.releasedAt,
        branch: assignment.branch,
      })),
      documents: employee.employeeDocuments,
      auditTrail,
    };
  }

  async documentSummary(id: string, actor: JwtPayload, tenantId: string) {
    await this.ensureEmployeeExists(id, actor, tenantId);
    const now = new Date();
    const expiringBefore = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const documents = await this.prisma.employeeDocument.findMany({
      where: { tenantId, employeeId: id, deletedAt: null, status: { not: 'SUPERSEDED' } },
      select: {
        id: true,
        category: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        scanStatus: true,
        status: true,
        version: true,
        rejectionReason: true,
        expiresAt: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ category: 'asc' }, { version: 'desc' }],
    });
    const byCategory = documents.reduce<Record<string, number>>((summary, document) => {
      summary[document.category] = (summary[document.category] ?? 0) + 1;
      return summary;
    }, {});

    return {
      employeeId: id,
      generatedAt: now,
      summary: {
        total: documents.length,
        pendingReview: documents.filter((document) => document.status === 'PENDING_REVIEW').length,
        approved: documents.filter((document) => document.status === 'APPROVED').length,
        rejected: documents.filter((document) => document.status === 'REJECTED').length,
        expired: documents.filter((document) => document.expiresAt && document.expiresAt <= now).length,
        expiringWithin30Days: documents.filter(
          (document) => document.expiresAt && document.expiresAt > now && document.expiresAt <= expiringBefore,
        ).length,
        byCategory,
      },
      documents,
    };
  }

  async transfer(id: string, actor: JwtPayload, tenantId: string, dto: TransferEmployeeDto) {
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    this.assertBranchInActorScope(actor, dto.branchId);

    const employee = await this.ensureEmployeeExists(id, actor, tenantId);
    const currentPrimary = await this.prisma.employeeBranch.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        isPrimary: true,
        releasedAt: null,
      },
    });

    if (!currentPrimary) {
      throw new BadRequestException('El empleado no tiene una sucursal principal activa');
    }

    if (currentPrimary.branchId === dto.branchId) {
      throw new BadRequestException('La sucursal destino debe ser diferente de la sucursal principal actual');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employeeBranch.update({
        where: { id: currentPrimary.id },
        data: {
          releasedAt: new Date(),
        },
      });

      await tx.employeeBranch.create({
        data: {
          tenantId,
          employeeId: employee.id,
          branchId: dto.branchId,
          role: dto.role,
          isPrimary: true,
        },
      });
    });

    return this.findOne(id, actor, tenantId);
  }

  async assignSecondaryBranch(id: string, actor: JwtPayload, tenantId: string, dto: AssignEmployeeBranchDto) {
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    this.assertBranchInActorScope(actor, dto.branchId);
    await this.ensureEmployeeExists(id, actor, tenantId);

    const activeAssignment = await this.prisma.employeeBranch.findFirst({
      where: {
        tenantId,
        employeeId: id,
        branchId: dto.branchId,
        releasedAt: null,
      },
    });

    if (activeAssignment) {
      throw new BadRequestException('El empleado ya tiene una asignación activa en esa sucursal');
    }

    await this.prisma.employeeBranch.create({
      data: {
        tenantId,
        employeeId: id,
        branchId: dto.branchId,
        role: dto.role,
        isPrimary: false,
      },
    });

    return this.findOne(id, actor, tenantId);
  }

  private async ensureEmployeeExists(id: string, actor: JwtPayload, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
        ...this.buildBranchScopedWhere(actor, tenantId),
      },
    });

    if (!employee) {
      throw new NotFoundException('Registro de empleado no encontrado');
    }

    return employee;
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
      throw new NotFoundException('Sucursal no encontrada en la empresa activa');
    }
  }

  private async releaseActiveAssignments(employeeId: string, tenantId: string) {
    await this.prisma.employeeBranch.updateMany({
      where: {
        tenantId,
        employeeId,
        releasedAt: null,
      },
      data: {
        releasedAt: new Date(),
      },
    });
  }

  private buildBranchScopedWhere(actor: JwtPayload, tenantId: string): Prisma.EmployeeWhereInput {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) {
      return {};
    }

    // A plain branch user is an owner-scoped actor. Branch membership must not
    // allow reading or mutating coworkers that happen to share the same branch.
    if (actor.role === 'BRANCH_USER' || actor.roles.includes('BRANCH_USER')) {
      return {
        email: actor.email,
      };
    }

    if (actor.allowedBranchIds.length === 0) {
      return {
        id: '__no_employee_access__',
      };
    }

    return {
      branchAssignments: {
        some: {
          tenantId,
          branchId: { in: actor.allowedBranchIds },
          releasedAt: null,
        },
      },
    };
  }

  private assertBranchInActorScope(actor: JwtPayload, branchId: string) {
    if (actor.isSuperAdmin || actor.scope !== AccessScope.BRANCH) {
      return;
    }

    if (!actor.allowedBranchIds.includes(branchId)) {
      throw new NotFoundException('Branch not found');
    }
  }

  private buildSystemActor(tenantId: string): JwtPayload {
    return {
      sub: 'system',
      userId: 'system',
      tenantId,
      allowedTenantIds: [tenantId],
      activeTenantId: tenantId,
      tenantSlug: 'system',
      tenantName: 'system',
      email: 'system@local',
      firstName: 'System',
      lastName: 'Actor',
      role: 'SYSTEM',
      scope: AccessScope.TENANT,
      isSuperAdmin: true,
      roleScope: RoleScope.TENANT_ADMIN,
      allowedBranchIds: [],
      activeBranchId: null,
      roles: ['SYSTEM'],
      permissions: [],
      enabledModules: [],
      isGlobalContext: false,
      impersonation: {
        active: false,
        tenantId: null,
        startedAt: null,
        reason: null,
      },
      subscriptionStatus: SubscriptionAccessState.ACTIVE,
      subscriptionGraceEndsAt: null,
    };
  }

  private mapEmployee(
    employee: {
      id: string;
      tenantId: string;
      name: string;
      email: string;
      jobTitle: string | null;
      sourceCandidateId: string | null;
      status: EmployeeStatus;
      createdAt: Date;
      updatedAt: Date;
      branchAssignments: Array<{
        id: string;
        tenantId: string;
        employeeId: string;
        branchId: string;
        role: string;
        isPrimary: boolean;
        assignedAt: Date;
        releasedAt: Date | null;
        branch: {
          id: string;
          tenantId: string;
          name: string;
          location: string;
          createdAt: Date;
          updatedAt: Date;
        };
      }>;
      _count?: { employeeDocuments: number };
    },
  ) {
    const primaryAssignment =
      employee.branchAssignments.find((assignment) => assignment.isPrimary) ?? null;

    return {
      id: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      email: employee.email,
      jobTitle: employee.jobTitle,
      recordSource: employee.sourceCandidateId ? 'CANDIDATE_CONVERSION' : 'DIRECTORY_REGISTRATION',
      status: employee.status,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      documentSummary: {
        totalDocuments: employee._count?.employeeDocuments ?? 0,
      },
      primaryBranch: primaryAssignment
        ? {
            assignmentId: primaryAssignment.id,
            branchId: primaryAssignment.branchId,
            role: primaryAssignment.role,
            assignedAt: primaryAssignment.assignedAt,
            branch: primaryAssignment.branch,
          }
        : null,
      activeBranches: employee.branchAssignments.map((assignment) => ({
        assignmentId: assignment.id,
        branchId: assignment.branchId,
        role: assignment.role,
        isPrimary: assignment.isPrimary,
        assignedAt: assignment.assignedAt,
        branch: assignment.branch,
      })),
    };
  }
}
