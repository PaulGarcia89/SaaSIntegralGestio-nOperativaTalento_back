import { Injectable } from '@nestjs/common';
import {
  Prisma,
  TrainingCourseStatus,
  TrainingLaunchStatus,
  TrainingOperationKind,
  TrainingOperationStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingCourseSchedulerService } from './training-course-scheduler.service';
import { TrainingLaunchService } from './training-launch.service';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

@Injectable()
export class TrainingOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courseScheduler: TrainingCourseSchedulerService,
    private readonly launchScheduler: TrainingLaunchService,
    private readonly webhooks: TrainingWebhookDeliveryService,
  ) {}

  async overview(tenantId: string) {
    const now = new Date();
    const staleAt = new Date(now.getTime() - 10 * 60_000);
    const [
      dueCourses,
      oldestDueCourse,
      dueLaunches,
      oldestDueLaunch,
      staleLaunchLocks,
      failedWebhooks,
      pendingWebhooks,
      oldestPendingWebhook,
      runs,
      audit,
    ] = await Promise.all([
      this.prisma.trainingCourse.count({
        where: {
          tenantId,
          OR: [
            { status: TrainingCourseStatus.SCHEDULED, scheduledPublishAt: { lte: now } },
            { status: { in: [TrainingCourseStatus.PUBLISHED, TrainingCourseStatus.PAUSED] }, scheduledRetireAt: { lte: now } },
          ],
        },
      }),
      this.prisma.trainingCourse.findFirst({
        where: {
          tenantId,
          OR: [
            { status: TrainingCourseStatus.SCHEDULED, scheduledPublishAt: { lte: now } },
            { status: { in: [TrainingCourseStatus.PUBLISHED, TrainingCourseStatus.PAUSED] }, scheduledRetireAt: { lte: now } },
          ],
        },
        orderBy: [{ scheduledPublishAt: 'asc' }, { scheduledRetireAt: 'asc' }],
        select: { scheduledPublishAt: true, scheduledRetireAt: true },
      }),
      this.prisma.trainingLaunch.count({
        where: { tenantId, status: { in: [TrainingLaunchStatus.SCHEDULED, TrainingLaunchStatus.ACTIVE] }, nextBatchAt: { lte: now } },
      }),
      this.prisma.trainingLaunch.findFirst({
        where: { tenantId, status: { in: [TrainingLaunchStatus.SCHEDULED, TrainingLaunchStatus.ACTIVE] }, nextBatchAt: { lte: now } },
        orderBy: { nextBatchAt: 'asc' },
        select: { nextBatchAt: true },
      }),
      this.prisma.trainingLaunch.count({ where: { tenantId, processingAt: { lt: staleAt } } }),
      this.prisma.trainingWebhookDelivery.count({ where: { tenantId, status: 'FAILED' } }),
      this.prisma.trainingWebhookDelivery.count({ where: { tenantId, status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] } } }),
      this.prisma.trainingWebhookDelivery.findFirst({
        where: { tenantId, status: { in: ['PENDING', 'RETRYING', 'PROCESSING'] } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.trainingOperationRun.findMany({
        where: { tenantId },
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId, action: { startsWith: 'TRAINING_' } },
        select: { id: true, action: true, route: true, method: true, statusCode: true, email: true, correlationId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    const checks = [
      this.check('COURSE_SCHEDULER', 'Publicación programada', dueCourses, this.ageMinutes(this.oldestDate(oldestDueCourse), now), 5),
      this.check('LAUNCH_SCHEDULER', 'Despliegue de campañas', dueLaunches, this.ageMinutes(oldestDueLaunch?.nextBatchAt, now), 5),
      this.check('LAUNCH_LOCKS', 'Bloqueos de campañas', staleLaunchLocks, staleLaunchLocks ? 10 : 0, 1),
      this.check('WEBHOOK_FAILURES', 'Entregas fallidas', failedWebhooks, failedWebhooks ? 10 : 0, 1),
      this.check('WEBHOOK_QUEUE', 'Cola de webhooks', pendingWebhooks, this.ageMinutes(oldestPendingWebhook?.createdAt, now), 10),
    ];
    const critical = checks.filter((item) => item.status === 'CRITICAL').length;
    const warning = checks.filter((item) => item.status === 'WARNING').length;
    return {
      generatedAt: now,
      health: {
        score: Math.max(0, 100 - critical * 25 - warning * 10),
        status: critical ? 'CRITICAL' : warning ? 'WARNING' : 'HEALTHY',
        critical,
        warning,
      },
      checks,
      counters: { dueCourses, dueLaunches, staleLaunchLocks, failedWebhooks, pendingWebhooks },
      runs,
      audit,
    };
  }

  async execute(tenantId: string, actorId: string, kind: TrainingOperationKind) {
    const startedAt = new Date();
    const run = await this.prisma.trainingOperationRun.create({
      data: { tenantId, actorId, kind, status: TrainingOperationStatus.RUNNING, startedAt },
    });
    try {
      const result = await this.executeKind(tenantId, kind);
      return await this.prisma.trainingOperationRun.update({
        where: { id: run.id },
        data: {
          status: TrainingOperationStatus.SUCCEEDED,
          result: result as Prisma.InputJsonValue,
          completedAt: new Date(),
          durationMs: Date.now() - startedAt.getTime(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : 'Training operation failed';
      await this.prisma.trainingOperationRun.update({
        where: { id: run.id },
        data: { status: TrainingOperationStatus.FAILED, error: message, completedAt: new Date(), durationMs: Date.now() - startedAt.getTime() },
      });
      throw error;
    }
  }

  private async executeKind(tenantId: string, kind: TrainingOperationKind): Promise<Record<string, unknown>> {
    const now = new Date();
    if (kind === TrainingOperationKind.PROCESS_DUE_COURSES) return this.courseScheduler.processDueCourses(now, tenantId);
    if (kind === TrainingOperationKind.PROCESS_DUE_LAUNCHES) return this.launchScheduler.processDueLaunches(now, tenantId);
    if (kind === TrainingOperationKind.RECOVER_WEBHOOKS) return this.webhooks.recoverPending(now, tenantId);
    if (kind === TrainingOperationKind.CLEAR_STALE_LAUNCH_LOCKS) {
      const released = await this.prisma.trainingLaunch.updateMany({
        where: { tenantId, processingAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
        data: { processingAt: null },
      });
      return { released: released.count };
    }
    const failed = await this.prisma.trainingWebhookDelivery.findMany({
      where: { tenantId, status: 'FAILED' },
      select: { id: true },
      take: 100,
    });
    const retried = await Promise.all(failed.map((item) => this.webhooks.retry(tenantId, item.id)));
    return { requested: failed.length, queued: retried.filter((item) => item.queued).length };
  }

  private check(code: string, label: string, count: number, ageMinutes: number, warningAfterMinutes: number) {
    const status = count === 0 ? 'HEALTHY' : ageMinutes >= warningAfterMinutes * 3 ? 'CRITICAL' : 'WARNING';
    return { code, label, status, count, ageMinutes, targetMinutes: warningAfterMinutes };
  }

  private ageMinutes(date: Date | null | undefined, now: Date) {
    return date ? Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000)) : 0;
  }

  private oldestDate(item: { scheduledPublishAt: Date | null; scheduledRetireAt: Date | null } | null) {
    if (!item) return null;
    return [item.scheduledPublishAt, item.scheduledRetireAt].filter((date): date is Date => Boolean(date)).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  }
}
