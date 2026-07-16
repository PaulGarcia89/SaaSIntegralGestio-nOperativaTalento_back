import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccessScope,
  AutomationAuditStatus,
  AutomationConsequenceType,
  AutomationExecutionStatus,
  AutomationScope,
  AutomationStepStatus,
  AutomationTriggerEvent,
  NotificationType,
  PolicyCheckStatus,
  Prisma,
  TrainingActivationStatus,
  WorkflowMasterSlaStatus,
  WorkflowStageKey,
  WorkflowStepType,
  WorkflowStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { CreateHiringWorkflowDto } from '../workflows/dto/create-hiring-workflow.dto';
import { UpdateWorkflowStageDto } from '../workflows/dto/update-workflow-stage.dto';
import { WorkflowActionDto } from '../workflows/dto/workflow-action.dto';
import { WorkflowsService } from '../workflows/workflows.service';
import { CreateAutomationRuleDto } from './dto/create-automation-rule.dto';
import { ListAutomationAuditDto } from './dto/list-automation-audit.dto';
import { ListAutomationExecutionsDto } from './dto/list-automation-executions.dto';
import { ListAutomationRulesDto } from './dto/list-automation-rules.dto';
import { UpdateAutomationRuleDto } from './dto/update-automation-rule.dto';
import { CandidateHiredDto } from '../domain-events/dto/candidate-hired.dto';
import { SimpleDomainEventDto } from '../domain-events/dto/simple-domain-event.dto';

type TxClient = Prisma.TransactionClient;

type DomainEventContext = {
  tenantId: string;
  branchId: string | null;
  workflowId: string | null;
  employeeId: string | null;
  candidateId: string | null;
  actorUserId: string | null;
  payload: Record<string, unknown>;
  occurredAt: Date;
};

type AutomationCondition = {
  field?: string;
  operator?: 'equals' | 'not_equals' | 'in' | 'not_in' | 'exists';
  value?: unknown;
  values?: unknown[];
};

type AutomationConsequence = {
  type: AutomationConsequenceType;
  stepKey?: WorkflowStageKey;
  title?: string;
  message?: string;
  ownerLabel?: string;
  itemId?: string;
  courseId?: string;
  curriculumId?: string;
  quantity?: number;
  policyCode?: string;
  dueDate?: string;
  payload?: Record<string, unknown>;
};

const executionInclude = {
  rule: true,
  branch: true,
  workflow: {
    include: {
      branch: true,
      employee: true,
      candidate: true,
    },
  },
  employee: true,
  candidate: true,
  steps: {
    orderBy: { createdAt: 'asc' },
  },
  auditLogs: {
    orderBy: { occurredAt: 'asc' },
  },
} satisfies Prisma.AutomationExecutionInclude;

