import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessTaskStatus,
  AccessTaskType,
  EmployeeStatus,
  InventoryAssignmentStatus,
  InventoryRecoveryStatus,
  OnboardingTaskType,
  OperationalEventType,
  Prisma,
  WorkflowOwnerType,
  WorkflowBlockerSeverity,
  WorkflowRiskStatus,
  WorkflowStageKey,
  ProductivityReviewStatus,
  ProductivityReviewType,
  SignaturePackageStatus,
  SignatureParticipantStatus,
  WorkflowSourceModule,
  WorkflowStatus,
  WorkflowStepType,
  WorkflowTaskStatus,
  WorkflowType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateBranchTransferWorkflowDto } from './dto/create-branch-transfer-workflow.dto';
import { CreateHiringWorkflowDto } from './dto/create-hiring-workflow.dto';
import { CreateOffboardingWorkflowDto } from './dto/create-offboarding-workflow.dto';
import { AddWorkflowEventDto } from './dto/add-workflow-event.dto';
import { ListWorkflowsDto } from './dto/list-workflows.dto';
import { UpdateWorkflowStageDto } from './dto/update-workflow-stage.dto';
import { UpdateWorkflowStepProgressDto } from './dto/update-workflow-step-progress.dto';
import { UpdateWorkflowStepStatusDto } from './dto/update-workflow-step-status.dto';
import { WorkflowActionDto } from './dto/workflow-action.dto';

