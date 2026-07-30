import { Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  AutomationExecutionStatus,
  InventoryAssetStatus,
  NotificationCategory,
  NotificationDeliveryStatus,
  OutboxEventStatus,
  SubscriptionStatus,
  TrainingProgressStatus,
  WorkflowBlockerSeverity,
  WorkflowTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

type Tone = 'info' | 'success' | 'warning' | 'danger';

type OperationalItem = {
  id: string;
  kind: 'task' | 'alert';
  title: string;
  description: string;
  tone: Tone;
  module: string;
  href: string;
  dueAt: string | null;
  occurredAt: string;
  recordLabel: string | null;
};

type Metric = {
  key: string;
  label: string;
  value: number;
  tone: Tone;
  href: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async operational(actor: JwtPayload) {
    const generatedAt = new Date();
    const global = actor.isSuperAdmin && actor.isGlobalContext;
    const role = this.role(actor);
    const data = global
      ? await this.globalDashboard(generatedAt)
      : await this.tenantDashboard(actor, role, generatedAt);
    const prioritized = [...data.alerts, ...data.tasks].sort(
      (a, b) => this.priority(b) - this.priority(a),
    );

    return {
      role,
      scope: global ? 'GLOBAL' : actor.activeBranchId ? 'BRANCH' : 'TENANT',
      period: {
        label: 'Estado actual y próximos 7 días',
        from: generatedAt.toISOString(),
        to: new Date(generatedAt.getTime() + 7 * 86_400_000).toISOString(),
      },
      source: 'Datos operativos persistentes',
      generatedAt: generatedAt.toISOString(),
      metrics: data.metrics,
      tasks: data.tasks.slice(0, 12),
      alerts: data.alerts.slice(0, 8),
      nextAction: prioritized[0] ?? null,
    };
  }

  private async globalDashboard(now: Date) {
    const [
      activeTenants,
      subscriptionsAtRisk,
      failedAutomations,
      failedDeliveries,
      pendingEvents,
      recentAutomation,
      recentDelivery,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.subscription.count({
        where: { status: { in: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.EXPIRED] } },
      }),
      this.prisma.automationExecution.count({
        where: { status: AutomationExecutionStatus.FAILED },
      }),
      this.prisma.notificationDelivery.count({
        where: { status: NotificationDeliveryStatus.DEAD_LETTER },
      }),
      this.prisma.outboxEvent.count({
        where: { status: { in: [OutboxEventStatus.PENDING, OutboxEventStatus.FAILED] } },
      }),
      this.prisma.automationExecution.findMany({
        where: { status: AutomationExecutionStatus.FAILED },
        include: { tenant: { select: { name: true } }, rule: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.notificationDelivery.findMany({
        where: { status: NotificationDeliveryStatus.DEAD_LETTER },
        include: { tenant: { select: { name: true } }, notification: { select: { title: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
    ]);

    const alerts: OperationalItem[] = [
      ...recentAutomation.map((item) =>
        this.item({
          id: item.id,
          kind: 'alert',
          title: 'Automatización fallida',
          description: `${item.rule.name} · ${item.tenant.name}`,
          tone: 'danger',
          module: 'Automatizaciones',
          href: '/admin/queues',
          occurredAt: item.updatedAt,
          recordLabel: item.tenant.name,
        }),
      ),
      ...recentDelivery.map((item) =>
        this.item({
          id: item.id,
          kind: 'alert',
          title: 'Entrega en dead letter',
          description: `${item.notification.title} · ${item.tenant.name}`,
          tone: 'danger',
          module: 'Notificaciones',
          href: '/notifications?tab=deliveries',
          occurredAt: item.updatedAt,
          recordLabel: item.tenant.name,
        }),
      ),
    ];
    return {
      metrics: [
        this.metric('tenants', 'Empresas activas', activeTenants, 'info', '/admin/tenants'),
        this.metric('subscriptions', 'Suscripciones en riesgo', subscriptionsAtRisk, subscriptionsAtRisk ? 'danger' : 'success', '/admin/subscription'),
        this.metric('events', 'Eventos pendientes', pendingEvents, pendingEvents ? 'warning' : 'success', '/admin/queues'),
        this.metric('automation', 'Fallos de automatización', failedAutomations + failedDeliveries, failedAutomations + failedDeliveries ? 'danger' : 'success', '/admin/queues'),
      ],
      alerts,
      tasks: subscriptionsAtRisk
        ? [
            this.item({
              id: 'subscriptions-at-risk',
              kind: 'task',
              title: 'Revisar suscripciones en riesgo',
              description: `${subscriptionsAtRisk} empresas requieren revisión de servicio o cobro.`,
              tone: 'danger',
              module: 'Gobierno de plataforma',
              href: '/admin/subscription',
              occurredAt: now,
            }),
          ]
        : [],
    };
  }

  private async tenantDashboard(actor: JwtPayload, role: string, now: Date) {
    const tenantId = actor.activeTenantId ?? actor.tenantId;
    const branchId = actor.activeBranchId;
    const branchWhere = branchId ? { branchId } : {};
    const applicationBranchWhere = branchId ? { vacancy: { branchId } } : {};
    const isEmployee = ['EMPLEADO', 'EMPLOYEE', 'CANDIDATO', 'CANDIDATE'].includes(role);
    const isInterviewer = role.includes('ENTREVIST');
    const isInventory = role.includes('INVENT');
    const isInstructor = role.includes('INSTRUCTOR');
    const userScope = isEmployee ? { userId: actor.sub } : {};
    const interviewScope = isInterviewer ? { interviewerUserId: actor.sub } : {};
    const horizon = new Date(now.getTime() + 7 * 86_400_000);

    const [
      unreadCritical,
      criticalNotifications,
      pendingApplications,
      applications,
      upcomingInterviews,
      interviews,
      openVacancies,
      overdueOnboarding,
      onboardingTasks,
      inventoryAttention,
      inventoryAssets,
      overdueTraining,
      trainingAssignments,
      subscription,
    ] = await Promise.all([
      this.prisma.notification.count({
        where: {
          tenantId,
          OR: [{ userId: actor.sub }, { userId: null }],
          category: { in: [NotificationCategory.SECURITY, NotificationCategory.BILLING] },
          readAt: null,
          archivedAt: null,
          deletedAt: null,
        },
      }),
      this.prisma.notification.findMany({
        where: {
          tenantId,
          OR: [{ userId: actor.sub }, { userId: null }],
          category: { in: [NotificationCategory.SECURITY, NotificationCategory.BILLING] },
          readAt: null,
          archivedAt: null,
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
      isEmployee || isInstructor || isInventory
        ? Promise.resolve(0)
        : this.prisma.vacancyApplication.count({
            where: { tenantId, ...applicationBranchWhere, status: ApplicationStatus.SUBMITTED },
          }),
      isEmployee || isInstructor || isInventory
        ? Promise.resolve([])
        : this.prisma.vacancyApplication.findMany({
            where: { tenantId, ...applicationBranchWhere, status: ApplicationStatus.SUBMITTED },
            include: {
              candidate: { select: { id: true, fullName: true } },
              vacancy: { select: { title: true } },
            },
            orderBy: { appliedAt: 'asc' },
            take: 5,
          }),
      isEmployee || isInstructor || isInventory
        ? Promise.resolve(0)
        : this.prisma.applicationInterview.count({
            where: {
              tenantId,
              ...interviewScope,
              startsAt: { gte: now, lte: horizon },
              status: { in: ['SCHEDULED', 'CONFIRMED'] },
              application: branchId ? { vacancy: { branchId } } : undefined,
            },
          }),
      isEmployee || isInstructor || isInventory
        ? Promise.resolve([])
        : this.prisma.applicationInterview.findMany({
            where: {
              tenantId,
              ...interviewScope,
              startsAt: { gte: now, lte: horizon },
              status: { in: ['SCHEDULED', 'CONFIRMED'] },
              application: branchId ? { vacancy: { branchId } } : undefined,
            },
            include: {
              application: {
                include: {
                  candidate: { select: { id: true, fullName: true } },
                  vacancy: { select: { title: true } },
                },
              },
            },
            orderBy: { startsAt: 'asc' },
            take: 5,
          }),
      isEmployee ? Promise.resolve(0) : this.prisma.vacancy.count({ where: { tenantId, ...branchWhere, status: 'OPEN' } }),
      isEmployee || isInventory || isInstructor || isInterviewer
        ? Promise.resolve(0)
        : this.prisma.onboardingTask.count({
            where: {
              tenantId,
              ...branchWhere,
              status: { notIn: [WorkflowTaskStatus.COMPLETED, WorkflowTaskStatus.CANCELLED] },
              OR: [{ dueDate: { lt: now } }, { blockingReason: { not: null } }],
            },
          }),
      isEmployee || isInventory || isInstructor || isInterviewer
        ? Promise.resolve([])
        : this.prisma.onboardingTask.findMany({
            where: {
              tenantId,
              ...branchWhere,
              status: { notIn: [WorkflowTaskStatus.COMPLETED, WorkflowTaskStatus.CANCELLED] },
              OR: [{ dueDate: { lt: now } }, { blockingReason: { not: null } }],
            },
            include: { employee: { select: { name: true } } },
            orderBy: [{ dueDate: 'asc' }, { updatedAt: 'desc' }],
            take: 5,
          }),
      isEmployee || isInstructor || isInterviewer
        ? Promise.resolve(0)
        : this.prisma.inventoryAsset.count({
            where: {
              tenantId,
              ...branchWhere,
              status: { in: [InventoryAssetStatus.RETURN_PENDING, InventoryAssetStatus.MAINTENANCE, InventoryAssetStatus.LOST] },
            },
          }),
      isEmployee || isInstructor || isInterviewer
        ? Promise.resolve([])
        : this.prisma.inventoryAsset.findMany({
            where: {
              tenantId,
              ...branchWhere,
              status: { in: [InventoryAssetStatus.RETURN_PENDING, InventoryAssetStatus.MAINTENANCE, InventoryAssetStatus.LOST] },
            },
            include: { item: { select: { name: true } }, employee: { select: { name: true } } },
            orderBy: { updatedAt: 'desc' },
            take: 5,
          }),
      isInventory || isInterviewer
        ? Promise.resolve(0)
        : this.prisma.trainingAssignment.count({
            where: {
              tenantId,
              ...userScope,
              status: { in: [TrainingProgressStatus.NOT_STARTED, TrainingProgressStatus.IN_PROGRESS, TrainingProgressStatus.OVERDUE] },
              dueAt: { lt: now },
            },
          }),
      isInventory || isInterviewer
        ? Promise.resolve([])
        : this.prisma.trainingAssignment.findMany({
            where: {
              tenantId,
              ...userScope,
              status: { in: [TrainingProgressStatus.NOT_STARTED, TrainingProgressStatus.IN_PROGRESS, TrainingProgressStatus.OVERDUE] },
              OR: [{ dueAt: { lt: horizon } }, { dueAt: null }],
            },
            include: { user: { select: { firstName: true, lastName: true } }, course: { select: { title: true } }, curriculum: { select: { title: true } } },
            orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
            take: 5,
          }),
      this.prisma.subscription.findUnique({ where: { tenantId } }),
    ]);

    const alerts: OperationalItem[] = [
      ...criticalNotifications.map((item) =>
        this.item({
          id: item.id,
          kind: 'alert',
          title: item.title,
          description: item.message,
          tone: item.category === NotificationCategory.SECURITY ? 'danger' : 'warning',
          module: 'Notificaciones',
          href: item.actionUrl ?? '/notifications',
          occurredAt: item.createdAt,
        }),
      ),
      ...onboardingTasks.map((item) =>
        this.item({
          id: item.id,
          kind: 'alert',
          title: item.dueDate && item.dueDate < now ? 'Tarea de incorporación vencida' : 'Incorporación bloqueada',
          description: `${item.title} · ${item.employee.name}`,
          tone: item.dueDate && item.dueDate < now ? 'danger' : 'warning',
          module: 'Incorporación',
          href: `/onboarding/documents?flowId=${item.onboardingFlowId}`,
          dueAt: item.dueDate,
          occurredAt: item.updatedAt,
          recordLabel: item.employee.name,
        }),
      ),
      ...inventoryAssets.map((item) =>
        this.item({
          id: item.id,
          kind: 'alert',
          title: item.status === InventoryAssetStatus.LOST ? 'Activo reportado como perdido' : 'Activo requiere atención',
          description: `${item.item.name}${item.employee ? ` · ${item.employee.name}` : ''}`,
          tone: item.status === InventoryAssetStatus.LOST ? 'danger' : 'warning',
          module: 'Inventario',
          href: `/inventory?assetId=${item.id}`,
          occurredAt: item.updatedAt,
          recordLabel: item.assetTag,
        }),
      ),
    ];

    const tasks: OperationalItem[] = [
      ...applications.map((item) =>
        this.item({
          id: item.id,
          kind: 'task',
          title: 'Revisar nueva postulación',
          description: `${item.candidate.fullName} · ${item.vacancy.title}`,
          tone: 'info',
          module: 'Reclutamiento',
          href: `/ats/candidates/${item.candidate.id}`,
          occurredAt: item.appliedAt,
          recordLabel: item.candidate.fullName,
        }),
      ),
      ...interviews.map((item) =>
        this.item({
          id: item.id,
          kind: 'task',
          title: 'Preparar entrevista',
          description: `${item.application.candidate.fullName} · ${item.application.vacancy.title}`,
          tone: 'info',
          module: 'Entrevistas',
          href: `/ats/candidates/${item.application.candidate.id}`,
          dueAt: item.startsAt,
          occurredAt: item.createdAt,
          recordLabel: item.title,
        }),
      ),
      ...trainingAssignments.map((item) =>
        this.item({
          id: item.id,
          kind: 'task',
          title: item.dueAt && item.dueAt < now ? 'Capacitación vencida' : 'Continuar capacitación',
          description: `${item.course?.title ?? item.curriculum?.title ?? 'Ruta asignada'} · ${item.user.firstName} ${item.user.lastName}`,
          tone: item.dueAt && item.dueAt < now ? 'danger' : 'info',
          module: 'Aprendizaje',
          href: `/training?assignmentId=${item.id}`,
          dueAt: item.dueAt,
          occurredAt: item.updatedAt,
          recordLabel: `${item.user.firstName} ${item.user.lastName}`,
        }),
      ),
    ];

    const subscriptionAtRisk =
      subscription &&
      (subscription.status === SubscriptionStatus.PAST_DUE ||
        subscription.status === SubscriptionStatus.EXPIRED);
    if (subscriptionAtRisk) {
      alerts.unshift(
        this.item({
          id: subscription.id,
          kind: 'alert',
          title: 'Suscripción requiere atención',
          description: 'El estado actual puede limitar funciones de la empresa.',
          tone: 'danger',
          module: 'Suscripción',
          href: '/admin/company/subscription',
          occurredAt: subscription.updatedAt,
        }),
      );
    }

    const metrics: Metric[] = isEmployee
      ? [
          this.metric('training', 'Mis capacitaciones pendientes', trainingAssignments.length, overdueTraining ? 'danger' : 'info', '/training'),
          this.metric('alerts', 'Alertas críticas', unreadCritical, unreadCritical ? 'danger' : 'success', '/notifications'),
        ]
      : [
          this.metric('applications', 'Postulaciones por revisar', pendingApplications, pendingApplications ? 'warning' : 'success', '/ats/pipeline?stage=SUBMITTED'),
          this.metric('interviews', 'Entrevistas próximas', upcomingInterviews, 'info', '/ats/interviews'),
          this.metric('onboarding', 'Incorporaciones en riesgo', overdueOnboarding, overdueOnboarding ? 'danger' : 'success', '/onboarding/documents'),
          this.metric('inventory', 'Activos con incidencias', inventoryAttention, inventoryAttention ? 'warning' : 'success', '/inventory'),
          this.metric('vacancies', 'Vacantes activas', openVacancies, 'info', '/ats/vacancies'),
          this.metric('training', 'Capacitaciones vencidas', overdueTraining, overdueTraining ? 'danger' : 'success', '/training'),
        ];
    return { metrics, alerts, tasks };
  }

  private item(input: {
    id: string;
    kind: 'task' | 'alert';
    title: string;
    description: string;
    tone: Tone;
    module: string;
    href: string;
    dueAt?: Date | null;
    occurredAt: Date;
    recordLabel?: string | null;
  }): OperationalItem {
    return {
      ...input,
      dueAt: input.dueAt?.toISOString() ?? null,
      occurredAt: input.occurredAt.toISOString(),
      recordLabel: input.recordLabel ?? null,
    };
  }

  private metric(key: string, label: string, value: number, tone: Tone, href: string): Metric {
    return { key, label, value, tone, href };
  }

  private priority(item: OperationalItem) {
    const tone = { danger: 400, warning: 300, info: 200, success: 100 }[item.tone];
    const due = item.dueAt ? Math.max(0, 100 - (new Date(item.dueAt).getTime() - Date.now()) / 3_600_000) : 0;
    return tone + due;
  }

  private role(actor: JwtPayload) {
    return (actor.role ?? actor.roles[0] ?? (actor.isSuperAdmin ? 'ADMIN_SAAS' : 'USER'))
      .trim()
      .toUpperCase();
  }
}