type ExecutionWithRelations = Prisma.AutomationExecutionGetPayload<{
  include: typeof executionInclude;
}>;

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
  ) {}

  async listRules(actor: JwtPayload, query: ListAutomationRulesDto) {
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.AutomationRuleWhereInput = {
      tenantId: actor.tenantId,
      ...(query.triggerEvent ? { triggerEvent: query.triggerEvent } : {}),
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.enabled !== undefined ? { enabled: query.enabled } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...this.buildAutomationBranchFilter(actor),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationRule.findMany({
        where,
        orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.automationRule.count({ where }),
    ]);

    return {
      data: items,
      meta: this.buildMeta(total, pagination.page, pagination.pageSize),
    };
  }

  async createRule(actor: JwtPayload, dto: CreateAutomationRuleDto) {
    await this.assertRuleScope(actor, dto.branchId, dto.scope);

    if (dto.scope === AutomationScope.BRANCH && !dto.branchId) {
      throw new BadRequestException('branchId es obligatorio para reglas de sucursal');
    }

    return this.prisma.automationRule.create({
      data: {
        tenantId: actor.tenantId,
        branchId: dto.scope === AutomationScope.TENANT ? null : dto.branchId ?? null,
        name: dto.name,
        triggerEvent: dto.triggerEvent,
        scope: dto.scope,
        conditions: this.toJson(dto.conditions ?? []),
        enabled: dto.enabled ?? true,
        version: dto.version ?? 1,
        consequences: this.toRequiredJson(dto.consequences),
        createdBy: actor.sub,
      },
    });
  }

  async updateRule(actor: JwtPayload, id: string, dto: UpdateAutomationRuleDto) {
    const existing = await this.prisma.automationRule.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
        ...this.buildAutomationBranchFilter(actor),
      },
    });

    if (!existing) {
      throw new NotFoundException('Automation rule not found');
    }

    const nextScope = dto.scope ?? existing.scope;
    const nextBranchId =
      dto.scope === AutomationScope.TENANT ? null : dto.branchId ?? existing.branchId ?? null;

    await this.assertRuleScope(actor, nextBranchId, nextScope);

    return this.prisma.automationRule.update({
      where: { id: existing.id },
      data: {
        name: dto.name ?? existing.name,
        triggerEvent: dto.triggerEvent ?? existing.triggerEvent,
        scope: nextScope,
        branchId: nextScope === AutomationScope.TENANT ? null : nextBranchId,
        conditions: dto.conditions ? this.toJson(dto.conditions) : undefined,
        enabled: dto.enabled ?? existing.enabled,
        version: typeof dto.version === 'number' ? dto.version : existing.version + 1,
        consequences: dto.consequences ? this.toRequiredJson(dto.consequences) : undefined,
      },
    });
  }

  async listExecutions(actor: JwtPayload, query: ListAutomationExecutionsDto) {
    const pagination = normalizeOffsetPagination(query);
    const where = {
      tenantId: actor.tenantId,
      ...(query.triggerEvent ? { triggerEvent: query.triggerEvent } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.workflowId ? { workflowId: query.workflowId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...this.buildAutomationBranchFilter(actor),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationExecution.findMany({
        where,
        include: executionInclude,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.automationExecution.count({ where }),
    ]);

    return {
      data: items.map((item) => this.serializeExecution(item)),
      meta: this.buildMeta(total, pagination.page, pagination.pageSize),
    };
  }

  async getExecution(actor: JwtPayload, id: string) {
    const execution = await this.prisma.automationExecution.findFirst({
      where: {
        id,
        tenantId: actor.tenantId,
        ...this.buildAutomationBranchFilter(actor),
      },
      include: executionInclude,
    });

    if (!execution) {
      throw new NotFoundException('Automation execution not found');
    }

    return this.serializeExecution(execution);
  }

  async listAudit(actor: JwtPayload, query: ListAutomationAuditDto) {
    const pagination = normalizeOffsetPagination(query);
    const where = {
      tenantId: actor.tenantId,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.executionId ? { executionId: query.executionId } : {}),
      ...(query.workflowId ? { workflowId: query.workflowId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...this.buildAutomationBranchFilter(actor),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.automationAuditLog.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.automationAuditLog.count({ where }),
    ]);

    return {
      data: items,
      meta: this.buildMeta(total, pagination.page, pagination.pageSize),
    };
  }

  async processCandidateHired(actor: JwtPayload, dto: CandidateHiredDto) {
    const workflow = await this.workflowsService.createHiringWorkflow(actor.tenantId, actor, {
      applicationId: dto.applicationId,
      candidateId: dto.candidateId,
      branchId: dto.branchId,
      employeeName: dto.employeeName,
      employeeEmail: dto.employeeEmail,
      metadata: dto.payload,
    } satisfies CreateHiringWorkflowDto);

    return this.processEvent(actor, AutomationTriggerEvent.CANDIDATE_HIRED, {
      tenantId: actor.tenantId,
      branchId: workflow.branchId ?? dto.branchId,
      workflowId: workflow.id,
      employeeId: workflow.employeeId ?? null,
      candidateId: workflow.candidateId ?? dto.candidateId,
      actorUserId: actor.sub,
      payload: {
        applicationId: dto.applicationId ?? null,
        ...dto.payload,
      },
      occurredAt: dto.occurredAt ?? new Date(),
    });
  }

  async processBranchChanged(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.EMPLOYEE_BRANCH_CHANGED, dto);
  }

  async processOffboardingStarted(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.EMPLOYEE_OFFBOARDING_STARTED, dto);
  }

  async processOnboardingCompleted(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.ONBOARDING_COMPLETED, dto);
  }

  async processAssetAssigned(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.INVENTORY_ASSET_ASSIGNED, dto);
  }

  async processTrainingCompleted(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.TRAINING_COMPLETED, dto);
  }

  async processOperationHandoffCompleted(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.OPERATION_HANDOFF_COMPLETED, dto);
  }

  async processComplianceClosed(actor: JwtPayload, dto: SimpleDomainEventDto) {
    return this.processEmployeeEvent(actor, AutomationTriggerEvent.COMPLIANCE_CLOSED, dto);
  }

  private async processEmployeeEvent(
    actor: JwtPayload,
    triggerEvent: AutomationTriggerEvent,
    dto: SimpleDomainEventDto,
  ) {
    const workflow = await this.findRelevantWorkflow(actor.tenantId, actor, dto.employeeId, dto.workflowId);

    return this.processEvent(actor, triggerEvent, {
      tenantId: actor.tenantId,
      branchId: dto.branchId ?? workflow?.branchId ?? null,
      workflowId: dto.workflowId ?? workflow?.id ?? null,
      employeeId: dto.employeeId,
      candidateId: workflow?.candidateId ?? dto.candidateId ?? null,
      actorUserId: actor.sub,
      payload: dto.payload ?? {},
      occurredAt: dto.occurredAt ?? new Date(),
    });
  }

  private async processEvent(
    actor: JwtPayload,
    triggerEvent: AutomationTriggerEvent,
    context: DomainEventContext,
  ) {
    const rules = await this.prisma.automationRule.findMany({
      where: {
        tenantId: context.tenantId,
        enabled: true,
        triggerEvent,
        OR: [
          { scope: AutomationScope.TENANT, branchId: null },
          { scope: AutomationScope.BRANCH, branchId: context.branchId ?? undefined },
        ],
        ...this.buildAutomationBranchFilter(actor),
      },
      orderBy: [{ scope: 'asc' }, { createdAt: 'asc' }],
    });

    if (rules.length === 0) {
      await this.createAuditTrail({
        tenantId: context.tenantId,
        branchId: context.branchId,
        workflowId: context.workflowId,
        employeeId: context.employeeId,
        candidateId: context.candidateId,
        actorUserId: context.actorUserId,
        eventName: triggerEvent,
        action: 'RULES_NOT_FOUND',
        status: AutomationAuditStatus.SKIPPED,
        summary: `No hay reglas activas para ${triggerEvent}`,
        payload: context.payload,
      });

      return {
        triggerEvent,
        executionCount: 0,
        executions: [],
      };
    }

    const executions = [];

    for (const rule of rules) {
      const conditions = this.parseConditions(rule.conditions);
      const matches = this.matchesConditions(conditions, context);

      if (!matches) {
        await this.createAuditTrail({
          tenantId: context.tenantId,
          branchId: context.branchId,
          workflowId: context.workflowId,
          employeeId: context.employeeId,
          candidateId: context.candidateId,
          actorUserId: context.actorUserId,
          ruleId: rule.id,
          eventName: triggerEvent,
          action: 'RULE_SKIPPED',
          status: AutomationAuditStatus.SKIPPED,
          summary: `La regla ${rule.name} no cumplió condiciones`,
          payload: { context: context.payload, conditions },
        });
        continue;
      }

      executions.push(await this.executeRule(rule, context));
    }

    return {
      triggerEvent,
      executionCount: executions.length,
      executions,
    };
  }

  private async executeRule(
    rule: {
      id: string;
      tenantId: string;
      branchId: string | null;
      name: string;
      triggerEvent: AutomationTriggerEvent;
      consequences: Prisma.JsonValue;
    },
    context: DomainEventContext,
  ) {
    const correlationId = randomUUID();
    const consequences = this.parseConsequences(rule.consequences);

    return this.prisma.$transaction(
      async (tx) => {
        const execution = await tx.automationExecution.create({
        data: {
          tenantId: context.tenantId,
          branchId: context.branchId,
          ruleId: rule.id,
          workflowId: context.workflowId,
          employeeId: context.employeeId,
          candidateId: context.candidateId,
          actorUserId: context.actorUserId,
          triggerEvent: rule.triggerEvent,
          status: AutomationExecutionStatus.IN_PROGRESS,
          detail: this.toJson({ payload: context.payload, correlationId }),
        },
      });

      await this.createAuditTrailTx(tx, {
        tenantId: context.tenantId,
        branchId: context.branchId,
        workflowId: context.workflowId,
        employeeId: context.employeeId,
        candidateId: context.candidateId,
        ruleId: rule.id,
        executionId: execution.id,
        actorUserId: context.actorUserId,
        eventName: rule.triggerEvent,
        action: 'EXECUTION_STARTED',
        status: AutomationAuditStatus.STARTED,
        summary: `Ejecutando regla ${rule.name}`,
        payload: { correlationId, consequences },
      });

      const stepResults: Array<{ status: AutomationStepStatus; message: string }> = [];

      for (const consequence of consequences) {
        const step = await tx.automationExecutionStep.create({
          data: {
            tenantId: context.tenantId,
            branchId: context.branchId,
            executionId: execution.id,
            consequence: consequence.type,
            status: AutomationStepStatus.IN_PROGRESS,
            detail: this.toJson(consequence.payload ?? {}),
          },
        });

        try {
          const result = await this.executeConsequence(tx, context, consequence);
          stepResults.push({ status: AutomationStepStatus.COMPLETED, message: result });

          await tx.automationExecutionStep.update({
            where: { id: step.id },
            data: {
              status: AutomationStepStatus.COMPLETED,
              result,
              completedAt: new Date(),
            },
          });

          await this.createAuditTrailTx(tx, {
            tenantId: context.tenantId,
            branchId: context.branchId,
            workflowId: context.workflowId,
            employeeId: context.employeeId,
            candidateId: context.candidateId,
            ruleId: rule.id,
            executionId: execution.id,
            actorUserId: context.actorUserId,
            eventName: rule.triggerEvent,
            action: consequence.type,
            status: AutomationAuditStatus.SUCCESS,
            summary: result,
            payload: consequence.payload ?? {},
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Consequence failed';
          stepResults.push({ status: AutomationStepStatus.FAILED, message });

          await tx.automationExecutionStep.update({
            where: { id: step.id },
            data: {
              status: AutomationStepStatus.FAILED,
              result: message,
              completedAt: new Date(),
            },
          });

          await tx.automationExecution.update({
            where: { id: execution.id },
            data: {
              status: AutomationExecutionStatus.FAILED,
              result: message,
              completedAt: new Date(),
            },
          });

          await this.createAuditTrailTx(tx, {
            tenantId: context.tenantId,
            branchId: context.branchId,
            workflowId: context.workflowId,
            employeeId: context.employeeId,
            candidateId: context.candidateId,
            ruleId: rule.id,
            executionId: execution.id,
            actorUserId: context.actorUserId,
            eventName: rule.triggerEvent,
            action: consequence.type,
            status: AutomationAuditStatus.FAILED,
            summary: message,
            payload: consequence.payload ?? {},
          });

          throw error;
        }
      }

      const hasFailures = stepResults.some((item) => item.status === AutomationStepStatus.FAILED);
      const finalStatus = hasFailures
        ? AutomationExecutionStatus.PARTIAL
        : AutomationExecutionStatus.COMPLETED;

      const updatedExecution = await tx.automationExecution.update({
        where: { id: execution.id },
        data: {
          status: finalStatus,
          result: hasFailures ? 'partial' : 'completed',
          completedAt: new Date(),
        },
        include: executionInclude,
      });

      await this.createAuditTrailTx(tx, {
        tenantId: context.tenantId,
        branchId: context.branchId,
        workflowId: context.workflowId,
        employeeId: context.employeeId,
        candidateId: context.candidateId,
        ruleId: rule.id,
        executionId: execution.id,
        actorUserId: context.actorUserId,
        eventName: rule.triggerEvent,
        action: 'EXECUTION_FINISHED',
        status: hasFailures ? AutomationAuditStatus.FAILED : AutomationAuditStatus.SUCCESS,
        summary: `Regla ${rule.name} finalizada`,
        payload: { stepResults },
      });

        return this.serializeExecution(updatedExecution);
      },
      {
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }

  private async executeConsequence(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    switch (consequence.type) {
      case AutomationConsequenceType.CREATE_ONBOARDING:
        return this.createOnboardingArtifacts(tx, context, consequence);
      case AutomationConsequenceType.ASSIGN_ASSET:
        return this.createAssetAssignment(tx, context, consequence);
      case AutomationConsequenceType.PROVISION_ACCESS:
        return this.createAccessProvision(tx, context, consequence);
      case AutomationConsequenceType.ACTIVATE_TRAINING:
        return this.createTrainingActivation(tx, context, consequence);
      case AutomationConsequenceType.CREATE_POLICY_CHECK:
        return this.createPolicyCheck(tx, context, consequence);
      case AutomationConsequenceType.MARK_WORKFLOW_STAGE:
        return this.markWorkflowStage(tx, context, consequence);
      case AutomationConsequenceType.NOTIFY_ACTOR:
        return this.notifyActor(tx, context, consequence);
      case AutomationConsequenceType.ARCHIVE_RECORD:
        return this.archiveRecord(tx, context, consequence);
      case AutomationConsequenceType.REVOKE_ACCESS:
        return this.revokeAccess(tx, context, consequence);
      default:
        throw new BadRequestException(`Consequence ${consequence.type} no soportada`);
    }
  }

  private async createOnboardingArtifacts(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflow = await this.requireWorkflow(tx, context);

    await tx.onboardingFlow.upsert({
      where: { workflowId: workflow.id },
      update: {
        metadata: this.toJson(consequence.payload ?? { source: 'automation' }),
      },
      create: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId!,
        candidateId: workflow.candidateId,
        metadata: this.toJson(consequence.payload ?? { source: 'automation' }),
      },
    });

    return 'Onboarding creado o actualizado';
  }

  private async createAssetAssignment(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflow = await this.requireWorkflow(tx, context);

    const inventoryAssignment = await tx.inventoryAssignment.upsert({
      where: { id: consequence.payload?.['inventoryAssignmentId'] as string | undefined ?? randomUUID() },
      update: {},
      create: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId!,
        itemId: consequence.itemId ?? null,
        quantity: consequence.quantity ?? 1,
      },
    }).catch(async () =>
      tx.inventoryAssignment.findFirstOrThrow({
        where: { workflowId: workflow.id },
      }),
    );

    await tx.assetAssignment.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId,
        inventoryAssignmentId: inventoryAssignment.id,
        itemId: consequence.itemId ?? inventoryAssignment.itemId,
        status: 'PENDING',
        detail: this.toJson(consequence.payload ?? {}),
      },
    });

    return 'Asignación de activo pendiente creada';
  }

  private async createAccessProvision(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflow = await this.requireWorkflow(tx, context);

    await tx.accessTask.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId!,
        taskType: 'PROVISION',
        permissions: this.toJson(consequence.payload ?? {}),
        metadata: this.toJson({ source: 'automation' }),
      },
    });

    return 'Provisionamiento de acceso creado';
  }

  private async createTrainingActivation(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflow = await this.requireWorkflow(tx, context);

    const trainingAssignment = await tx.workflowTrainingAssignment.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId!,
        courseId: consequence.courseId ?? null,
        curriculumId: consequence.curriculumId ?? null,
        dueDate: consequence.dueDate ? new Date(consequence.dueDate) : null,
        metadata: this.toJson(consequence.payload ?? {}),
      },
    });

    await tx.trainingActivation.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId,
        workflowTrainingAssignmentId: trainingAssignment.id,
        courseId: consequence.courseId ?? null,
        curriculumId: consequence.curriculumId ?? null,
        status: TrainingActivationStatus.PENDING,
        detail: this.toJson(consequence.payload ?? {}),
      },
    });

    return 'Activación de formación creada';
  }

  private async createPolicyCheck(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflow = await this.requireWorkflow(tx, context);

    await tx.policyCheck.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId,
        name: consequence.title ?? 'Policy check',
        policyCode: consequence.policyCode ?? 'default-policy',
        status: PolicyCheckStatus.PENDING,
        dueDate: consequence.dueDate ? new Date(consequence.dueDate) : null,
        detail: this.toJson(consequence.payload ?? {}),
        createdBy: context.actorUserId,
      },
    });

    return 'Chequeo de política creado';
  }

  private async markWorkflowStage(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflowId = context.workflowId;

    if (!workflowId || !consequence.stepKey) {
      throw new BadRequestException('workflowId y stepKey son obligatorios para marcar etapa');
    }

    const workflow = await this.requireWorkflow(tx, context);
    const step = await tx.workflowStep.findFirst({
      where: {
        workflowId,
        OR: [
          { stageKey: consequence.stepKey },
          { stepType: this.toWorkflowStepType(consequence.stepKey) },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!step) {
      throw new NotFoundException(`No se encontró la etapa ${consequence.stepKey} en el workflow`);
    }

    await tx.workflowStep.update({
      where: { id: step.id },
      data: {
        stageKey: consequence.stepKey,
        status: 'COMPLETED',
        progressPercent: 100,
        detail: consequence.message ?? step.detail,
        ownerLabel: consequence.ownerLabel ?? step.ownerLabel,
        dueDate: consequence.dueDate ? new Date(consequence.dueDate) : step.dueDate,
        completedAt: new Date(),
        startedAt: step.startedAt ?? new Date(),
        metadata: consequence.payload ? this.toJson(consequence.payload) : undefined,
      },
    });

    const steps = await tx.workflowStep.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'asc' },
    });
    const completed = steps.filter((item) => item.status === 'COMPLETED').length;
    const progressPercent = Math.round((completed / Math.max(steps.length, 1)) * 100);
    const nextPending = steps.find((item) => item.status !== 'COMPLETED' && item.id !== step.id);
    const nextStageKey = nextPending?.stageKey ?? null;
    const isCompleted = steps.length > 0 && completed >= steps.length;

    await tx.masterWorkflow.update({
      where: { id: workflow.id },
      data: {
        currentStage: nextStageKey ? this.toWorkflowStepType(nextStageKey) : workflow.currentStage,
        currentStageKey: nextStageKey,
        progressPercent,
        status: isCompleted ? WorkflowStatus.COMPLETED : WorkflowStatus.IN_PROGRESS,
        completedAt: isCompleted ? new Date() : null,
        lastEventAt: new Date(),
      },
    });

    return `Etapa ${consequence.stepKey} completada`;
  }

  private async notifyActor(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    if (!context.actorUserId) {
      throw new BadRequestException('No hay actor para notificación');
    }

    await tx.notification.create({
      data: {
        tenantId: context.tenantId,
        userId: context.actorUserId,
        type: NotificationType.INFO,
        title: consequence.title ?? 'Automatización ejecutada',
        message: consequence.message ?? 'Se ejecutó una acción automática',
        payload: this.toJson(consequence.payload ?? {}),
      },
    });

    return 'Notificación creada';
  }

  private async archiveRecord(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    if (!context.employeeId) {
      throw new BadRequestException('employeeId es obligatorio para archivar');
    }

    await tx.employee.update({
      where: { id: context.employeeId },
      data: {
        status: 'INACTIVE',
      },
    });

    return consequence.message ?? 'Registro archivado';
  }

  private async revokeAccess(
    tx: TxClient,
    context: DomainEventContext,
    consequence: AutomationConsequence,
  ) {
    const workflow = await this.requireWorkflow(tx, context);

    await tx.accessTask.create({
      data: {
        tenantId: workflow.tenantId,
        branchId: workflow.branchId,
        workflowId: workflow.id,
        employeeId: workflow.employeeId!,
        taskType: 'CLOSE',
        metadata: this.toJson(consequence.payload ?? {}),
      },
    });

    return consequence.message ?? 'Revocación de acceso creada';
  }

  private async requireWorkflow(tx: TxClient, context: DomainEventContext) {
    if (!context.workflowId) {
      throw new BadRequestException('workflowId es obligatorio para esta acción automática');
    }

    const workflow = await tx.masterWorkflow.findFirst({
      where: {
        id: context.workflowId,
        tenantId: context.tenantId,
      },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow not found for automation');
    }

    return workflow;
  }

  private async findRelevantWorkflow(
    tenantId: string,
    actor: JwtPayload,
    employeeId?: string,
    workflowId?: string,
  ) {
    if (workflowId) {
      return this.prisma.masterWorkflow.findFirst({
        where: {
          id: workflowId,
          tenantId,
          ...this.buildWorkflowBranchScope(actor),
        },
      });
    }

    if (!employeeId) {
      return null;
    }

    return this.prisma.masterWorkflow.findFirst({
      where: {
        tenantId,
        employeeId,
        ...this.buildWorkflowBranchScope(actor),
      },
      orderBy: [{ completedAt: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  private parseConditions(value: Prisma.JsonValue | null): AutomationCondition[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value as AutomationCondition[];
  }

  private parseConsequences(value: Prisma.JsonValue): AutomationConsequence[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException('Rule consequences must be an array');
    }

    return value as AutomationConsequence[];
  }

  private matchesConditions(conditions: AutomationCondition[], context: DomainEventContext) {
    if (conditions.length === 0) {
      return true;
    }

    return conditions.every((condition) => {
      const currentValue = this.getContextValue(context, condition.field);

      switch (condition.operator) {
        case 'not_equals':
          return currentValue !== condition.value;
        case 'in':
          return Array.isArray(condition.values) && condition.values.includes(currentValue as never);
        case 'not_in':
          return Array.isArray(condition.values) && !condition.values.includes(currentValue as never);
        case 'exists':
          return currentValue !== undefined && currentValue !== null;
        case 'equals':
        default:
          return currentValue === condition.value;
      }
    });
  }

  private getContextValue(context: DomainEventContext, field?: string) {
    if (!field) {
      return undefined;
    }

    if (field.startsWith('payload.')) {
      return field
        .replace(/^payload\./, '')
        .split('.')
        .reduce<unknown>((acc, key) => {
          if (!acc || typeof acc !== 'object') {
            return undefined;
          }

          return (acc as Record<string, unknown>)[key];
        }, context.payload);
    }

    return (context as Record<string, unknown>)[field];
  }

  private async loadActorContext(tenantId: string, actorUserId: string | null) {
    if (!actorUserId) {
      throw new BadRequestException('No hay actor para ejecutar la automatización');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: actorUserId,
        tenantId,
      },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        branchAccesses: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Actor user not found');
    }

    const primaryRole = user.userRoles[0]?.role;
    const permissions = new Set<string>();

    for (const userRole of user.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.code);
      }
    }

    for (const userPermission of user.userPermissions) {
      permissions.add(userPermission.permission.code);
    }

    return {
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      tenantSlug: '',
      tenantName: '',
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: primaryRole?.name ?? null,
      scope: primaryRole?.scope === AccessScope.GLOBAL
        ? 'global'
        : primaryRole?.scope === AccessScope.TENANT
          ? 'tenant'
          : 'branch',
      isSuperAdmin: user.isSuperAdmin,
      roleScope: primaryRole?.scope === AccessScope.GLOBAL
        ? 'super_admin'
        : primaryRole?.scope === AccessScope.TENANT
          ? 'tenant_admin'
          : 'branch_user',
      allowedBranchIds: user.branchAccesses.map((access) => access.branchId),
      activeBranchId: user.activeBranchId,
      roles: user.userRoles.map((item) => item.role.name),
      permissions: [...permissions],
      enabledModules: [],
    } as JwtPayload;
  }

  private toWorkflowStepType(stageKey: WorkflowStageKey) {
    switch (stageKey) {
      case WorkflowStageKey.CANDIDACY:
        return WorkflowStepType.CANDIDACY;
      case WorkflowStageKey.HIRING:
        return WorkflowStepType.HIRING;
      case WorkflowStageKey.ONBOARDING:
        return WorkflowStepType.ONBOARDING;
      case WorkflowStageKey.TRAINING:
        return WorkflowStepType.TRAINING;
      case WorkflowStageKey.OPERATION:
        return WorkflowStepType.OPERATION;
      case WorkflowStageKey.ADMIN_COMPLIANCE:
        return WorkflowStepType.ADMIN_COMPLIANCE;
    }
  }

  private buildAutomationBranchFilter(actor: JwtPayload) {
    if (actor.isSuperAdmin || actor.roleScope === 'tenant_admin') {
      return {};
    }

    if (actor.allowedBranchIds?.length) {
      return {
        OR: [{ branchId: null }, { branchId: { in: actor.allowedBranchIds } }],
      };
    }

    if (actor.activeBranchId) {
      return {
        OR: [{ branchId: null }, { branchId: actor.activeBranchId }],
      };
    }

    return { branchId: null };
  }

  private buildWorkflowBranchScope(actor: JwtPayload): Prisma.MasterWorkflowWhereInput {
    if (actor.isSuperAdmin || actor.roleScope === 'tenant_admin') {
      return {};
    }

    if (actor.allowedBranchIds?.length) {
      return { branchId: { in: actor.allowedBranchIds } };
    }

    return actor.activeBranchId ? { branchId: actor.activeBranchId } : {};
  }

  private async assertRuleScope(actor: JwtPayload, branchId: string | null | undefined, scope: AutomationScope) {
    if (actor.isSuperAdmin || actor.roleScope === 'tenant_admin') {
      return;
    }

    if (scope === AutomationScope.TENANT) {
      throw new ForbiddenException('Solo administración tenant puede crear reglas tenant-wide');
    }

    if (branchId && actor.allowedBranchIds?.length && !actor.allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('La regla no pertenece a una sucursal permitida');
    }
  }

  private serializeExecution(execution: ExecutionWithRelations) {
    return {
      id: execution.id,
      tenantId: execution.tenantId,
      branchId: execution.branchId,
      triggerEvent: execution.triggerEvent,
      status: execution.status,
      result: execution.result,
      startedAt: execution.startedAt,
      completedAt: execution.completedAt,
      workflow: execution.workflow
        ? {
            id: execution.workflow.id,
            branchId: execution.workflow.branchId,
            employeeId: execution.workflow.employeeId,
            candidateId: execution.workflow.candidateId,
            currentStage: execution.workflow.currentStage,
            currentStageKey: execution.workflow.currentStageKey,
            progressPercent: execution.workflow.progressPercent,
          }
        : null,
      employee: execution.employee,
      candidate: execution.candidate,
      rule: execution.rule,
      steps: execution.steps,
      auditTrail: execution.auditLogs,
      createdAt: execution.createdAt,
      updatedAt: execution.updatedAt,
    };
  }

  private async createAuditTrail(input: {
    tenantId: string;
    branchId: string | null;
    workflowId?: string | null;
    employeeId?: string | null;
    candidateId?: string | null;
    ruleId?: string | null;
    executionId?: string | null;
    actorUserId?: string | null;
    eventName: string;
    action: string;
    status: AutomationAuditStatus;
    summary: string;
    payload?: Record<string, unknown>;
  }) {
    await this.prisma.automationAuditLog.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        workflowId: input.workflowId ?? null,
        employeeId: input.employeeId ?? null,
        candidateId: input.candidateId ?? null,
        ruleId: input.ruleId ?? null,
        executionId: input.executionId ?? null,
        actorUserId: input.actorUserId ?? null,
        eventName: input.eventName,
        action: input.action,
        status: input.status,
        summary: input.summary,
        payload: this.toJson(input.payload ?? {}),
      },
    });
  }

  private async createAuditTrailTx(
    tx: TxClient,
    input: {
      tenantId: string;
      branchId: string | null;
      workflowId?: string | null;
      employeeId?: string | null;
      candidateId?: string | null;
      ruleId?: string | null;
      executionId?: string | null;
      actorUserId?: string | null;
      eventName: string;
      action: string;
      status: AutomationAuditStatus;
      summary: string;
      payload?: Record<string, unknown>;
    },
  ) {
    await tx.automationAuditLog.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        workflowId: input.workflowId ?? null,
        employeeId: input.employeeId ?? null,
        candidateId: input.candidateId ?? null,
        ruleId: input.ruleId ?? null,
        executionId: input.executionId ?? null,
        actorUserId: input.actorUserId ?? null,
        eventName: input.eventName,
        action: input.action,
        status: input.status,
        summary: input.summary,
        payload: this.toJson(input.payload ?? {}),
      },
    });
  }

  buildWorkflowMasterCard(workflow: {
    id: string;
    branch: { name: string };
    employee: { name: string } | null;
    currentStageKey: WorkflowStageKey | null;
    status: WorkflowStatus;
    progressPercent: number;
    blockersSnapshot?: Prisma.JsonValue | null;
    ownerSummary?: Prisma.JsonValue | null;
    updatedAt: Date;
    workflowType: string;
    steps: Array<{
      id: string;
      title: string | null;
      status: string;
      detail: string | null;
      ownerLabel: string | null;
      slaLabel: string | null;
      dueDate: Date | null;
    }>;
  }) {
    const blockers = Array.isArray(workflow.blockersSnapshot)
      ? workflow.blockersSnapshot.map((item) => String(item))
      : [];

    return {
      id: workflow.id,
      employeeName: workflow.employee?.name ?? 'Sin empleado',
      branchName: workflow.branch.name,
      workflowType: String(workflow.workflowType).toLowerCase(),
      globalStatus: workflow.status.toLowerCase(),
      progressPercent: workflow.progressPercent,
      currentStage: workflow.currentStageKey?.toLowerCase() ?? null,
      summary: workflow.currentStageKey
        ? `Etapa actual: ${workflow.currentStageKey.toLowerCase()}`
        : 'Flujo sin etapa actual',
      blockers,
      steps: workflow.steps.map((step) => ({
        id: step.id,
        label: step.title ?? 'Etapa',
        status: this.normalizeWorkflowStatus(step.status),
        detail: step.detail ?? '',
        owner: step.ownerLabel ?? 'Sistema',
        sla: step.slaLabel ?? 'on_time',
        targetDate: step.dueDate?.toISOString() ?? '',
      })),
      updatedAtLabel: workflow.updatedAt.toISOString(),
    };
  }

  async refreshWorkflowMasterSnapshot(workflowId: string) {
    const workflow = await this.prisma.masterWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        branch: true,
        employee: true,
        blockers: { where: { resolvedAt: null }, orderBy: { createdAt: 'asc' } },
        steps: { orderBy: { createdAt: 'asc' } },
        operationalEvents: { orderBy: { occurredAt: 'desc' }, take: 1 },
      },
    });

    if (!workflow) {
      return null;
    }

    const blockers = workflow.blockers.map((item) => item.message);
    const stepOwners = workflow.steps.map((item) => ({
      stepKey: item.stageKey ?? item.stepType,
      owner: item.ownerLabel,
      status: item.status,
    }));
    const targetDates = workflow.steps
      .map((item) => item.dueDate)
      .filter((item): item is Date => Boolean(item))
      .sort((a, b) => a.getTime() - b.getTime());
    const overdue = workflow.steps.some((item) => item.riskStatus === 'OVERDUE');
    const atRisk = workflow.steps.some((item) => item.riskStatus === 'AT_RISK');

    return this.prisma.masterWorkflow.update({
      where: { id: workflow.id },
      data: {
        blockersSnapshot: this.toJson(blockers),
        ownerSummary: this.toJson(stepOwners),
        slaStatus: overdue
          ? WorkflowMasterSlaStatus.OVERDUE
          : atRisk
            ? WorkflowMasterSlaStatus.AT_RISK
            : WorkflowMasterSlaStatus.ON_TIME,
        targetDate: targetDates[0] ?? null,
        lastEventAt: workflow.operationalEvents[0]?.occurredAt ?? workflow.updatedAt,
      },
    });
  }

  private normalizeWorkflowStatus(status: string) {
    if (status === 'COMPLETED') {
      return 'completed';
    }

    if (status === 'IN_PROGRESS' || status === 'BLOCKED') {
      return 'in_progress';
    }

    return 'pending';
  }

  private buildMeta(total: number, page: number, pageSize: number) {
    return {
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private toJson(
    value: Record<string, unknown> | Array<unknown> | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private toRequiredJson(
    value: Record<string, unknown> | Array<unknown> | null,
  ): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }
}
