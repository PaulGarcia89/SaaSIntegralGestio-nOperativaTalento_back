import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationType, TrainingProgressStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TrainingWebhookDeliveryService } from './training-webhook-delivery.service';

@Injectable()
export class TrainingAssignmentReminderService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TrainingAssignmentReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: TrainingWebhookDeliveryService,
  ) {}

  onModuleInit() {
    void this.processReminders();
    this.timer = setInterval(() => void this.processReminders(), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async processReminders(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const policies = await this.prisma.trainingCompliancePolicy.findMany({
        where: { isActive: true },
      });
      const policyByCourse = new Map(
        policies.map((policy) => [`${policy.tenantId}:${policy.courseId}`, policy]),
      );
      const maximumReminderDays = Math.max(
        2,
        ...policies.flatMap((policy) => policy.reminderDays),
      );
      const limit = new Date(now.getTime() + maximumReminderDays * 24 * 60 * 60 * 1000);
      const since = new Date(now.getTime() - 20 * 60 * 60 * 1000);
      const assignments = await this.prisma.trainingAssignment.findMany({
        where: {
          dueAt: { gt: now, lte: limit },
          status: { not: TrainingProgressStatus.COMPLETED },
        },
        include: { course: { select: { title: true } } },
        take: 500,
      });

      let sent = 0;
      for (const assignment of assignments) {
        const policy = assignment.courseId
          ? policyByCourse.get(`${assignment.tenantId}:${assignment.courseId}`)
          : null;
        const daysRemaining = assignment.dueAt
          ? Math.ceil((assignment.dueAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        const reminderDays = policy?.reminderDays ?? [2];
        if (daysRemaining === null || !reminderDays.includes(daysRemaining)) continue;
        const duplicate = await this.prisma.notification.findFirst({
          where: {
            tenantId: assignment.tenantId,
            userId: assignment.userId,
            createdAt: { gte: since },
            payload: {
              path: ['assignmentId'],
              equals: assignment.id,
            },
          },
          select: { id: true },
        });
        if (duplicate) continue;
        await this.prisma.notification.create({
          data: {
            tenantId: assignment.tenantId,
            userId: assignment.userId,
            type: NotificationType.WARNING,
            title: 'Curso próximo a vencer',
            message: `Tu curso “${assignment.course?.title ?? 'asignado'}” vence pronto.`,
            payload: {
              kind: 'TRAINING_DUE_REMINDER',
              assignmentId: assignment.id,
              courseId: assignment.courseId,
              dueAt: assignment.dueAt?.toISOString(),
            },
          },
        });
        sent += 1;
      }
      await this.processRenewals(now, policies);
      await this.processCertificateReminders(now, since);
      if (sent) this.logger.log(`Sent ${sent} training due-date reminders`);
    } catch (error) {
      this.logger.error('Unable to process training reminders', error);
    } finally {
      this.running = false;
    }
  }

  private async processCertificateReminders(now: Date, since: Date) {
    const policies = await this.prisma.trainingCertificationPolicy.findMany({
      where: { isEnabled: true, validityDays: { not: null } },
    });
    if (!policies.length) return;
    const maximumReminderDays = Math.max(
      1,
      ...policies.flatMap((policy) => policy.reminderDays),
    );
    const certificates = await this.prisma.trainingCertificate.findMany({
      where: {
        policyId: { in: policies.map((policy) => policy.id) },
        expiresAt: {
          gt: now,
          lte: new Date(now.getTime() + maximumReminderDays * 86_400_000),
        },
        revokedAt: null,
        supersededAt: null,
      },
      include: { course: { select: { title: true } } },
      take: 500,
    });
    const policyById = new Map(policies.map((policy) => [policy.id, policy]));
    for (const certificate of certificates) {
      const policy = certificate.policyId ? policyById.get(certificate.policyId) : null;
      const daysRemaining = certificate.expiresAt
        ? Math.ceil((certificate.expiresAt.getTime() - now.getTime()) / 86_400_000)
        : null;
      if (!policy || daysRemaining === null || !policy.reminderDays.includes(daysRemaining)) continue;
      const duplicate = await this.prisma.notification.findFirst({
        where: {
          tenantId: certificate.tenantId,
          userId: certificate.userId,
          createdAt: { gte: since },
          payload: { path: ['certificateId'], equals: certificate.id },
        },
        select: { id: true },
      });
      if (duplicate) continue;
      await this.prisma.notification.create({
        data: {
          tenantId: certificate.tenantId,
          userId: certificate.userId,
          type: NotificationType.WARNING,
          title: 'Certificado próximo a vencer',
          message: `Tu certificado de “${certificate.course?.title ?? 'capacitación'}” vence en ${daysRemaining} días.`,
          payload: {
            kind: 'TRAINING_CERTIFICATE_EXPIRY_REMINDER',
            certificateId: certificate.id,
            courseId: certificate.courseId,
            expiresAt: certificate.expiresAt?.toISOString(),
            renewalEligible: daysRemaining <= policy.renewalWindowDays,
          },
        },
      });
      await this.webhooks.publish(certificate.tenantId, 'certificate.expiry_reminder', {
        certificateId: certificate.id,
        userId: certificate.userId,
        courseId: certificate.courseId,
        daysRemaining,
      }, `certificate-expiry-${certificate.id}-${daysRemaining}`);
    }
  }

  private async processRenewals(
    now: Date,
    policies: Array<{
      tenantId: string;
      courseId: string;
      dueDays: number;
      renewalDays: number | null;
    }>,
  ) {
    for (const policy of policies.filter((item) => item.renewalDays)) {
      const threshold = new Date(
        now.getTime() - policy.renewalDays! * 24 * 60 * 60 * 1000,
      );
      const assignments = await this.prisma.trainingAssignment.findMany({
        where: {
          tenantId: policy.tenantId,
          courseId: policy.courseId,
          status: TrainingProgressStatus.COMPLETED,
          completedAt: { lte: threshold },
        },
        include: { course: { select: { title: true } } },
        take: 500,
      });
      for (const assignment of assignments) {
        const dueAt = new Date(now.getTime() + policy.dueDays * 24 * 60 * 60 * 1000);
        await this.prisma.$transaction([
          this.prisma.trainingAssignment.update({
            where: { id: assignment.id },
            data: {
              status: TrainingProgressStatus.NOT_STARTED,
              progressPercent: 0,
              startAt: now,
              dueAt,
              completedAt: null,
              sourceType: 'RULE',
            },
          }),
          this.prisma.trainingProgress.updateMany({
            where: {
              tenantId: assignment.tenantId,
              userId: assignment.userId,
              courseId: assignment.courseId,
            },
            data: {
              status: TrainingProgressStatus.NOT_STARTED,
              progressPercent: 0,
              startedAt: null,
              completedAt: null,
              lastActivityAt: now,
            },
          }),
          this.prisma.trainingCertificate.updateMany({
            where: {
              tenantId: assignment.tenantId,
              userId: assignment.userId,
              courseId: assignment.courseId,
              revokedAt: null,
            },
            data: { expiresAt: now },
          }),
          this.prisma.notification.create({
            data: {
              tenantId: assignment.tenantId,
              userId: assignment.userId,
              type: NotificationType.WARNING,
              title: 'Renovación formativa requerida',
              message: `Debes renovar el curso “${assignment.course?.title ?? 'asignado'}” antes de la nueva fecha límite.`,
              payload: {
                kind: 'TRAINING_RENEWAL_REQUIRED',
                assignmentId: assignment.id,
                courseId: assignment.courseId,
                dueAt: dueAt.toISOString(),
              },
            },
          }),
        ]);
        await this.webhooks.publish(
          assignment.tenantId,
          'training.renewal_required',
          {
            assignmentId: assignment.id,
            userId: assignment.userId,
            courseId: assignment.courseId,
            dueAt: dueAt.toISOString(),
          },
          `training-renewal-${assignment.id}-${dueAt.toISOString()}`,
        );
      }
    }
  }
}