const workflowInclude = {
  branch: true,
  employee: true,
  candidate: true,
  steps: {
    orderBy: { createdAt: 'asc' },
  },
  onboardingFlow: {
    include: {
      tasks: {
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  signaturePackages: {
    include: {
      participants: true,
    },
  },
  inventoryAssignments: true,
  inventoryRecoveries: true,
  workflowTrainingAssignments: true,
  accessTasks: true,
  productivityReviews: true,
  operationalEvents: {
    orderBy: { occurredAt: 'desc' },
  },
  blockers: {
    where: { resolvedAt: null },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.MasterWorkflowInclude;

type WorkflowWithRelations = Prisma.MasterWorkflowGetPayload<{
  include: typeof workflowInclude;
}>;

type TxClient = Prisma.TransactionClient;

const workflowStepOrder: Record<WorkflowType, WorkflowStepType[]> = {
  [WorkflowType.HIRING]: [
    WorkflowStepType.CANDIDACY,
    WorkflowStepType.HIRING,
    WorkflowStepType.ONBOARDING,
    WorkflowStepType.TRAINING,
    WorkflowStepType.OPERATION,
    WorkflowStepType.ADMIN_COMPLIANCE,
  ],
  [WorkflowType.BRANCH_TRANSFER]: [
    WorkflowStepType.ASSET_ASSIGNMENT,
    WorkflowStepType.TRAINING_ACTIVATION,
    WorkflowStepType.ACCESS_PROVISIONING,
    WorkflowStepType.PRODUCTIVITY_REVIEW,
  ],
  [WorkflowType.OFFBOARDING]: [
    WorkflowStepType.ASSET_RECOVERY,
    WorkflowStepType.ACCESS_CLOSURE,
    WorkflowStepType.ARCHIVE_RECORD,
  ],
};

const terminalWorkflowStepStatuses = new Set<WorkflowTaskStatus>([
  WorkflowTaskStatus.COMPLETED,
  WorkflowTaskStatus.CANCELLED,
]);

const hiringStageDefinitions: Array<{
  stageKey: WorkflowStageKey;
  stepType: WorkflowStepType;
  title: string;
  detail: string;
  ownerLabel: string;
  slaLabel: string;
  dueDays: number | null;
}> = [
  {
    stageKey: WorkflowStageKey.CANDIDACY,
    stepType: WorkflowStepType.CANDIDACY,
    title: 'Candidatura',
    detail: 'La candidatura y la evaluación ATS fueron completadas.',
    ownerLabel: 'ATS / Reclutamiento',
    slaLabel: 'on_time',
    dueDays: null,
  },
  {
    stageKey: WorkflowStageKey.HIRING,
    stepType: WorkflowStepType.HIRING,
    title: 'Contratación',
    detail: 'La decisión de contratación y la alta inicial quedaron registradas.',
    ownerLabel: 'RRHH',
    slaLabel: 'on_time',
    dueDays: null,
  },
  {
    stageKey: WorkflowStageKey.ONBOARDING,
    stepType: WorkflowStepType.ONBOARDING,
    title: 'Onboarding',
    detail: 'Documentos, firma y preparación de ingreso.',
    ownerLabel: 'Onboarding',
    slaLabel: 'at_risk',
    dueDays: 3,
  },
  {
    stageKey: WorkflowStageKey.TRAINING,
    stepType: WorkflowStepType.TRAINING,
    title: 'Formación',
    detail: 'Activación y finalización de formación inicial.',
    ownerLabel: 'Training',
    slaLabel: 'at_risk',
    dueDays: 7,
  },
  {
    stageKey: WorkflowStageKey.OPERATION,
    stepType: WorkflowStepType.OPERATION,
    title: 'Operación',
    detail: 'Handoff operativo, activos y validación del supervisor.',
    ownerLabel: 'Operaciones',
    slaLabel: 'at_risk',
    dueDays: 10,
  },
  {
    stageKey: WorkflowStageKey.ADMIN_COMPLIANCE,
    stepType: WorkflowStepType.ADMIN_COMPLIANCE,
    title: 'Administración y cumplimiento',
    detail: 'Accesos, cumplimiento y cierre administrativo.',
    ownerLabel: 'Admin / Compliance',
    slaLabel: 'at_risk',
    dueDays: 14,
  },
];

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async createHiringWorkflow(tenantId: string, actor: JwtPayload, dto: CreateHiringWorkflowDto) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const branch = await this.assertBranchBelongsToTenant(tx, dto.branchId, tenantId);
      const application = dto.applicationId
        ? await tx.vacancyApplication.findFirst({
            where: { id: dto.applicationId, tenantId },
            include: { candidate: true },
          })
        : null;

      const candidate =
        application?.candidate ??
        (dto.candidateId
          ? await tx.candidate.findFirst({
              where: { id: dto.candidateId, tenantId },
            })
          : null);

      if (!candidate) {
        throw new NotFoundException('Candidate not found for hiring workflow');
      }

      const employeeName = dto.employeeName ?? candidate.fullName;
      const employeeEmail = dto.employeeEmail ?? candidate.email;

      let employee = await tx.employee.findFirst({
        where: {
          tenantId,
          email: employeeEmail,
        },
      });

      if (!employee) {
        employee = await tx.employee.create({
          data: {
            tenantId,
            name: employeeName,
            email: employeeEmail,
            status: EmployeeStatus.ACTIVE,
          },
        });

        await tx.employeeBranch.create({
          data: {
            tenantId,
            employeeId: employee.id,
            branchId: branch.id,
            role: 'New hire',
            isPrimary: true,
          },
        });
      }

      const workflow = await tx.masterWorkflow.create({
        data: {
          tenantId,
          branchId: branch.id,
          employeeId: employee.id,
          candidateId: candidate.id,
          workflowType: WorkflowType.HIRING,
          triggeredByUserId: actor.sub,
          sourceModule: dto.sourceModule ?? WorkflowSourceModule.ATS,
          metadata: this.toJson({
            ...(dto.metadata ?? {}),
            applicationId: application?.id ?? null,
          }),
        },
      });

      await this.createDefaultSteps(tx, workflow.id, tenantId, branch.id, WorkflowType.HIRING);
      await this.markInitialHiringStagesComplete(tx, workflow.id);

      const onboardingFlow = await tx.onboardingFlow.create({
        data: {
          tenantId,
          branchId: branch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          candidateId: candidate.id,
          metadata: this.toJson({ source: 'hiring' }),
        },
      });

      await tx.onboardingTask.createMany({
        data: [
          {
            tenantId,
            branchId: branch.id,
            workflowId: workflow.id,
            onboardingFlowId: onboardingFlow.id,
            employeeId: employee.id,
            taskType: OnboardingTaskType.DOCUMENT_COLLECTION,
            title: 'Recopilar documentos de ingreso',
          },
          {
            tenantId,
            branchId: branch.id,
            workflowId: workflow.id,
            onboardingFlowId: onboardingFlow.id,
            employeeId: employee.id,
            taskType: OnboardingTaskType.HR_CHECKLIST,
            title: 'Completar checklist de RRHH',
          },
          {
            tenantId,
            branchId: branch.id,
            workflowId: workflow.id,
            onboardingFlowId: onboardingFlow.id,
            employeeId: employee.id,
            taskType: OnboardingTaskType.MANAGER_CHECKLIST,
            title: 'Completar checklist del manager',
          },
        ],
      });

      await tx.hiringFlow.create({
        data: {
          tenantId,
          branchId: branch.id,
          workflowId: workflow.id,
          candidateId: candidate.id,
          employeeId: employee.id,
          applicationId: application?.id,
          metadata: this.toJson(dto.metadata),
        },
      });

      await tx.signaturePackage.create({
        data: {
          tenantId,
          branchId: branch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          title: `Firma de ingreso - ${employee.name}`,
          status: SignaturePackageStatus.PENDING,
          participants: {
            create: [
              {
                tenantId,
                email: employee.email,
                fullName: employee.name,
                roleLabel: 'Empleado',
              },
            ],
          },
        },
      });

      await tx.inventoryAssignment.create({
        data: {
          tenantId,
          branchId: branch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          status: InventoryAssignmentStatus.PENDING,
        },
      });

      await tx.workflowTrainingAssignment.create({
        data: {
          tenantId,
          branchId: branch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
        },
      });

      await tx.accessTask.create({
        data: {
          tenantId,
          branchId: branch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          taskType: AccessTaskType.PROVISION,
        },
      });

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: branch.id,
        workflowId: workflow.id,
        actorUserId: actor.sub,
        eventType: OperationalEventType.HIRING_INITIATED,
        title: 'Flujo maestro de contratación iniciado',
        description: `Hiring workflow created for ${employee.name}`,
        correlationId,
        payload: { employeeId: employee.id, candidateId: candidate.id, applicationId: application?.id ?? null },
      });

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: branch.id,
        workflowId: workflow.id,
        actorUserId: actor.sub,
        eventType: OperationalEventType.CANDIDACY_COMPLETED,
        title: 'Candidatura completada',
        description: `La candidatura quedó cerrada para ${candidate.fullName}`,
        correlationId,
        payload: { candidateId: candidate.id, applicationId: application?.id ?? null },
      });

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: branch.id,
        workflowId: workflow.id,
        actorUserId: actor.sub,
        eventType: OperationalEventType.HIRING_COMPLETED,
        title: 'Contratación completada',
        description: `La contratación quedó registrada para ${employee.name}`,
        correlationId,
        payload: { employeeId: employee.id },
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId: branch.id,
        userId: actor.sub,
        email: actor.email,
        entityType: 'master_workflow',
        entityId: workflow.id,
        action: 'HIRE_CANDIDATE',
        route: '/api/workflows/hiring',
        method: 'POST',
        statusCode: 201,
        correlationId,
        after: {
          workflowId: workflow.id,
          employeeId: employee.id,
          candidateId: candidate.id,
        },
      });

      await this.recomputeMasterWorkflowInTx(tx, workflow.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, workflow.id, tenantId);
    });

    await this.assertWorkflowAccess(workflow, actor);
    return this.serializeWorkflow(workflow);
  }

  async createBranchTransferWorkflow(
    tenantId: string,
    actor: JwtPayload,
    dto: CreateBranchTransferWorkflowDto,
  ) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const employee = await this.assertEmployeeBelongsToTenant(tx, dto.employeeId, tenantId);
      const targetBranch = await this.assertBranchBelongsToTenant(tx, dto.targetBranchId, tenantId);

      const currentPrimary = await tx.employeeBranch.findFirst({
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

      if (currentPrimary.branchId === targetBranch.id) {
        throw new BadRequestException('Target branch must differ from current branch');
      }

      await tx.employeeBranch.update({
        where: { id: currentPrimary.id },
        data: { releasedAt: new Date() },
      });

      await tx.employeeBranch.create({
        data: {
          tenantId,
          employeeId: employee.id,
          branchId: targetBranch.id,
          role: dto.role,
          isPrimary: true,
        },
      });

      const workflow = await tx.masterWorkflow.create({
        data: {
          tenantId,
          branchId: targetBranch.id,
          employeeId: employee.id,
          workflowType: WorkflowType.BRANCH_TRANSFER,
          triggeredByUserId: actor.sub,
          sourceModule: dto.sourceModule ?? WorkflowSourceModule.HR,
          metadata: this.toJson({
            ...(dto.metadata ?? {}),
            previousBranchId: currentPrimary.branchId,
            targetBranchId: targetBranch.id,
            role: dto.role,
          }),
        },
      });

      await this.createDefaultSteps(tx, workflow.id, tenantId, targetBranch.id, WorkflowType.BRANCH_TRANSFER);

      await tx.inventoryAssignment.create({
        data: {
          tenantId,
          branchId: targetBranch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          status: InventoryAssignmentStatus.PENDING,
          metadata: this.toJson({ reassignment: true }),
        },
      });

      await tx.workflowTrainingAssignment.create({
        data: {
          tenantId,
          branchId: targetBranch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          metadata: this.toJson({ revalidation: true }),
        },
      });

      await tx.accessTask.create({
        data: {
          tenantId,
          branchId: targetBranch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          taskType: AccessTaskType.UPDATE,
        },
      });

      await tx.productivityReview.create({
        data: {
          tenantId,
          branchId: targetBranch.id,
          workflowId: workflow.id,
          employeeId: employee.id,
          createdByUserId: actor.sub,
          reviewType: ProductivityReviewType.BRANCH_TRANSFER,
          status: ProductivityReviewStatus.PENDING,
        },
      });

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: targetBranch.id,
        workflowId: workflow.id,
        actorUserId: actor.sub,
        eventType: OperationalEventType.BRANCH_TRANSFER_INITIATED,
        description: `Branch transfer workflow created for ${employee.name}`,
        correlationId,
        payload: {
          employeeId: employee.id,
          previousBranchId: currentPrimary.branchId,
          targetBranchId: targetBranch.id,
          role: dto.role,
        },
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId: targetBranch.id,
        userId: actor.sub,
        email: actor.email,
        entityType: 'employee',
        entityId: employee.id,
        action: 'TRANSFER_EMPLOYEE_BRANCH',
        route: '/api/workflows/branch-transfer',
        method: 'POST',
        statusCode: 201,
        correlationId,
        before: { branchId: currentPrimary.branchId },
        after: { branchId: targetBranch.id, role: dto.role, workflowId: workflow.id },
      });

      await this.recomputeMasterWorkflowInTx(tx, workflow.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, workflow.id, tenantId);
    });

    await this.assertWorkflowAccess(workflow, actor);
    return this.serializeWorkflow(workflow);
  }

  async createOffboardingWorkflow(tenantId: string, actor: JwtPayload, dto: CreateOffboardingWorkflowDto) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const employee = await this.assertEmployeeBelongsToTenant(tx, dto.employeeId, tenantId);
      const activeBranch = await this.resolveEmployeePrimaryBranch(tx, employee.id, tenantId);
      const branchId = dto.branchId ?? activeBranch?.branchId;

      if (!branchId) {
        throw new BadRequestException('Employee does not have an active branch for offboarding');
      }

      await tx.employee.update({
        where: { id: employee.id },
        data: { status: EmployeeStatus.TERMINATED },
      });

      const workflow = await tx.masterWorkflow.create({
        data: {
          tenantId,
          branchId,
          employeeId: employee.id,
          workflowType: WorkflowType.OFFBOARDING,
          triggeredByUserId: actor.sub,
          sourceModule: dto.sourceModule ?? WorkflowSourceModule.HR,
          metadata: this.toJson(dto.metadata),
        },
      });

      await this.createDefaultSteps(tx, workflow.id, tenantId, branchId, WorkflowType.OFFBOARDING);

      await tx.inventoryRecovery.create({
        data: {
          tenantId,
          branchId,
          workflowId: workflow.id,
          employeeId: employee.id,
        },
      });

      await tx.accessTask.create({
        data: {
          tenantId,
          branchId,
          workflowId: workflow.id,
          employeeId: employee.id,
          taskType: AccessTaskType.CLOSE,
        },
      });

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId,
        workflowId: workflow.id,
        actorUserId: actor.sub,
        eventType: OperationalEventType.OFFBOARDING_INITIATED,
        description: `Offboarding workflow created for ${employee.name}`,
        correlationId,
        payload: { employeeId: employee.id },
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId,
        userId: actor.sub,
        email: actor.email,
        entityType: 'employee',
        entityId: employee.id,
        action: 'START_OFFBOARDING',
        route: '/api/workflows/offboarding',
        method: 'POST',
        statusCode: 201,
        correlationId,
        before: { status: employee.status },
        after: { status: EmployeeStatus.TERMINATED, workflowId: workflow.id },
      });

      await this.recomputeMasterWorkflowInTx(tx, workflow.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, workflow.id, tenantId);
    });

    await this.assertWorkflowAccess(workflow, actor);
    return this.serializeWorkflow(workflow);
  }

  async findAll(tenantId: string, actor: JwtPayload, query: ListWorkflowsDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.MasterWorkflowWhereInput = {
      tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.workflowType ? { workflowType: query.workflowType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.currentStageKey ? { currentStageKey: query.currentStageKey } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.candidateId ? { candidateId: query.candidateId } : {}),
      ...this.buildBranchScopeWhere(actor),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.masterWorkflow.findMany({
        where,
        include: workflowInclude,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.masterWorkflow.count({ where }),
    ]);

    return {
      data: items.map((item) => this.serializeWorkflow(item)),
      meta: {
        total,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.ceil(total / pagination.pageSize),
      },
    };
  }

  async findOne(id: string, tenantId: string, actor: JwtPayload) {
    const workflow = await this.loadWorkflowOrThrow(this.prisma, id, tenantId);
    await this.assertWorkflowAccess(workflow, actor);
    return this.serializeWorkflow(workflow);
  }

  async findCurrentByEmployee(employeeId: string, tenantId: string, actor: JwtPayload) {
    const workflow = await this.prisma.masterWorkflow.findFirst({
      where: {
        tenantId,
        employeeId,
        ...this.buildBranchScopeWhere(actor),
      },
      include: workflowInclude,
      orderBy: [
        { completedAt: 'asc' },
        { updatedAt: 'desc' },
      ],
    });

    if (!workflow) {
      throw new NotFoundException('Current workflow not found for employee');
    }

    await this.assertWorkflowAccess(workflow, actor);
    return this.serializeMasterCard(workflow);
  }

  async getMasterCard(id: string, tenantId: string, actor: JwtPayload) {
    const workflow = await this.loadWorkflowOrThrow(this.prisma, id, tenantId);
    await this.assertWorkflowAccess(workflow, actor);
    return this.serializeMasterCard(workflow);
  }

  async getTimeline(id: string, tenantId: string, actor: JwtPayload) {
    const workflow = await this.loadWorkflowOrThrow(this.prisma, id, tenantId);
    await this.assertWorkflowAccess(workflow, actor);

    return workflow.operationalEvents.map((event) => ({
      id: event.id,
      type: event.eventType,
      title: event.title ?? this.humanizeEventType(event.eventType),
      description: event.description,
      createdBy: event.actorUserId,
      createdAt: event.occurredAt,
      metadata: event.payload,
    }));
  }

  async getBlockers(id: string, tenantId: string, actor: JwtPayload) {
    const workflow = await this.loadWorkflowOrThrow(this.prisma, id, tenantId);
    await this.assertWorkflowAccess(workflow, actor);

    return workflow.blockers.map((blocker) => ({
      id: blocker.id,
      stepKey: blocker.stepKey,
      message: blocker.message,
      severity: blocker.severity.toLowerCase(),
      createdAt: blocker.createdAt,
    }));
  }

  async addWorkflowEvent(id: string, tenantId: string, actor: JwtPayload, dto: AddWorkflowEventDto) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const current = await this.loadWorkflowOrThrow(tx, id, tenantId);
      await this.assertWorkflowAccess(current, actor);

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: current.branchId,
        workflowId: current.id,
        actorUserId: actor.sub,
        eventType: OperationalEventType.WORKFLOW_NOTE_ADDED,
        title: dto.title,
        description: dto.description,
        correlationId,
        payload: dto.metadata ?? {},
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId: current.branchId,
        userId: actor.sub,
        email: actor.email,
        entityType: 'master_workflow',
        entityId: current.id,
        action: 'ADD_WORKFLOW_EVENT',
        route: `/api/workflows/${current.id}/events`,
        method: 'POST',
        statusCode: 201,
        correlationId,
        after: {
          title: dto.title,
          description: dto.description,
        },
      });

      return this.loadWorkflowOrThrow(tx, current.id, tenantId);
    });

    return this.getTimeline(workflow.id, tenantId, actor);
  }

  async startStage(
    id: string,
    stageKey: WorkflowStageKey,
    tenantId: string,
    actor: JwtPayload,
    dto: UpdateWorkflowStageDto,
  ) {
    return this.updateStageLifecycle(id, stageKey, tenantId, actor, dto, 'start');
  }

  async completeStage(
    id: string,
    stageKey: WorkflowStageKey,
    tenantId: string,
    actor: JwtPayload,
    dto: UpdateWorkflowStageDto,
  ) {
    return this.updateStageLifecycle(id, stageKey, tenantId, actor, dto, 'complete');
  }

  async updateWorkflowStepStatus(
    stepId: string,
    tenantId: string,
    actor: JwtPayload,
    dto: UpdateWorkflowStepStatusDto,
  ) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const step = await this.findWorkflowStepOrThrow(tx, stepId, tenantId);
      const parent = await this.loadWorkflowOrThrow(tx, step.workflowId, tenantId);
      await this.assertWorkflowAccess(parent, actor);

      const before = {
        status: step.status,
        progressPercent: step.progressPercent,
        blockingReason: step.blockingReason,
      };

      await tx.workflowStep.update({
        where: { id: step.id },
        data: {
          status: dto.status,
          progressPercent:
            dto.progressPercent ?? (dto.status === WorkflowTaskStatus.COMPLETED ? 100 : step.progressPercent),
          blockingReason: dto.blockingReason ?? null,
          completedAt:
            dto.completedAt ??
            (dto.status === WorkflowTaskStatus.COMPLETED ? new Date() : null),
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      await this.syncStepToSubentity(tx, parent.id, step.stepType, dto.status, {
        progressPercent: dto.progressPercent,
        blockingReason: dto.blockingReason,
        metadata: dto.metadata,
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId: parent.branchId,
        userId: actor.sub,
        email: actor.email,
        entityType: 'workflow_step',
        entityId: step.id,
        action: 'UPDATE_WORKFLOW_STEP_STATUS',
        route: `/api/workflow-steps/${step.id}/status`,
        method: 'PATCH',
        statusCode: 200,
        correlationId,
        before,
        after: {
          status: dto.status,
          progressPercent: dto.progressPercent ?? step.progressPercent,
          blockingReason: dto.blockingReason ?? null,
        },
      });

      await this.recomputeMasterWorkflowInTx(tx, parent.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, parent.id, tenantId);
    });

    return this.serializeWorkflow(workflow);
  }

  async updateWorkflowStepProgress(
    stepId: string,
    tenantId: string,
    actor: JwtPayload,
    dto: UpdateWorkflowStepProgressDto,
  ) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const step = await this.findWorkflowStepOrThrow(tx, stepId, tenantId);
      const parent = await this.loadWorkflowOrThrow(tx, step.workflowId, tenantId);
      await this.assertWorkflowAccess(parent, actor);

      await tx.workflowStep.update({
        where: { id: step.id },
        data: {
          progressPercent: dto.progressPercent,
          status:
            dto.progressPercent >= 100
              ? WorkflowTaskStatus.COMPLETED
              : dto.progressPercent > 0
                ? WorkflowTaskStatus.IN_PROGRESS
                : WorkflowTaskStatus.PENDING,
          completedAt: dto.progressPercent >= 100 ? new Date() : null,
        },
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId: parent.branchId,
        userId: actor.sub,
        email: actor.email,
        entityType: 'workflow_step',
        entityId: step.id,
        action: 'UPDATE_WORKFLOW_STEP_PROGRESS',
        route: `/api/workflow-steps/${step.id}/progress`,
        method: 'PATCH',
        statusCode: 200,
        correlationId,
        before: { progressPercent: step.progressPercent, status: step.status },
        after: {
          progressPercent: dto.progressPercent,
          status:
            dto.progressPercent >= 100
              ? WorkflowTaskStatus.COMPLETED
              : dto.progressPercent > 0
                ? WorkflowTaskStatus.IN_PROGRESS
                : WorkflowTaskStatus.PENDING,
        },
      });

      await this.recomputeMasterWorkflowInTx(tx, parent.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, parent.id, tenantId);
    });

    return this.serializeWorkflow(workflow);
  }

  async completeOnboarding(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.ONBOARDING, async (tx, workflow) => {
      await tx.onboardingFlow.updateMany({
        where: { workflowId: workflow.id },
        data: {
          status: WorkflowTaskStatus.COMPLETED,
          completedAt: new Date(),
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      await tx.onboardingTask.updateMany({
        where: { workflowId: workflow.id },
        data: {
          status: WorkflowTaskStatus.COMPLETED,
          progressPercent: 100,
          completedAt: new Date(),
        },
      });

      await this.updateSingleStep(tx, workflow.id, WorkflowStepType.DOCUMENTS, WorkflowTaskStatus.COMPLETED, 100);
      return OperationalEventType.ONBOARDING_COMPLETED;
    }, dto);
  }

  async completeSignature(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.SIGNATURES, async (tx, workflow) => {
      const signaturePackage = await tx.signaturePackage.findFirst({
        where: { workflowId: workflow.id },
      });

      if (!signaturePackage) {
        throw new NotFoundException('Signature package not found');
      }

      await tx.signaturePackage.update({
        where: { id: signaturePackage.id },
        data: {
          status: SignaturePackageStatus.COMPLETED,
          signedAt: new Date(),
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      await tx.signatureParticipant.updateMany({
        where: { packageId: signaturePackage.id },
        data: {
          status: SignatureParticipantStatus.SIGNED,
          signedAt: new Date(),
        },
      });

      return OperationalEventType.SIGNATURE_COMPLETED;
    }, dto);
  }

  async assignAsset(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.ASSET_ASSIGNMENT, async (tx, workflow) => {
      const assignment = await tx.inventoryAssignment.findFirst({
        where: { workflowId: workflow.id },
      });

      if (!assignment) {
        throw new NotFoundException('Inventory assignment not found');
      }

      await tx.inventoryAssignment.update({
        where: { id: assignment.id },
        data: {
          itemId: dto.itemId ?? assignment.itemId,
          quantity: dto.quantity ?? assignment.quantity,
          status: InventoryAssignmentStatus.ASSIGNED,
          assignedAt: new Date(),
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      return OperationalEventType.ASSET_ASSIGNED;
    }, dto);
  }

  async activateTraining(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.TRAINING_ACTIVATION, async (tx, workflow) => {
      const trainingAssignment = await tx.workflowTrainingAssignment.findFirst({
        where: { workflowId: workflow.id },
      });

      if (!trainingAssignment) {
        throw new NotFoundException('Workflow training assignment not found');
      }

      await tx.workflowTrainingAssignment.update({
        where: { id: trainingAssignment.id },
        data: {
          courseId: dto.courseId ?? trainingAssignment.courseId,
          curriculumId: dto.curriculumId ?? trainingAssignment.curriculumId,
          status: WorkflowTaskStatus.COMPLETED,
          progressPercent: 100,
          activatedAt: new Date(),
          completedAt: new Date(),
          dueDate: dto.dueDate ?? trainingAssignment.dueDate,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      return OperationalEventType.TRAINING_ACTIVATED;
    }, dto);
  }

  async provisionAccess(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.ACCESS_PROVISIONING, async (tx, workflow) => {
      const accessTask = await tx.accessTask.findFirst({
        where: {
          workflowId: workflow.id,
          taskType: { in: [AccessTaskType.PROVISION, AccessTaskType.UPDATE] },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!accessTask) {
        throw new NotFoundException('Access provisioning task not found');
      }

      await tx.accessTask.update({
        where: { id: accessTask.id },
        data: {
          status: AccessTaskStatus.PROVISIONED,
          completedAt: new Date(),
          permissions: dto.metadata
            ? this.toJson(dto.metadata)
            : accessTask.permissions
              ? (accessTask.permissions as Prisma.InputJsonValue)
              : undefined,
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      return OperationalEventType.ACCESS_PROVISIONED;
    }, dto);
  }

  async recoverAsset(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.ASSET_RECOVERY, async (tx, workflow) => {
      const recovery = await tx.inventoryRecovery.findFirst({
        where: { workflowId: workflow.id },
      });

      if (!recovery) {
        throw new NotFoundException('Inventory recovery not found');
      }

      await tx.inventoryRecovery.update({
        where: { id: recovery.id },
        data: {
          itemId: dto.itemId ?? recovery.itemId,
          status: InventoryRecoveryStatus.RECOVERED,
          recoveredAt: new Date(),
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      return OperationalEventType.ASSET_RECOVERED;
    }, dto);
  }

  async closeAccess(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.ACCESS_CLOSURE, async (tx, workflow) => {
      const accessTask = await tx.accessTask.findFirst({
        where: {
          workflowId: workflow.id,
          taskType: AccessTaskType.CLOSE,
        },
      });

      if (!accessTask) {
        throw new NotFoundException('Access closure task not found');
      }

      await tx.accessTask.update({
        where: { id: accessTask.id },
        data: {
          status: AccessTaskStatus.CLOSED,
          completedAt: new Date(),
          metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        },
      });

      return OperationalEventType.ACCESS_CLOSED;
    }, dto);
  }

  async archiveRecord(id: string, tenantId: string, actor: JwtPayload, dto: WorkflowActionDto) {
    return this.executeWorkflowAction(id, tenantId, actor, WorkflowStepType.ARCHIVE_RECORD, async (_tx, _workflow) => {
      return OperationalEventType.RECORD_ARCHIVED;
    }, dto);
  }

  async recomputeMasterWorkflow(id: string, tenantId: string, actor: JwtPayload) {
    const workflow = await this.loadWorkflowOrThrow(this.prisma, id, tenantId);
    await this.assertWorkflowAccess(workflow, actor);

    return this.prisma.$transaction(async (tx) => {
      await this.recomputeMasterWorkflowInTx(tx, id, randomUUID(), actor);
      const updated = await this.loadWorkflowOrThrow(tx, id, tenantId);
      return this.serializeWorkflow(updated);
    });
  }

  private async updateStageLifecycle(
    workflowId: string,
    stageKey: WorkflowStageKey,
    tenantId: string,
    actor: JwtPayload,
    dto: UpdateWorkflowStageDto,
    action: 'start' | 'complete',
  ) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const current = await this.loadWorkflowOrThrow(tx, workflowId, tenantId);
      await this.assertWorkflowAccess(current, actor);
      const step = await this.findWorkflowStepByStageOrThrow(tx, current.id, tenantId, stageKey);

      if (action === 'start') {
        await tx.workflowStep.update({
          where: { id: step.id },
          data: {
            status: WorkflowTaskStatus.IN_PROGRESS,
            startedAt: step.startedAt ?? new Date(),
            detail: dto.detail ?? step.detail,
            ownerLabel: dto.ownerLabel ?? step.ownerLabel,
            dueDate: dto.targetDate ?? step.dueDate,
            riskStatus: this.computeRiskStatus(dto.targetDate ?? step.dueDate, WorkflowTaskStatus.IN_PROGRESS),
            metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
          },
        });

        await this.handleBlockerState(tx, current, step, actor, dto, correlationId, false);
        await this.createOperationalEvent(tx, {
          tenantId,
          branchId: current.branchId,
          workflowId: current.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.WORKFLOW_STEP_STARTED,
          title: `Etapa iniciada: ${this.humanizeStageKey(stageKey)}`,
          description: dto.detail ?? step.detail ?? undefined,
          correlationId,
          payload: { stepKey: stageKey, action: 'start' },
        });
      } else {
        await this.applyStageCompletion(tx, current, step, dto, actor, correlationId);
        await this.handleBlockerState(tx, current, step, actor, dto, correlationId, true);
      }

      await this.createAuditLog(tx, {
        tenantId,
        branchId: current.branchId,
        userId: actor.sub,
        email: actor.email,
        entityType: 'workflow_step',
        entityId: step.id,
        action: action === 'start' ? 'START_WORKFLOW_STAGE' : 'COMPLETE_WORKFLOW_STAGE',
        route: `/api/workflows/${current.id}/steps/${stageKey.toLowerCase()}/${action}`,
        method: 'PATCH',
        statusCode: 200,
        correlationId,
        before: {
          status: step.status,
          riskStatus: step.riskStatus,
          dueDate: step.dueDate,
        },
        after: {
          status: action === 'start' ? WorkflowTaskStatus.IN_PROGRESS : WorkflowTaskStatus.COMPLETED,
          stepKey: stageKey,
          detail: dto.detail ?? step.detail,
          ownerLabel: dto.ownerLabel ?? step.ownerLabel,
          dueDate: dto.targetDate ?? step.dueDate,
        },
      });

      await this.recomputeMasterWorkflowInTx(tx, current.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, current.id, tenantId);
    });

    return this.serializeMasterCard(workflow);
  }

  private async executeWorkflowAction(
    workflowId: string,
    tenantId: string,
    actor: JwtPayload,
    stepType: WorkflowStepType,
    action: (tx: TxClient, workflow: WorkflowWithRelations) => Promise<OperationalEventType>,
    dto: WorkflowActionDto,
  ) {
    const correlationId = randomUUID();

    const workflow = await this.prisma.$transaction(async (tx) => {
      const current = await this.loadWorkflowOrThrow(tx, workflowId, tenantId);
      await this.assertWorkflowAccess(current, actor);

      const eventType = await action(tx, current);
      await this.updateSingleStep(tx, current.id, stepType, WorkflowTaskStatus.COMPLETED, 100);

      await this.createOperationalEvent(tx, {
        tenantId,
        branchId: current.branchId,
        workflowId: current.id,
        actorUserId: actor.sub,
        eventType,
        correlationId,
        payload: dto.metadata ?? {},
      });

      await this.createAuditLog(tx, {
        tenantId,
        branchId: current.branchId,
        userId: actor.sub,
        email: actor.email,
        entityType: 'master_workflow',
        entityId: current.id,
        action: eventType,
        route: `/api/workflows/${current.id}/${this.toActionRoute(stepType)}`,
        method: 'POST',
        statusCode: 200,
        correlationId,
        after: {
          stepType,
          metadata: dto.metadata ?? null,
        },
      });

      await this.recomputeMasterWorkflowInTx(tx, current.id, correlationId, actor);
      return this.loadWorkflowOrThrow(tx, current.id, tenantId);
    });

    return this.serializeWorkflow(workflow);
  }

  private async createDefaultSteps(
    tx: TxClient,
    workflowId: string,
    tenantId: string,
    branchId: string,
    workflowType: WorkflowType,
  ) {
    const baseDate = new Date();
    const steps =
      workflowType === WorkflowType.HIRING
        ? hiringStageDefinitions.map((stage) => ({
            workflowId,
            tenantId,
            branchId,
            stageKey: stage.stageKey,
            stepType: stage.stepType,
            title: stage.title,
            detail: stage.detail,
            ownerType: this.resolveOwnerType(stage.stepType),
            ownerLabel: stage.ownerLabel,
            slaLabel: stage.slaLabel,
            dueDate: stage.dueDays === null ? null : this.addDays(baseDate, stage.dueDays),
            riskStatus: WorkflowRiskStatus.ON_TIME,
            isCritical: true,
          }))
        : workflowStepOrder[workflowType].map((stepType) => ({
            workflowId,
            tenantId,
            branchId,
            stageKey: this.resolveStageKey(stepType),
            stepType,
            title: this.humanizeStageKey(this.resolveStageKey(stepType)),
            detail: this.buildDefaultStageDetail(this.resolveStageKey(stepType)),
            ownerType: this.resolveOwnerType(stepType),
            ownerLabel: this.resolveOwnerLabel(stepType),
            slaLabel: 'on_time',
            dueDate: null,
            riskStatus: WorkflowRiskStatus.ON_TIME,
            isCritical: stepType !== WorkflowStepType.PRODUCTIVITY_REVIEW,
          }));

    await tx.workflowStep.createMany({ data: steps });
  }

  private async markInitialHiringStagesComplete(tx: TxClient, workflowId: string) {
    const completedAt = new Date();
    await tx.workflowStep.updateMany({
      where: {
        workflowId,
        stageKey: { in: [WorkflowStageKey.CANDIDACY, WorkflowStageKey.HIRING] },
      },
      data: {
        status: WorkflowTaskStatus.COMPLETED,
        progressPercent: 100,
        startedAt: completedAt,
        completedAt,
        riskStatus: WorkflowRiskStatus.ON_TIME,
      },
    });
  }

  private async recomputeMasterWorkflowInTx(
    tx: TxClient,
    workflowId: string,
    correlationId: string,
    actor: JwtPayload,
  ) {
    const workflow = await tx.masterWorkflow.findUnique({
      where: { id: workflowId },
      include: { steps: true },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const orderedSteps = [...workflow.steps].sort(
      (left, right) =>
        workflowStepOrder[workflow.workflowType].indexOf(left.stepType) -
        workflowStepOrder[workflow.workflowType].indexOf(right.stepType),
    );

    for (const step of orderedSteps) {
      const nextRiskStatus = this.computeRiskStatus(step.dueDate, step.status);
      if (step.riskStatus !== nextRiskStatus) {
        await tx.workflowStep.update({
          where: { id: step.id },
          data: { riskStatus: nextRiskStatus },
        });
        step.riskStatus = nextRiskStatus;
      }
    }

    const progressPercent = orderedSteps.length
      ? Math.round(
          orderedSteps.reduce((total, step) => total + step.progressPercent, 0) / orderedSteps.length,
        )
      : 0;

    const hasBlockedCritical = orderedSteps.some(
      (step) => step.isCritical && step.status === WorkflowTaskStatus.BLOCKED,
    );
    const hasStarted = orderedSteps.some((step) => step.status !== WorkflowTaskStatus.PENDING);
    const allTerminal =
      orderedSteps.length > 0 &&
      orderedSteps.every((step) =>
        terminalWorkflowStepStatuses.has(step.status),
      );

    const status = hasBlockedCritical
      ? WorkflowStatus.BLOCKED
      : allTerminal
        ? WorkflowStatus.COMPLETED
        : hasStarted
          ? WorkflowStatus.IN_PROGRESS
          : WorkflowStatus.PENDING;

    const currentStep = orderedSteps.find(
      (step) => !terminalWorkflowStepStatuses.has(step.status),
    ) ?? null;
    const currentStage = currentStep?.stepType ?? null;

    const before = {
      status: workflow.status,
      progressPercent: workflow.progressPercent,
      currentStage: workflow.currentStage,
    };

    await tx.masterWorkflow.update({
      where: { id: workflowId },
      data: {
        status,
        progressPercent,
        currentStage,
        completedAt: status === WorkflowStatus.COMPLETED ? workflow.completedAt ?? new Date() : null,
        lastComputedAt: new Date(),
      },
    });

    await this.createOperationalEvent(tx, {
      tenantId: workflow.tenantId,
      branchId: workflow.branchId,
      workflowId,
      actorUserId: actor.sub,
      eventType: OperationalEventType.MASTER_WORKFLOW_RECOMPUTED,
      correlationId,
      payload: {
        before,
        after: {
          status,
          progressPercent,
          currentStage,
        },
      },
    });

    await this.createAuditLog(tx, {
      tenantId: workflow.tenantId,
      branchId: workflow.branchId,
      userId: actor.sub,
      email: actor.email,
      entityType: 'master_workflow',
      entityId: workflowId,
      action: 'RECOMPUTE_MASTER_WORKFLOW',
      route: `/api/workflows/${workflowId}/recompute`,
      method: 'PATCH',
      statusCode: 200,
      correlationId,
      before,
      after: {
        status,
        progressPercent,
        currentStage,
      },
    });
  }

  private async syncStepToSubentity(
    tx: TxClient,
    workflowId: string,
    stepType: WorkflowStepType,
    status: WorkflowTaskStatus,
    input: {
      progressPercent?: number;
      blockingReason?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const completedAt = status === WorkflowTaskStatus.COMPLETED ? new Date() : null;
    const progress = input.progressPercent ?? (status === WorkflowTaskStatus.COMPLETED ? 100 : undefined);

    switch (stepType) {
      case WorkflowStepType.ONBOARDING:
        await tx.onboardingFlow.updateMany({
          where: { workflowId },
          data: {
            status,
            completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.DOCUMENTS:
        await tx.onboardingTask.updateMany({
          where: { workflowId },
          data: {
            status,
            progressPercent: progress,
            completedAt,
            blockingReason: input.blockingReason ?? null,
          },
        });
        break;
      case WorkflowStepType.SIGNATURES:
        await tx.signaturePackage.updateMany({
          where: { workflowId },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? SignaturePackageStatus.COMPLETED
                : status === WorkflowTaskStatus.CANCELLED
                  ? SignaturePackageStatus.CANCELLED
                  : SignaturePackageStatus.PENDING,
            signedAt: completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.ASSET_ASSIGNMENT:
        await tx.inventoryAssignment.updateMany({
          where: { workflowId },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? InventoryAssignmentStatus.ASSIGNED
                : status === WorkflowTaskStatus.CANCELLED
                  ? InventoryAssignmentStatus.CANCELLED
                  : InventoryAssignmentStatus.PENDING,
            assignedAt: completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.TRAINING:
      case WorkflowStepType.TRAINING_ACTIVATION:
        await tx.workflowTrainingAssignment.updateMany({
          where: { workflowId },
          data: {
            status,
            progressPercent: progress,
            activatedAt: status === WorkflowTaskStatus.COMPLETED ? new Date() : undefined,
            completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.OPERATION:
        await tx.productivityReview.updateMany({
          where: { workflowId },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? ProductivityReviewStatus.COMPLETED
                : status === WorkflowTaskStatus.BLOCKED
                  ? ProductivityReviewStatus.BLOCKED
                  : ProductivityReviewStatus.PENDING,
            completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.ACCESS_PROVISIONING:
      case WorkflowStepType.ADMIN_COMPLIANCE:
        await tx.accessTask.updateMany({
          where: { workflowId, taskType: { in: [AccessTaskType.PROVISION, AccessTaskType.UPDATE] } },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? AccessTaskStatus.PROVISIONED
                : status === WorkflowTaskStatus.BLOCKED
                  ? AccessTaskStatus.BLOCKED
                  : AccessTaskStatus.PENDING,
            completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.PRODUCTIVITY_REVIEW:
        await tx.productivityReview.updateMany({
          where: { workflowId },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? ProductivityReviewStatus.COMPLETED
                : status === WorkflowTaskStatus.BLOCKED
                  ? ProductivityReviewStatus.BLOCKED
                  : ProductivityReviewStatus.PENDING,
            completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.ASSET_RECOVERY:
        await tx.inventoryRecovery.updateMany({
          where: { workflowId },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? InventoryRecoveryStatus.RECOVERED
                : status === WorkflowTaskStatus.CANCELLED
                  ? InventoryRecoveryStatus.CANCELLED
                  : InventoryRecoveryStatus.PENDING,
            recoveredAt: completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.ACCESS_CLOSURE:
        await tx.accessTask.updateMany({
          where: { workflowId, taskType: AccessTaskType.CLOSE },
          data: {
            status:
              status === WorkflowTaskStatus.COMPLETED
                ? AccessTaskStatus.CLOSED
                : status === WorkflowTaskStatus.BLOCKED
                  ? AccessTaskStatus.BLOCKED
                  : AccessTaskStatus.PENDING,
            completedAt,
            metadata: input.metadata ? this.toJson(input.metadata) : undefined,
          },
        });
        break;
      case WorkflowStepType.ARCHIVE_RECORD:
        break;
    }
  }

  private async applyStageCompletion(
    tx: TxClient,
    workflow: WorkflowWithRelations,
    step: WorkflowWithRelations['steps'][number],
    dto: UpdateWorkflowStageDto,
    actor: JwtPayload,
    correlationId: string,
  ) {
    const now = new Date();
    await tx.workflowStep.update({
      where: { id: step.id },
      data: {
        status: WorkflowTaskStatus.COMPLETED,
        progressPercent: 100,
        startedAt: step.startedAt ?? now,
        completedAt: now,
        detail: dto.detail ?? step.detail,
        ownerLabel: dto.ownerLabel ?? step.ownerLabel,
        dueDate: dto.targetDate ?? step.dueDate,
        riskStatus: WorkflowRiskStatus.ON_TIME,
        metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
        blockingReason: null,
      },
    });

    switch (step.stageKey) {
      case WorkflowStageKey.CANDIDACY:
        await tx.hiringFlow.updateMany({
          where: { workflowId: workflow.id },
          data: { status: WorkflowTaskStatus.COMPLETED, hiredAt: now },
        });
        await this.createOperationalEvent(tx, {
          tenantId: workflow.tenantId,
          branchId: workflow.branchId,
          workflowId: workflow.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.CANDIDACY_COMPLETED,
          title: 'Candidatura completada',
          description: dto.detail ?? 'La etapa de candidatura fue completada.',
          correlationId,
          payload: { stepKey: step.stageKey },
        });
        break;
      case WorkflowStageKey.HIRING:
        await tx.hiringFlow.updateMany({
          where: { workflowId: workflow.id },
          data: { status: WorkflowTaskStatus.COMPLETED, hiredAt: now },
        });
        await this.createOperationalEvent(tx, {
          tenantId: workflow.tenantId,
          branchId: workflow.branchId,
          workflowId: workflow.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.HIRING_COMPLETED,
          title: 'Contratación completada',
          description: dto.detail ?? 'La etapa de contratación fue completada.',
          correlationId,
          payload: { stepKey: step.stageKey },
        });
        break;
      case WorkflowStageKey.ONBOARDING:
        await tx.onboardingFlow.updateMany({
          where: { workflowId: workflow.id },
          data: {
            status: WorkflowTaskStatus.COMPLETED,
            completedAt: now,
            metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
          },
        });
        await tx.onboardingTask.updateMany({
          where: { workflowId: workflow.id },
          data: {
            status: WorkflowTaskStatus.COMPLETED,
            progressPercent: 100,
            completedAt: now,
            blockingReason: null,
          },
        });
        await tx.signaturePackage.updateMany({
          where: { workflowId: workflow.id },
          data: { status: SignaturePackageStatus.COMPLETED, signedAt: now },
        });
        await this.createOperationalEvent(tx, {
          tenantId: workflow.tenantId,
          branchId: workflow.branchId,
          workflowId: workflow.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.ONBOARDING_COMPLETED,
          title: 'Onboarding completado',
          description: dto.detail ?? 'El onboarding quedó completado y habilita la asignación operativa.',
          correlationId,
          payload: { stepKey: step.stageKey },
        });
        break;
      case WorkflowStageKey.TRAINING:
        await tx.workflowTrainingAssignment.updateMany({
          where: { workflowId: workflow.id },
          data: {
            status: WorkflowTaskStatus.COMPLETED,
            progressPercent: 100,
            activatedAt: now,
            completedAt: now,
            dueDate: dto.targetDate,
            metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
          },
        });
        await this.createOperationalEvent(tx, {
          tenantId: workflow.tenantId,
          branchId: workflow.branchId,
          workflowId: workflow.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.TRAINING_COMPLETED,
          title: 'Formación completada',
          description: dto.detail ?? 'La formación inicial fue completada.',
          correlationId,
          payload: { stepKey: step.stageKey },
        });
        break;
      case WorkflowStageKey.OPERATION:
        await tx.inventoryAssignment.updateMany({
          where: { workflowId: workflow.id },
          data: {
            status: InventoryAssignmentStatus.ASSIGNED,
            assignedAt: now,
            itemId: dto.metadata?.itemId as string | undefined,
            metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
          },
        });
        await tx.productivityReview.updateMany({
          where: { workflowId: workflow.id },
          data: {
            status: ProductivityReviewStatus.COMPLETED,
            completedAt: now,
            notes: dto.detail ?? null,
            metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
          },
        });
        await this.createOperationalEvent(tx, {
          tenantId: workflow.tenantId,
          branchId: workflow.branchId,
          workflowId: workflow.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.OPERATION_CONFIRMED,
          title: 'Operación confirmada',
          description: dto.detail ?? 'El handoff operativo fue confirmado.',
          correlationId,
          payload: { stepKey: step.stageKey },
        });
        break;
      case WorkflowStageKey.ADMIN_COMPLIANCE:
        await tx.accessTask.updateMany({
          where: { workflowId: workflow.id },
          data: {
            status: AccessTaskStatus.PROVISIONED,
            completedAt: now,
            metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
          },
        });
        await this.createOperationalEvent(tx, {
          tenantId: workflow.tenantId,
          branchId: workflow.branchId,
          workflowId: workflow.id,
          actorUserId: actor.sub,
          eventType: OperationalEventType.COMPLIANCE_COMPLETED,
          title: 'Cumplimiento completado',
          description: dto.detail ?? 'La administración y compliance fueron completados.',
          correlationId,
          payload: { stepKey: step.stageKey },
        });
        break;
    }

    await this.resolveBlockersForStage(
      tx,
      workflow.id,
      this.ensureStageKey(step.stageKey, step.stepType),
      correlationId,
      workflow,
      actor,
    );
  }

  private async updateSingleStep(
    tx: TxClient,
    workflowId: string,
    stepType: WorkflowStepType,
    status: WorkflowTaskStatus,
    progressPercent: number,
  ) {
    await tx.workflowStep.updateMany({
      where: { workflowId, stepType },
      data: {
        status,
        progressPercent,
        startedAt: status !== WorkflowTaskStatus.PENDING ? new Date() : null,
        completedAt: status === WorkflowTaskStatus.COMPLETED ? new Date() : null,
        riskStatus: this.computeRiskStatus(undefined, status),
      },
    });
  }

  private async loadWorkflowOrThrow(client: PrismaService | TxClient, id: string, tenantId: string) {
    const workflow = await client.masterWorkflow.findFirst({
      where: { id, tenantId },
      include: workflowInclude,
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return workflow;
  }

  private async findWorkflowStepOrThrow(client: PrismaService | TxClient, id: string, tenantId: string) {
    const step = await client.workflowStep.findFirst({
      where: { id, tenantId },
    });

    if (!step) {
      throw new NotFoundException('Workflow step not found');
    }

    return step;
  }

  private async findWorkflowStepByStageOrThrow(
    client: PrismaService | TxClient,
    workflowId: string,
    tenantId: string,
    stageKey: WorkflowStageKey,
  ) {
    const step = await client.workflowStep.findFirst({
      where: { workflowId, tenantId, stageKey },
    });

    if (!step) {
      throw new NotFoundException('Workflow stage not found');
    }

    return step;
  }

  private async assertEmployeeBelongsToTenant(client: PrismaService | TxClient, employeeId: string, tenantId: string) {
    const employee = await client.employee.findFirst({
      where: { id: employeeId, tenantId },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async assertBranchBelongsToTenant(client: PrismaService | TxClient, branchId: string, tenantId: string) {
    const branch = await client.branch.findFirst({
      where: { id: branchId, tenantId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  private async resolveEmployeePrimaryBranch(
    client: PrismaService | TxClient,
    employeeId: string,
    tenantId: string,
  ) {
    return client.employeeBranch.findFirst({
      where: {
        tenantId,
        employeeId,
        isPrimary: true,
        releasedAt: null,
      },
    });
  }

  private async assertWorkflowAccess(workflow: WorkflowWithRelations, actor: JwtPayload) {
    if (actor.isSuperAdmin) {
      return;
    }

    if (workflow.tenantId !== actor.tenantId) {
      throw new ForbiddenException('Workflow does not belong to the current tenant');
    }

    if (
      actor.allowedBranchIds?.length &&
      !actor.allowedBranchIds.includes(workflow.branchId) &&
      actor.roleScope !== 'tenant_admin'
    ) {
      throw new ForbiddenException('Workflow does not belong to an allowed branch');
    }
  }

  private buildBranchScopeWhere(actor: JwtPayload): Prisma.MasterWorkflowWhereInput {
    if (actor.isSuperAdmin || actor.roleScope === 'tenant_admin') {
      return {};
    }

    return actor.allowedBranchIds?.length
      ? { branchId: { in: actor.allowedBranchIds } }
      : { branchId: actor.activeBranchId ?? undefined };
  }

  private async createOperationalEvent(
    tx: TxClient,
    input: {
      tenantId: string;
      branchId: string;
      workflowId: string;
      actorUserId?: string | null;
      eventType: OperationalEventType;
      title?: string | null;
      description?: string;
      payload?: Record<string, unknown>;
      correlationId?: string | null;
    },
  ) {
    await tx.operationalEvent.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        workflowId: input.workflowId,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        title: input.title ?? null,
        description: input.description,
        payload: this.toJson(input.payload),
        correlationId: input.correlationId ?? null,
      },
    });
  }

  private async createAuditLog(
    tx: TxClient,
    input: {
      tenantId: string;
      branchId?: string | null;
      userId?: string | null;
      email?: string | null;
      entityType?: string | null;
      entityId?: string | null;
      action: string;
      route: string;
      method: string;
      statusCode: number;
      correlationId?: string | null;
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
    },
  ) {
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId ?? null,
        userId: input.userId ?? null,
        email: input.email ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        action: input.action,
        route: input.route,
        method: input.method,
        statusCode: input.statusCode,
        correlationId: input.correlationId ?? null,
        before: this.toJson(input.before),
        after: this.toJson(input.after),
      },
    });
  }

  private async handleBlockerState(
    tx: TxClient,
    workflow: WorkflowWithRelations,
    step: WorkflowWithRelations['steps'][number],
    actor: JwtPayload,
    dto: UpdateWorkflowStageDto,
    correlationId: string,
    resolveExisting: boolean,
  ) {
    if (resolveExisting) {
      await this.resolveBlockersForStage(
        tx,
        workflow.id,
        this.ensureStageKey(step.stageKey, step.stepType),
        correlationId,
        workflow,
        actor,
      );
      return;
    }

    if (!dto.blockerMessage) {
      return;
    }

    await tx.workflowStep.update({
      where: { id: step.id },
      data: {
        status: WorkflowTaskStatus.BLOCKED,
        blockingReason: dto.blockerMessage,
        riskStatus: WorkflowRiskStatus.AT_RISK,
      },
    });

    await tx.workflowBlocker.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        stepKey: this.ensureStageKey(step.stageKey, step.stepType),
        message: dto.blockerMessage,
        severity: dto.blockerSeverity ?? WorkflowBlockerSeverity.MEDIUM,
        metadata: dto.metadata ? this.toJson(dto.metadata) : undefined,
      },
    });

    await this.createOperationalEvent(tx, {
      tenantId: workflow.tenantId,
      branchId: workflow.branchId,
      workflowId: workflow.id,
      actorUserId: actor.sub,
      eventType: OperationalEventType.WORKFLOW_BLOCKER_CREATED,
      title: `Bloqueo en ${this.humanizeStageKey(this.ensureStageKey(step.stageKey, step.stepType))}`,
      description: dto.blockerMessage,
      correlationId,
      payload: {
        stepKey: this.ensureStageKey(step.stageKey, step.stepType),
        severity: dto.blockerSeverity ?? WorkflowBlockerSeverity.MEDIUM,
      },
    });
  }

  private async resolveBlockersForStage(
    tx: TxClient,
    workflowId: string,
    stageKey: WorkflowStageKey,
    correlationId: string,
    workflow: WorkflowWithRelations,
    actor: JwtPayload,
  ) {
    const blockers = await tx.workflowBlocker.findMany({
      where: {
        workflowId,
        stepKey: stageKey,
        resolvedAt: null,
      },
    });

    if (blockers.length === 0) {
      return;
    }

    await tx.workflowBlocker.updateMany({
      where: {
        workflowId,
        stepKey: stageKey,
        resolvedAt: null,
      },
      data: { resolvedAt: new Date() },
    });

    await this.createOperationalEvent(tx, {
      tenantId: workflow.tenantId,
      branchId: workflow.branchId,
      workflowId: workflow.id,
      actorUserId: actor.sub,
      eventType: OperationalEventType.WORKFLOW_BLOCKER_RESOLVED,
      title: `Bloqueo resuelto en ${this.humanizeStageKey(stageKey)}`,
      description: `${blockers.length} bloqueo(s) resueltos`,
      correlationId,
      payload: { stepKey: stageKey, count: blockers.length },
    });
  }

  private resolveOwnerType(stepType: WorkflowStepType): WorkflowOwnerType {
    switch (stepType) {
      case WorkflowStepType.CANDIDACY:
      case WorkflowStepType.HIRING:
        return WorkflowOwnerType.USER;
      case WorkflowStepType.ONBOARDING:
      case WorkflowStepType.DOCUMENTS:
        return WorkflowOwnerType.ONBOARDING;
      case WorkflowStepType.SIGNATURES:
        return WorkflowOwnerType.SIGNATURE;
      case WorkflowStepType.ASSET_ASSIGNMENT:
      case WorkflowStepType.ASSET_RECOVERY:
        return WorkflowOwnerType.INVENTORY;
      case WorkflowStepType.TRAINING_ACTIVATION:
      case WorkflowStepType.TRAINING:
        return WorkflowOwnerType.TRAINING;
      case WorkflowStepType.OPERATION:
        return WorkflowOwnerType.PRODUCTIVITY;
      case WorkflowStepType.ACCESS_PROVISIONING:
      case WorkflowStepType.ACCESS_CLOSURE:
      case WorkflowStepType.ADMIN_COMPLIANCE:
        return WorkflowOwnerType.ACCESS;
      case WorkflowStepType.PRODUCTIVITY_REVIEW:
        return WorkflowOwnerType.PRODUCTIVITY;
      default:
        return WorkflowOwnerType.SYSTEM;
    }
  }

  private resolveStageKey(stepType: WorkflowStepType) {
    switch (stepType) {
      case WorkflowStepType.CANDIDACY:
        return WorkflowStageKey.CANDIDACY;
      case WorkflowStepType.HIRING:
        return WorkflowStageKey.HIRING;
      case WorkflowStepType.TRAINING:
      case WorkflowStepType.TRAINING_ACTIVATION:
        return WorkflowStageKey.TRAINING;
      case WorkflowStepType.OPERATION:
      case WorkflowStepType.ASSET_ASSIGNMENT:
      case WorkflowStepType.PRODUCTIVITY_REVIEW:
        return WorkflowStageKey.OPERATION;
      case WorkflowStepType.ADMIN_COMPLIANCE:
      case WorkflowStepType.ACCESS_PROVISIONING:
      case WorkflowStepType.ACCESS_CLOSURE:
      case WorkflowStepType.ARCHIVE_RECORD:
        return WorkflowStageKey.ADMIN_COMPLIANCE;
      case WorkflowStepType.ONBOARDING:
      case WorkflowStepType.DOCUMENTS:
      case WorkflowStepType.SIGNATURES:
      default:
        return WorkflowStageKey.ONBOARDING;
    }
  }

  private ensureStageKey(stageKey: WorkflowStageKey | null, stepType: WorkflowStepType) {
    return stageKey ?? this.resolveStageKey(stepType);
  }

  private resolveOwnerLabel(stepType: WorkflowStepType) {
    switch (this.resolveStageKey(stepType)) {
      case WorkflowStageKey.CANDIDACY:
        return 'ATS / Reclutamiento';
      case WorkflowStageKey.HIRING:
        return 'RRHH';
      case WorkflowStageKey.ONBOARDING:
        return 'Onboarding';
      case WorkflowStageKey.TRAINING:
        return 'Training';
      case WorkflowStageKey.OPERATION:
        return 'Operaciones';
      case WorkflowStageKey.ADMIN_COMPLIANCE:
        return 'Admin / Compliance';
    }
  }

  private humanizeStageKey(stageKey: WorkflowStageKey) {
    switch (stageKey) {
      case WorkflowStageKey.CANDIDACY:
        return 'Candidatura';
      case WorkflowStageKey.HIRING:
        return 'Contratación';
      case WorkflowStageKey.ONBOARDING:
        return 'Onboarding';
      case WorkflowStageKey.TRAINING:
        return 'Formación';
      case WorkflowStageKey.OPERATION:
        return 'Operación';
      case WorkflowStageKey.ADMIN_COMPLIANCE:
        return 'Administración y cumplimiento';
    }
  }

  private buildDefaultStageDetail(stageKey: WorkflowStageKey) {
    switch (stageKey) {
      case WorkflowStageKey.CANDIDACY:
        return 'Seguimiento y cierre del proceso de candidatura.';
      case WorkflowStageKey.HIRING:
        return 'Registro y aprobación de contratación.';
      case WorkflowStageKey.ONBOARDING:
        return 'Ingreso, documentación y readiness.';
      case WorkflowStageKey.TRAINING:
        return 'Ruta de formación inicial.';
      case WorkflowStageKey.OPERATION:
        return 'Handoff a operación y activación operativa.';
      case WorkflowStageKey.ADMIN_COMPLIANCE:
        return 'Accesos, cumplimiento y cierre administrativo.';
    }
  }

  private humanizeEventType(eventType: OperationalEventType) {
    return eventType.toLowerCase().replace(/_/g, ' ');
  }

  private computeRiskStatus(dueDate: Date | null | undefined, status: WorkflowTaskStatus) {
    if (!dueDate || status === WorkflowTaskStatus.COMPLETED || status === WorkflowTaskStatus.CANCELLED) {
      return WorkflowRiskStatus.ON_TIME;
    }

    const dueAt = dueDate.getTime();
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (dueAt < now) {
      return WorkflowRiskStatus.OVERDUE;
    }

    if (dueAt - now <= oneDay) {
      return WorkflowRiskStatus.AT_RISK;
    }

    return WorkflowRiskStatus.ON_TIME;
  }

  private addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private serializeWorkflow(workflow: WorkflowWithRelations) {
    return {
      id: workflow.id,
      tenantId: workflow.tenantId,
      branchId: workflow.branchId,
      employeeId: workflow.employeeId,
      candidateId: workflow.candidateId,
      workflowType: workflow.workflowType,
      status: workflow.status,
      progressPercent: workflow.progressPercent,
      currentStage: workflow.currentStage,
      currentStageKey: workflow.currentStage ? this.resolveStageKey(workflow.currentStage) : null,
      startedAt: workflow.startedAt,
      completedAt: workflow.completedAt,
      sourceModule: workflow.sourceModule,
      metadata: workflow.metadata,
      lastComputedAt: workflow.lastComputedAt,
      branch: workflow.branch,
      employee: workflow.employee,
      candidate: workflow.candidate,
      blockers: workflow.blockers.map((blocker) => ({
        id: blocker.id,
        stepKey: blocker.stepKey,
        message: blocker.message,
        severity: blocker.severity,
        createdAt: blocker.createdAt,
      })),
      steps: workflow.steps.map((step) => ({
        id: step.id,
        stepKey: this.ensureStageKey(step.stageKey, step.stepType),
        label: step.title ?? this.humanizeStageKey(this.ensureStageKey(step.stageKey, step.stepType)),
        type: step.stepType,
        status: this.normalizeTaskStatus(step.status),
        progressPercent: step.progressPercent,
        ownerType: step.ownerType,
        ownerId: step.ownerId,
        ownerLabel: step.ownerLabel,
        detail: step.detail,
        sla: step.slaLabel ?? step.riskStatus.toLowerCase(),
        riskStatus: step.riskStatus.toLowerCase(),
        targetDate: step.dueDate,
        dueDate: step.dueDate,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        blockingReason: step.blockingReason,
        metadata: step.metadata,
      })),
      onboardingFlow: workflow.onboardingFlow,
      signaturePackages: workflow.signaturePackages,
      inventoryAssignments: workflow.inventoryAssignments,
      inventoryRecoveries: workflow.inventoryRecoveries,
      workflowTrainingAssignments: workflow.workflowTrainingAssignments,
      accessTasks: workflow.accessTasks,
      productivityReviews: workflow.productivityReviews,
      operationalEvents: workflow.operationalEvents.map((event) => ({
        id: event.id,
        type: event.eventType,
        title: event.title ?? this.humanizeEventType(event.eventType),
        description: event.description,
        createdBy: event.actorUserId,
        createdAt: event.occurredAt,
        metadata: event.payload,
      })),
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
    };
  }

  private serializeMasterCard(workflow: WorkflowWithRelations) {
    const blockers = workflow.blockers.map((blocker) => blocker.message);

    return {
      id: workflow.id,
      workflowType: 'hiring',
      employeeName: workflow.employee?.name ?? workflow.candidate?.fullName ?? 'Sin persona asociada',
      branchName: workflow.branch.name,
      globalStatus: workflow.status.toLowerCase(),
      progressPercent: workflow.progressPercent,
      currentStage: (workflow.currentStage ? this.resolveStageKey(workflow.currentStage) : null)?.toLowerCase() ?? null,
      summary: this.buildSummary(workflow),
      blockers,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        label: step.title ?? this.humanizeStageKey(this.ensureStageKey(step.stageKey, step.stepType)),
        status: this.normalizeTaskStatus(step.status),
        detail: step.detail ?? this.buildDefaultStageDetail(this.ensureStageKey(step.stageKey, step.stepType)),
        owner: step.ownerLabel ?? this.resolveOwnerLabel(step.stepType),
        sla: step.slaLabel ?? step.riskStatus.toLowerCase(),
        targetDate: step.dueDate?.toISOString() ?? '',
      })),
      updatedAtLabel: workflow.updatedAt.toISOString(),
    };
  }

  private buildSummary(workflow: WorkflowWithRelations) {
    if (workflow.status === WorkflowStatus.BLOCKED) {
      return `Flujo bloqueado en ${(workflow.currentStage ? this.resolveStageKey(workflow.currentStage) : null)?.toLowerCase() ?? 'etapa desconocida'}`;
    }

    if (workflow.status === WorkflowStatus.COMPLETED) {
      return 'Flujo completado y consolidado';
    }

    if (workflow.currentStage) {
      return `Etapa actual: ${this.resolveStageKey(workflow.currentStage).toLowerCase()}`;
    }

    return 'Flujo pendiente de iniciar';
  }

  private normalizeTaskStatus(status: WorkflowTaskStatus) {
    if (status === WorkflowTaskStatus.COMPLETED) {
      return 'completed';
    }

    if (status === WorkflowTaskStatus.IN_PROGRESS || status === WorkflowTaskStatus.BLOCKED) {
      return 'in_progress';
    }

    return 'pending';
  }

  private toActionRoute(stepType: WorkflowStepType) {
    switch (stepType) {
      case WorkflowStepType.ONBOARDING:
        return 'complete-onboarding';
      case WorkflowStepType.SIGNATURES:
        return 'complete-signature';
      case WorkflowStepType.ASSET_ASSIGNMENT:
        return 'assign-asset';
      case WorkflowStepType.TRAINING_ACTIVATION:
        return 'activate-training';
      case WorkflowStepType.ACCESS_PROVISIONING:
        return 'provision-access';
      case WorkflowStepType.ASSET_RECOVERY:
        return 'recover-asset';
      case WorkflowStepType.ACCESS_CLOSURE:
        return 'close-access';
      case WorkflowStepType.ARCHIVE_RECORD:
        return 'archive-record';
      default:
        return 'update-step';
    }
  }

  private toJson(
    value: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}
