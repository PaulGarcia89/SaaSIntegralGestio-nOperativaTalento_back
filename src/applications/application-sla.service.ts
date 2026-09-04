import { message, MessageCode } from '../localization/catalogs/catalog';
import { SupportedLocale } from '../localization/localization.service';
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
          await this.record(application, ApplicationTimelineEventType.SLA_WARNING, warningRecipients, 'application_sla.warning_title', 'application_sla.warning_detail', { stage: stage.name, candidate: application.candidate.fullName, dueAt: dueAt.toISOString() }, dueAt);
          result.warned += 1;
        }
      }

      if (!application.slaEscalatedAt && now >= escalationAt) {
        const escalationRecipients = application.vacancy.responsibles.filter((item) => item.role === 'OWNER' || item.role === 'HIRING_MANAGER').map((item) => item.userId);
        const updated = await this.prisma.vacancyApplication.updateMany({ where: { id: application.id, slaEscalatedAt: null }, data: { slaEscalatedAt: now } });
        if (updated.count) {
          await this.record(application, ApplicationTimelineEventType.SLA_ESCALATED, escalationRecipients.length ? escalationRecipients : warningRecipients, 'application_sla.escalated_title', 'application_sla.escalated_detail', { candidate: application.candidate.fullName, stage: stage.name }, dueAt);
          result.escalated += 1;
        }
      }

      if (stage.autoReassignAfterHours !== null && !application.slaReassignedAt && now >= new Date(dueAt.getTime() + stage.autoReassignAfterHours * 3_600_000)) {
        const replacement = recruiters.find((item) => item.userId !== application.assignedRecruiterId);
        if (replacement) {
          const updated = await this.prisma.vacancyApplication.updateMany({ where: { id: application.id, slaReassignedAt: null }, data: { assignedRecruiterId: replacement.userId, slaReassignedAt: now } });
          if (updated.count) {
            await this.record(application, ApplicationTimelineEventType.SLA_REASSIGNED, [replacement.userId], 'application_sla.reassigned_title', 'application_sla.reassigned_detail', { candidate: application.candidate.fullName }, dueAt, replacement.userId);
            result.reassigned += 1;
          }
        }
      }
    }
    return result;
  }

  /**
   * Este proceso corre en segundo plano, sin peticion HTTP, asi que no hay
   * `request.locale`. Cada notificacion se guarda por destinatario, de modo que
   * se renderiza en el idioma de CADA usuario (`User.preferredLocale`). La nota
   * de la linea de tiempo es una sola fila de auditoria compartida: se deja en
   * el idioma por defecto del sistema.
   */
  private async record(
    application: { id: string; tenantId: string; assignedRecruiterId: string | null },
    type: ApplicationTimelineEventType,
    recipients: string[],
    titleCode: MessageCode,
    detailCode: MessageCode,
    params: Record<string, string | number>,
    dueAt: Date,
    assignedRecruiterId?: string,
  ) {
    const uniqueRecipients = [...new Set(recipients)];
    const locales = uniqueRecipients.length
      ? await this.prisma.user.findMany({
          // El filtro por tenant es obligatorio aunque los ids vengan de la
          // propia vacante: mantiene el aislamiento multiempresa verificado por
          // test/architecture/tenant-scope.spec.ts.
          where: { id: { in: uniqueRecipients }, tenantId: application.tenantId },
          select: { id: true, preferredLocale: true },
        })
      : [];
    const localeOf = (userId: string): SupportedLocale =>
      locales.find((user) => user.id === userId)?.preferredLocale === 'en' ? 'en' : 'es';
    const note = message(detailCode, 'es', 'es', params);
    await this.prisma.$transaction(async (tx) => {
      await tx.applicationTimelineEvent.create({ data: {
        tenantId: application.tenantId,
        applicationId: application.id,
        type,
        occurredAt: new Date(),
        actorType: 'SYSTEM',
        actorDisplayName: 'Automatización SLA',
        source: 'ATS_SLA',
        note,
        previousValue: { assignedRecruiterId: application.assignedRecruiterId },
        newValue: { assignedRecruiterId: assignedRecruiterId ?? application.assignedRecruiterId },
        metadata: { dueAt: dueAt.toISOString() },
      } });
      if (uniqueRecipients.length) await tx.notification.createMany({ data: uniqueRecipients.map((userId) => ({
        tenantId: application.tenantId,
        userId,
        type: NotificationType.WARNING,
        category: NotificationCategory.ATS,
        title: message(titleCode, localeOf(userId)),
        message: message(detailCode, localeOf(userId), 'es', params),
        sourceModule: 'ats-sla',
        actionUrl: `/ats/candidates/${application.id}`,
        deduplicationKey: `ats-sla:${type}:${application.id}`,
        payload: { applicationId: application.id, dueAt: dueAt.toISOString(), eventType: type },
      })), skipDuplicates: true });
    });
  }
}
