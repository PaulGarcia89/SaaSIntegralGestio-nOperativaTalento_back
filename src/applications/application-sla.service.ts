import { Injectable } from '@nestjs/common';
import { ApplicationTimelineEventType, NotificationCategory, NotificationType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class ApplicationSlaService {
  constructor(private readonly prisma: PrismaService) {}

  async processDue(limit = 250) {
    const now = new Date();
    const applications = await this.prisma.vacancyApplication.findMany({
      where: {
        status: { notIn: ['HIRED', 'REJECTED', 'WITHDRAWN'] },
        currentStage: { slaHours: { not: null } },
      },
      include: {
        candidate: { select: { fullName: true } },
        currentStage: true,
        vacancy: { include: { responsibles: true } },
      },
      orderBy: { stageEnteredAt: 'asc' },
      take: limit,
    });
    const result = { inspected: applications.length, warned: 0, escalated: 0, reassigned: 0 };

    for (const application of applications) {
      const stage = application.currentStage!;
      const dueAt = new Date(application.stageEnteredAt.getTime() + stage.slaHours! * 3_600_000);
      const warningAt = new Date(dueAt.getTime() - stage.slaWarningHoursBefore * 3_600_000);
      const escalationAt = new Date(dueAt.getTime() + stage.slaEscalationHours * 3_600_000);
      const recruiters = application.vacancy.responsibles.filter((item) => item.role === 'RECRUITER' || item.role === 'OWNER');
      const warningRecipients = application.assignedRecruiterId ? [application.assignedRecruiterId] : recruiters.map((item) => item.userId);

      if (!application.slaWarningSentAt && now >= warningAt) {
        const updated = await this.prisma.vacancyApplication.updateMany({ where: { id: application.id, slaWarningSentAt: null }, data: { slaWarningSentAt: now } });
        if (updated.count) {
          await this.record(application, ApplicationTimelineEventType.SLA_WARNING, warningRecipients, 'SLA próximo a vencer', `La etapa ${stage.name} de ${application.candidate.fullName} vence el ${dueAt.toISOString()}.`, dueAt);
          result.warned += 1;
        }
      }

      if (!application.slaEscalatedAt && now >= escalationAt) {
        const escalationRecipients = application.vacancy.responsibles.filter((item) => item.role === 'OWNER' || item.role === 'HIRING_MANAGER').map((item) => item.userId);
        const updated = await this.prisma.vacancyApplication.updateMany({ where: { id: application.id, slaEscalatedAt: null }, data: { slaEscalatedAt: now } });
        if (updated.count) {
          await this.record(application, ApplicationTimelineEventType.SLA_ESCALATED, escalationRecipients.length ? escalationRecipients : warningRecipients, 'SLA de reclutamiento vencido', `${application.candidate.fullName} superó el SLA de la etapa ${stage.name}.`, dueAt);
          result.escalated += 1;
        }
      }

      if (stage.autoReassignAfterHours !== null && !application.slaReassignedAt && now >= new Date(dueAt.getTime() + stage.autoReassignAfterHours * 3_600_000)) {
        const replacement = recruiters.find((item) => item.userId !== application.assignedRecruiterId);
        if (replacement) {
          const updated = await this.prisma.vacancyApplication.updateMany({ where: { id: application.id, slaReassignedAt: null }, data: { assignedRecruiterId: replacement.userId, slaReassignedAt: now } });
          if (updated.count) {
            await this.record(application, ApplicationTimelineEventType.SLA_REASSIGNED, [replacement.userId], 'Postulación reasignada por SLA', `${application.candidate.fullName} fue reasignado automáticamente por vencimiento de SLA.`, dueAt, replacement.userId);
            result.reassigned += 1;
          }
        }
      }
    }
    return result;
  }

  private async record(
    application: { id: string; tenantId: string; assignedRecruiterId: string | null },
    type: ApplicationTimelineEventType,
    recipients: string[],
    title: string,
    message: string,
    dueAt: Date,
    assignedRecruiterId?: string,
  ) {
    const uniqueRecipients = [...new Set(recipients)];
    await this.prisma.$transaction(async (tx) => {
      await tx.applicationTimelineEvent.create({ data: {
        tenantId: application.tenantId,
        applicationId: application.id,
        type,
        occurredAt: new Date(),
        actorType: 'SYSTEM',
        actorDisplayName: 'Automatización SLA',
        source: 'ATS_SLA',
        note: message,
        previousValue: { assignedRecruiterId: application.assignedRecruiterId },
        newValue: { assignedRecruiterId: assignedRecruiterId ?? application.assignedRecruiterId },
        metadata: { dueAt: dueAt.toISOString() },
      } });
      if (uniqueRecipients.length) await tx.notification.createMany({ data: uniqueRecipients.map((userId) => ({
        tenantId: application.tenantId,
        userId,
        type: NotificationType.WARNING,
        category: NotificationCategory.ATS,
        title,
        message,
        sourceModule: 'ats-sla',
        actionUrl: `/ats/candidates/${application.id}`,
        deduplicationKey: `ats-sla:${type}:${application.id}`,
        payload: { applicationId: application.id, dueAt: dueAt.toISOString(), eventType: type },
      })), skipDuplicates: true });
    });
  }
}
