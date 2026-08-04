import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  NotificationDigestFrequency,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { DomainEventDto, DomainEventName } from '../domain-events/domain-event.constants';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationDeliveriesDto } from './dto/list-notification-deliveries.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { CommunicationDeliveryService } from './communication-delivery.service';

const CATEGORIES = Object.values(NotificationCategory);
const CRITICAL_CATEGORIES = new Set<NotificationCategory>([
  NotificationCategory.SECURITY,
  NotificationCategory.BILLING,
]);

type DomainNotificationDefinition = {
  category: NotificationCategory;
  type: NotificationType;
  title: string;
  message: string;
  sourceModule: string;
  actionUrl: string;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly deliveryProvider?: CommunicationDeliveryService) {}

  async createExternalEmail(input: {
    tenantId: string;
    recipientEmail: string;
    title: string;
    message: string;
    actionUrl?: string;
    correlationId?: string;
    deduplicationKey: string;
  }) {
    const existing = await this.prisma.notification.findFirst({
      where: { tenantId: input.tenantId, userId: null, deduplicationKey: input.deduplicationKey },
      include: { deliveries: true },
    });
    if (existing) return existing;
    return this.prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: null,
          type: NotificationType.INFO,
          category: NotificationCategory.SECURITY,
          title: input.title,
          message: input.message,
          sourceModule: 'candidate-portal',
          actionUrl: input.actionUrl,
          correlationId: input.correlationId,
          deduplicationKey: input.deduplicationKey,
        },
      });
      await tx.notificationDelivery.create({
        data: {
          tenantId: input.tenantId,
          userId: null,
          recipientEmail: input.recipientEmail.toLowerCase(),
          notificationId: notification.id,
          channel: NotificationChannel.EMAIL,
          status: NotificationDeliveryStatus.PENDING,
          correlationId: input.correlationId,
        },
      });
      return tx.notification.findUniqueOrThrow({ where: { id: notification.id }, include: { deliveries: true } });
    });
  }

  async create(actor: JwtPayload, dto: CreateNotificationDto) {
    return this.createPersistent({
      tenantId: this.activeTenantId(actor),
      userId: dto.userId ?? null,
      type: dto.type,
      category: dto.category ?? NotificationCategory.GENERAL,
      title: dto.title,
      message: dto.message,
      payload: dto.payload,
      sourceModule: dto.sourceModule,
      actionUrl: dto.actionUrl,
      correlationId: dto.correlationId,
      deduplicationKey: dto.deduplicationKey,
    });
  }

  async processDueDeliveries(limit = 50) {
    const due = await this.prisma.notificationDelivery.findMany({
      where: {
        channel: NotificationChannel.EMAIL,
        status: {
          in: [
            NotificationDeliveryStatus.PENDING,
            NotificationDeliveryStatus.FAILED,
          ],
        },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    const results = await Promise.allSettled(
      due.map(({ id }) => this.attemptEmailDelivery(id)),
    );
    return {
      processed: due.length,
      failed: results.filter((result) => result.status === 'rejected').length,
    };
  }

  async createFromDomainEvent(actor: JwtPayload, eventName: DomainEventName, dto: DomainEventDto) {
    const definition = this.domainDefinition(eventName);
    const userId = await this.resolveEventRecipient(this.activeTenantId(actor), dto);
    const correlationId =
      typeof dto.payload?.correlationId === 'string' ? dto.payload.correlationId : undefined;

    return this.createPersistent({
      tenantId: this.activeTenantId(actor),
      userId,
      ...definition,
      correlationId,
      deduplicationKey: `${eventName}:${dto.workflowId ?? dto.employeeId ?? dto.candidateId ?? correlationId ?? 'tenant'}`,
      payload: {
        eventName,
        branchId: dto.branchId ?? null,
        workflowId: dto.workflowId ?? null,
        employeeId: dto.employeeId ?? null,
        candidateId: dto.candidateId ?? null,
      },
    });
  }

  async findAll(actor: JwtPayload, query: ListNotificationsDto) {
    const tenantId = this.activeTenantId(actor);
    const pagination = normalizeOffsetPagination(query);
    const where: Prisma.NotificationWhereInput = {
      tenantId,
      deletedAt: null,
      OR: [{ userId: null }, { userId: actor.sub }],
      ...(query.unreadOnly ? { readAt: null } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status === 'archived'
        ? { archivedAt: { not: null } }
        : query.status === 'all'
          ? {}
          : { archivedAt: null }),
    };

    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        include: { deliveries: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: {
          tenantId,
          deletedAt: null,
          archivedAt: null,
          readAt: null,
          OR: [{ userId: null }, { userId: actor.sub }],
        },
      }),
    ]);

    return { items, page: pagination.page, pageSize: pagination.pageSize, total, unread };
  }

  async markAsRead(actor: JwtPayload, id: string) {
    const notification = await this.requireAccessible(actor, id);
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  async markAllAsRead(actor: JwtPayload) {
    const tenantId = this.activeTenantId(actor);
    const result = await this.prisma.notification.updateMany({
      where: {
        tenantId,
        deletedAt: null,
        readAt: null,
        OR: [{ userId: null }, { userId: actor.sub }],
      },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async archive(actor: JwtPayload, id: string) {
    const notification = await this.requireAccessible(actor, id);
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { archivedAt: new Date(), readAt: notification.readAt ?? new Date() },
    });
  }

  async remove(actor: JwtPayload, id: string) {
    const notification = await this.requireAccessible(actor, id);
    return this.prisma.notification.update({
      where: { id: notification.id },
      data: { deletedAt: new Date() },
    });
  }

  async getPreferences(actor: JwtPayload) {
    const tenantId = this.activeTenantId(actor);
    const existing = await this.prisma.notificationPreference.findMany({
      where: { tenantId, userId: actor.sub },
    });
    const byCategory = new Map(existing.map((item) => [item.category, item]));
    return CATEGORIES.map((category) => {
      const item = byCategory.get(category);
      return (
        item ?? {
          id: null,
          tenantId,
          userId: actor.sub,
          category,
          internalEnabled: true,
          emailEnabled: true,
          frequency: NotificationDigestFrequency.IMMEDIATE,
          quietHoursStart: null,
          quietHoursEnd: null,
          timeZone: 'UTC',
        }
      );
    });
  }

  async updatePreference(actor: JwtPayload, dto: UpdateNotificationPreferenceDto) {
    const tenantId = this.activeTenantId(actor);
    const protectedCategory = CRITICAL_CATEGORIES.has(dto.category);
    return this.prisma.notificationPreference.upsert({
      where: {
        tenantId_userId_category: { tenantId, userId: actor.sub, category: dto.category },
      },
      create: {
        tenantId,
        userId: actor.sub,
        category: dto.category,
        internalEnabled: protectedCategory ? true : (dto.internalEnabled ?? true),
        emailEnabled: protectedCategory ? true : (dto.emailEnabled ?? true),
        frequency: protectedCategory
          ? NotificationDigestFrequency.IMMEDIATE
          : (dto.frequency ?? NotificationDigestFrequency.IMMEDIATE),
        quietHoursStart: dto.quietHoursStart,
        quietHoursEnd: dto.quietHoursEnd,
        timeZone: dto.timeZone ?? 'UTC',
      },
      update: {
        internalEnabled: protectedCategory ? true : dto.internalEnabled,
        emailEnabled: protectedCategory ? true : dto.emailEnabled,
        frequency: protectedCategory ? NotificationDigestFrequency.IMMEDIATE : dto.frequency,
        quietHoursStart: dto.quietHoursStart,
        quietHoursEnd: dto.quietHoursEnd,
        timeZone: dto.timeZone,
      },
    });
  }

  async listDeliveries(actor: JwtPayload, query: ListNotificationDeliveriesDto) {
    const pagination = normalizeOffsetPagination(query);
    const tenantId = this.activeTenantId(actor);
    const where: Prisma.NotificationDeliveryWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.channel ? { channel: query.channel } : {}),
      ...(!actor.isSuperAdmin ? { OR: [{ userId: null }, { userId: actor.sub }] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationDelivery.findMany({
        where,
        include: { notification: { select: { title: true, category: true } } },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.notificationDelivery.count({ where }),
    ]);
    return { items, page: pagination.page, pageSize: pagination.pageSize, total };
  }

  async retryDelivery(actor: JwtPayload, id: string) {
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { id, tenantId: this.activeTenantId(actor) },
      include: { notification: true, user: true },
    });
    if (!delivery) throw new NotFoundException('Notification delivery not found');
    if (!actor.isSuperAdmin && delivery.userId !== actor.sub) {
      throw new ForbiddenException('You do not have access to this delivery');
    }
    if (
      delivery.status !== NotificationDeliveryStatus.FAILED &&
      delivery.status !== NotificationDeliveryStatus.DEAD_LETTER
    ) {
      throw new BadRequestException('Only failed deliveries can be retried');
    }
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status: NotificationDeliveryStatus.PENDING, nextAttemptAt: new Date(), lastError: null },
    });
    return this.attemptEmailDelivery(id);
  }

  private async createPersistent(input: {
    tenantId: string;
    userId: string | null;
    type: NotificationType;
    category: NotificationCategory;
    title: string;
    message: string;
    payload?: Record<string, unknown>;
    sourceModule?: string;
    actionUrl?: string;
    correlationId?: string;
    deduplicationKey?: string;
  }) {
    if (input.userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.userId, tenantId: input.tenantId },
        select: { id: true },
      });
      if (!user) throw new NotFoundException('User not found');
    }

    const preference = input.userId
      ? await this.prisma.notificationPreference.findUnique({
          where: {
            tenantId_userId_category: {
              tenantId: input.tenantId,
              userId: input.userId,
              category: input.category,
            },
          },
        })
      : null;
    const internalEnabled = preference?.internalEnabled ?? true;
    const emailEnabled =
      Boolean(input.userId) &&
      (preference?.emailEnabled ?? true) &&
      preference?.frequency !== NotificationDigestFrequency.DISABLED;

    const existing = input.deduplicationKey
      ? await this.prisma.notification.findFirst({
          where: {
            tenantId: input.tenantId,
            userId: input.userId,
            deduplicationKey: input.deduplicationKey,
          },
          include: { deliveries: true },
        })
      : null;
    if (existing) return existing;

    const notification = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          type: input.type,
          category: input.category,
          title: input.title,
          message: input.message,
          sourceModule: input.sourceModule,
          actionUrl: this.safeActionUrl(input.actionUrl),
          correlationId: input.correlationId,
          deduplicationKey: input.deduplicationKey,
          payload: input.payload as Prisma.InputJsonValue | undefined,
        },
      });
      await tx.notificationDelivery.createMany({
        data: [
          {
            tenantId: input.tenantId,
            userId: input.userId,
            notificationId: created.id,
            channel: NotificationChannel.INTERNAL,
            status: internalEnabled
              ? NotificationDeliveryStatus.DELIVERED
              : NotificationDeliveryStatus.SKIPPED,
            deliveredAt: internalEnabled ? new Date() : null,
            correlationId: input.correlationId,
            lastError: internalEnabled ? null : 'Canal interno desactivado por el usuario',
          },
          ...(input.userId
            ? [
                {
                  tenantId: input.tenantId,
                  userId: input.userId,
                  notificationId: created.id,
                  channel: NotificationChannel.EMAIL,
                  status: emailEnabled
                    ? NotificationDeliveryStatus.PENDING
                    : NotificationDeliveryStatus.SKIPPED,
                  correlationId: input.correlationId,
                  lastError: emailEnabled ? null : 'Canal de correo desactivado por el usuario',
                },
              ]
            : []),
        ],
      });
      return tx.notification.findUniqueOrThrow({
        where: { id: created.id },
        include: { deliveries: true },
      });
    });

    const pendingEmail = notification.deliveries.find(
      (item) =>
        item.channel === NotificationChannel.EMAIL &&
        item.status === NotificationDeliveryStatus.PENDING,
    );
    if (pendingEmail) await this.attemptEmailDelivery(pendingEmail.id);
    return this.prisma.notification.findUniqueOrThrow({
      where: { id: notification.id },
      include: { deliveries: true },
    });
  }

  private async attemptEmailDelivery(id: string) {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id },
      include: { notification: { include: { atsMessage: { select: { applicationId: true, inReplyToMessageId: true } } } }, user: true },
    });
    if (!delivery || delivery.channel !== NotificationChannel.EMAIL) {
      throw new NotFoundException('Email delivery not found');
    }
    const attempts = delivery.attempts + 1;
    await this.prisma.notificationDelivery.update({
      where: { id },
      data: { status: NotificationDeliveryStatus.PROCESSING, attempts, lastAttemptAt: new Date() },
    });
    try {
      if (!this.deliveryProvider) throw new Error('Email delivery provider is unavailable');
      const result = await this.deliveryProvider.sendEmail(delivery);
      return this.prisma.notificationDelivery.update({
        where: { id },
        data: {
          status: NotificationDeliveryStatus.DELIVERED,
          deliveredAt: new Date(),
          providerMessageId: result.id,
          lastError: null,
        },
      });
    } catch (error) {
      const deadLetter = attempts >= delivery.maxAttempts;
      const delayMinutes = Math.min(60, 2 ** attempts);
      return this.prisma.notificationDelivery.update({
        where: { id },
        data: {
          status: deadLetter
            ? NotificationDeliveryStatus.DEAD_LETTER
            : NotificationDeliveryStatus.FAILED,
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          lastError: error instanceof Error ? error.message : 'Email delivery failed',
        },
      });
    }
  }

  private async requireAccessible(actor: JwtPayload, id: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.tenantId !== this.activeTenantId(actor) || notification.deletedAt) {
      throw new NotFoundException('Notification not found');
    }
    if (notification.userId && notification.userId !== actor.sub && !actor.isSuperAdmin) {
      throw new ForbiddenException('You do not have access to this notification');
    }
    return notification;
  }

  private async resolveEventRecipient(tenantId: string, dto: DomainEventDto) {
    if (dto.employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: dto.employeeId, tenantId },
        select: { email: true },
      });
      if (employee?.email) {
        const user = await this.prisma.user.findFirst({
          where: { tenantId, email: employee.email },
          select: { id: true },
        });
        if (user) return user.id;
      }
    }
    return null;
  }

  private domainDefinition(eventName: DomainEventName): DomainNotificationDefinition {
    const definitions: Record<DomainEventName, DomainNotificationDefinition> = {
      'candidate.hired': { category: NotificationCategory.ATS, type: NotificationType.SUCCESS, title: 'Contratación confirmada', message: 'La contratación fue confirmada y el flujo de incorporación comenzó.', sourceModule: 'ats', actionUrl: '/ats/candidates' },
      'employee.branch_changed': { category: NotificationCategory.GENERAL, type: NotificationType.INFO, title: 'Cambio de sucursal', message: 'Se actualizó la sucursal asignada y se están recalculando las tareas relacionadas.', sourceModule: 'employees', actionUrl: '/employees' },
      'employee.offboarding_started': { category: NotificationCategory.AUTOMATION, type: NotificationType.WARNING, title: 'Proceso de salida iniciado', message: 'El cierre de accesos y la recuperación de activos quedaron en seguimiento.', sourceModule: 'automation', actionUrl: '/dashboard' },
      'onboarding.completed': { category: NotificationCategory.ONBOARDING, type: NotificationType.SUCCESS, title: 'Incorporación completada', message: 'Todas las tareas obligatorias de incorporación fueron completadas.', sourceModule: 'onboarding', actionUrl: '/onboarding/documents' },
      'inventory.asset_assigned': { category: NotificationCategory.INVENTORY, type: NotificationType.INFO, title: 'Activo asignado', message: 'Se registró una nueva asignación de inventario.', sourceModule: 'inventory', actionUrl: '/inventory' },
      'training.completed': { category: NotificationCategory.TRAINING, type: NotificationType.SUCCESS, title: 'Capacitación completada', message: 'La actividad formativa fue completada correctamente.', sourceModule: 'training', actionUrl: '/training' },
      'operation.handoff_completed': { category: NotificationCategory.AUTOMATION, type: NotificationType.SUCCESS, title: 'Entrega operativa completada', message: 'La transferencia operativa fue confirmada.', sourceModule: 'automation', actionUrl: '/dashboard' },
      'compliance.closed': { category: NotificationCategory.SECURITY, type: NotificationType.SUCCESS, title: 'Control de cumplimiento cerrado', message: 'El control obligatorio fue cerrado con trazabilidad.', sourceModule: 'compliance', actionUrl: '/reports' },
    };
    return definitions[eventName];
  }

  private safeActionUrl(value?: string) {
    if (!value) return null;
    return value.startsWith('/') && !value.startsWith('//') ? value : null;
  }

  private activeTenantId(actor: JwtPayload) {
    return actor.activeTenantId ?? actor.tenantId;
  }
}
