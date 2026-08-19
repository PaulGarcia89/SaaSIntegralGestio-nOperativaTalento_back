import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { SubscriptionAccessState } from '../common/auth/subscription-access-state.enum';
import { PrismaService } from '../common/prisma/prisma.service';
import { RoleScope } from '../common/enums/role-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { AccessScope } from '../common/enums/access-scope.enum';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { BulkCreateEmployeesDto } from './dto/bulk-create-employees.dto';
import { ListEmployeesDto } from './dto/list-employees.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { AssignEmployeeBranchDto } from './dto/assign-employee-branch.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { UpdateEmployeeStatusDto } from './dto/update-employee-status.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateEmployeeDto) {
    await this.assertBranchBelongsToTenant(dto.primaryBranchId, tenantId);

    const name = dto.name.trim();
    const email = dto.email.trim().toLowerCase();
    const jobTitle = dto.primaryRole.trim();

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

  async bulkCreate(tenantId: string, dto: BulkCreateEmployeesDto) {
    const emails = dto.employees.map((employee) => employee.email.trim().toLowerCase());
    const duplicateEmails = [...new Set(emails.filter((email, index) => emails.indexOf(email) !== index))];
    if (duplicateEmails.length) {
      throw new BadRequestException(`Duplicate emails in import: ${duplicateEmails.join(', ')}`);
    }

    const branchIds = [...new Set(dto.employees.map((employee) => employee.primaryBranchId))];
    const branches = await this.prisma.branch.findMany({
      where: { id: { in: branchIds }, tenantId },
      select: { id: true },
    });
    if (branches.length !== branchIds.length) {
      throw new BadRequestException('Every imported employee must belong to a branch in the current company');
    }

    const existing = await this.prisma.employee.findMany({
      where: { tenantId, email: { in: emails, mode: 'insensitive' } },
      select: { email: true },
    });
    if (existing.length) {
      throw new BadRequestException(`Employees already exist: ${existing.map((employee) => employee.email).join(', ')}`);
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

    return { created: created.length, employees: created };
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
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.mapEmployee(employee);
  }

  async update(id: string, actor: JwtPayload, tenantId: string, dto: UpdateEmployeeDto) {
    await this.ensureEmployeeExists(id, actor, tenantId);

    await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
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
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return {
      employeeId: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      email: employee.email,
      status: employee.status,
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
      throw new BadRequestException('Employee does not have an active primary branch');
    }

    if (currentPrimary.branchId === dto.branchId) {
      throw new BadRequestException('Target branch must differ from the current primary branch');
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
      throw new BadRequestException('Employee already has an active assignment in that branch');
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
      throw new NotFoundException('Employee not found');
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
      throw new NotFoundException('Branch not found');
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
    },
  ) {
    const primaryAssignment =
      employee.branchAssignments.find((assignment) => assignment.isPrimary) ?? null;

    return {
      id: employee.id,
      tenantId: employee.tenantId,
      name: employee.name,
      email: employee.email,
      status: employee.status,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
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
