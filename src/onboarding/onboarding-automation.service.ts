import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationCategory, NotificationType, OperationalEventType, Prisma, UserStatus, WorkflowTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

type TaskMetadata = {
  reminderSentAt?: string;
  escalatedAt?: string;
  reassignedAt?: string;
};

@Injectable()
export class OnboardingAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OnboardingAutomationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.ONBOARDING_AUTOMATION_ENABLED === 'false') return;
    const interval = Math.max(Number(process.env.ONBOARDING_AUTOMATION_POLL_MS ?? 900000), 60000);
    this.timer = setInterval(() => void this.processDueTasks(), interval);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async overview() {
    const now = new Date();
    const overdue = await this.prisma.onboardingTask.count({
      where: { dueDate: { lt: now }, status: { in: [WorkflowTaskStatus.PENDING, WorkflowTaskStatus.IN_PROGRESS, WorkflowTaskStatus.BLOCKED] } },
    });
    return {
      enabled: process.env.ONBOARDING_AUTOMATION_ENABLED !== 'false',
      reminderHours: this.hours('ONBOARDING_REMINDER_AFTER_HOURS', 0),
      escalationHours: this.hours('ONBOARDING_ESCALATION_AFTER_HOURS', 24),
      reassignmentHours: this.hours('ONBOARDING_REASSIGN_AFTER_HOURS', 48),
      autoReassignmentEnabled: process.env.ONBOARDING_AUTO_REASSIGN_ENABLED !== 'false',
      overdue,
      processing: this.running,
      generatedAt: now.toISOString(),
    };
  }

  async processDueTasks() {
    if (this.running) return { skipped: true, reason: 'ALREADY_RUNNING', processed: 0, reminders: 0, escalations: 0, reassignments: 0 };
    this.running = true;
    try {
      const now = new Date();
      const tasks = await this.prisma.onboardingTask.findMany({
        where: {
          dueDate: { lt: now },
          status: { in: [WorkflowTaskStatus.PENDING, WorkflowTaskStatus.IN_PROGRESS, WorkflowTaskStatus.BLOCKED] },
        },
        include: { employee: { select: { supervisorUserId: true } } },
        orderBy: { dueDate: 'asc' },
        take: Math.min(Number(process.env.ONBOARDING_AUTOMATION_BATCH_SIZE ?? 100), 500),
      });
      let reminders = 0;
      let escalations = 0;
      let reassignments = 0;
      for (const task of tasks) {
        const result = await this.processTask(task, now);
        reminders += Number(result.reminder);
        escalations += Number(result.escalation);
        reassignments += Number(result.reassignment);
      }
      return { skipped: false, processed: tasks.length, reminders, escalations, reassignments, ...(await this.overview()) };
    } catch (error) {
      this.logger.error('Onboarding automation failed', error instanceof Error ? error.stack : String(error));
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async processTask(task: { id: string; tenantId: string; branchId: string; workflowId: string; employeeId: string; title: string; dueDate: Date | null; ownerId: string | null; metadata: Prisma.JsonValue | null; employee: { supervisorUserId: string | null } }, now: Date) {
    if (!task.dueDate) return { reminder: false, escalation: false, reassignment: false };
    const metadata = this.metadata(task.metadata);
    const overdueHours = (now.getTime() - task.dueDate.getTime()) / 3600000;
    let reminder = false;
    let escalation = false;
    let reassignment = false;
    const owner = task.ownerId ? await this.prisma.user.findFirst({ where: { id: task.ownerId, tenantId: task.tenantId }, select: { id: true, status: true, activeBranchId: true, branchAccesses: { where: { branchId: task.branchId }, select: { branchId: true } } } }) : null;
    const ownerAvailable = Boolean(owner?.status === UserStatus.ACTIVE && (owner.activeBranchId === task.branchId || owner.branchAccesses.length));

    if (!metadata.reminderSentAt && overdueHours >= this.hours('ONBOARDING_REMINDER_AFTER_HOURS', 0)) {
      if (task.ownerId) await this.notify(task.tenantId, task.ownerId, `onboarding-reminder:${task.id}`, 'Tarea de incorporación vencida', `${task.title} requiere atención.`, task.id);
      metadata.reminderSentAt = now.toISOString();
      reminder = true;
    }
    if (!metadata.escalatedAt && overdueHours >= this.hours('ONBOARDING_ESCALATION_AFTER_HOURS', 24)) {
      const recipient = task.employee.supervisorUserId ?? task.ownerId;
      if (recipient) await this.notify(task.tenantId, recipient, `onboarding-escalation:${task.id}`, 'Escalamiento de incorporación', `${task.title} sigue vencida y requiere intervención.`, task.id);
      metadata.escalatedAt = now.toISOString();
      escalation = true;
    }
    if (!metadata.reassignedAt && process.env.ONBOARDING_AUTO_REASSIGN_ENABLED !== 'false' && overdueHours >= this.hours('ONBOARDING_REASSIGN_AFTER_HOURS', 48)) {
      const candidate = await this.leastLoadedOwner(task.tenantId, task.branchId, task.ownerId, ownerAvailable);
      if (candidate) {
        await this.prisma.onboardingTask.update({ where: { id: task.id }, data: { ownerId: candidate, ownerType: 'USER', metadata: this.json({ ...metadata, reassignedAt: now.toISOString() }) } });
        await this.prisma.operationalEvent.create({ data: { tenantId: task.tenantId, branchId: task.branchId, workflowId: task.workflowId, eventType: OperationalEventType.WORKFLOW_NOTE_ADDED, title: 'Tarea reasignada automáticamente', description: `${task.title} fue reasignada por vencimiento, disponibilidad o carga.`, payload: this.json({ taskId: task.id, previousOwnerId: task.ownerId, ownerId: candidate }) } });
        reassignment = true;
        metadata.reassignedAt = now.toISOString();
      }
    }
    if (reminder || escalation) await this.prisma.onboardingTask.update({ where: { id: task.id }, data: { metadata: this.json(metadata) } });
    return { reminder, escalation, reassignment };
  }

  private async leastLoadedOwner(tenantId: string, branchId: string, currentOwnerId: string | null, ownerAvailable: boolean) {
    if (ownerAvailable && currentOwnerId) return null;
    const users = await this.prisma.user.findMany({ where: { tenantId, status: UserStatus.ACTIVE, OR: [{ activeBranchId: branchId }, { branchAccesses: { some: { branchId } } }] }, select: { id: true } });
    const candidates = users.map((user) => user.id).filter((id) => id !== currentOwnerId);
    if (!candidates.length) return null;
    const workload = await this.prisma.onboardingTask.groupBy({ by: ['ownerId'], where: { tenantId, branchId, ownerId: { in: candidates }, status: { in: [WorkflowTaskStatus.PENDING, WorkflowTaskStatus.IN_PROGRESS, WorkflowTaskStatus.BLOCKED] } }, _count: { _all: true } });
    const loads = new Map(workload.map((item) => [item.ownerId, item._count._all]));
    return [...candidates].sort((left, right) => (loads.get(left) ?? 0) - (loads.get(right) ?? 0) || left.localeCompare(right))[0];
  }

  private async notify(tenantId: string, userId: string, key: string, title: string, message: string, taskId: string) {
    await this.prisma.notification.upsert({
      where: { tenantId_userId_deduplicationKey: { tenantId, userId, deduplicationKey: key } },
      create: { tenantId, userId, deduplicationKey: key, type: NotificationType.WARNING, category: NotificationCategory.ONBOARDING, title, message, sourceModule: 'onboarding', actionUrl: '/onboarding/documents', payload: this.json({ taskId }) },
      update: { title, message, readAt: null, archivedAt: null, deletedAt: null },
    });
  }

  private metadata(value: Prisma.JsonValue | null): TaskMetadata { return value && typeof value === 'object' && !Array.isArray(value) ? value as TaskMetadata : {}; }
  private json(value: Record<string, unknown>): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
  private hours(name: string, fallback: number) { const value = Number(process.env[name]); return Number.isFinite(value) && value >= 0 ? value : fallback; }
}
