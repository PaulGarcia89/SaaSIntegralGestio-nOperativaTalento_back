import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EmployeeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateEmployeeDto } from './dto/create-employee.dto';
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

    const employee = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          tenantId,
          name: dto.name,
          email: dto.email,
          status: dto.status,
        },
      });

      await tx.employeeBranch.create({
        data: {
          tenantId,
          employeeId: created.id,
          branchId: dto.primaryBranchId,
          role: dto.primaryRole,
          isPrimary: true,
        },
      });

      return created;
    });

    return this.findOne(employee.id, tenantId);
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

  async findOne(id: string, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
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

  async update(id: string, tenantId: string, dto: UpdateEmployeeDto) {
    await this.ensureEmployeeExists(id, tenantId);

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

    return this.findOne(id, tenantId);
  }

  async updateStatus(id: string, tenantId: string, dto: UpdateEmployeeStatusDto) {
    await this.ensureEmployeeExists(id, tenantId);

    await this.prisma.employee.update({
      where: { id },
      data: {
        status: dto.status,
      },
    });

    if (dto.status === EmployeeStatus.TERMINATED) {
      await this.releaseActiveAssignments(id, tenantId);
    }

    return this.findOne(id, tenantId);
  }

  async history(id: string, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
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

  async transfer(id: string, tenantId: string, dto: TransferEmployeeDto) {
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);

    const employee = await this.ensureEmployeeExists(id, tenantId);
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

    return this.findOne(id, tenantId);
  }

  async assignSecondaryBranch(id: string, tenantId: string, dto: AssignEmployeeBranchDto) {
    await this.assertBranchBelongsToTenant(dto.branchId, tenantId);
    await this.ensureEmployeeExists(id, tenantId);

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

    return this.findOne(id, tenantId);
  }

  private async ensureEmployeeExists(id: string, tenantId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id,
        tenantId,
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
