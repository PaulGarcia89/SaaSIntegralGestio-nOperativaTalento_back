import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { AutomationService } from '../automation/automation.service';
import { ListWorkflowMasterDto } from './dto/list-workflow-master.dto';

const workflowMasterInclude = {
  branch: true,
  employee: true,
  steps: {
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MasterWorkflowInclude;

@Injectable()
export class WorkflowMasterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly automationService: AutomationService,
  ) {}

  async findAll(actor: JwtPayload, query: ListWorkflowMasterDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.MasterWorkflowWhereInput = {
      tenantId: actor.tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...(query.workflowType ? { workflowType: query.workflowType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.slaStatus ? { slaStatus: query.slaStatus } : {}),
      ...(query.currentStage ? { currentStageKey: query.currentStage as never } : {}),
      ...this.buildBranchScope(actor),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.masterWorkflow.findMany({
        where,
        include: workflowMasterInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.masterWorkflow.count({ where }),
    ]);

    return {
      data: items.map((item) => this.automationService.buildWorkflowMasterCard(item)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findCurrentByEmployee(actor: JwtPayload, employeeId: string) {
    const workflow = await this.prisma.masterWorkflow.findFirst({
      where: {
        tenantId: actor.tenantId,
        employeeId,
        ...this.buildBranchScope(actor),
      },
      include: workflowMasterInclude,
      orderBy: [{ completedAt: 'asc' }, { updatedAt: 'desc' }],
    });

    if (!workflow) {
      return null;
    }

    return this.automationService.buildWorkflowMasterCard(workflow);
  }

  private buildBranchScope(actor: JwtPayload): Prisma.MasterWorkflowWhereInput {
    if (actor.isSuperAdmin || actor.roleScope === 'tenant_admin') {
      return {};
    }

    if (actor.allowedBranchIds?.length) {
      return { branchId: { in: actor.allowedBranchIds } };
    }

    return actor.activeBranchId ? { branchId: actor.activeBranchId } : {};
  }
}
