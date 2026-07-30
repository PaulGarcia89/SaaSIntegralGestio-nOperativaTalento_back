import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: JwtPayload, dto: CreateNotificationDto) {
    const tenantId = this.activeTenantId(actor);
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({
        where: {
          id: dto.userId,
          tenantId,
        },
        select: { id: true },
      });

      if (!user) {
        throw new NotFoundException('User not found');
      }
    }

    return this.prisma.notification.create({
      data: {
        tenantId,
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        payload: dto.payload as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findAll(actor: JwtPayload, query: ListNotificationsDto) {
    const tenantId = this.activeTenantId(actor);
    const pagination = normalizeOffsetPagination(query);
    const where = {
      tenantId,
      OR: [{ userId: null }, { userId: actor.sub }],
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  async markAsRead(actor: JwtPayload, id: string) {
    const tenantId = this.activeTenantId(actor);
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.tenantId !== tenantId) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId && notification.userId !== actor.sub && !actor.isSuperAdmin) {
      throw new ForbiddenException('You do not have access to this notification');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  private activeTenantId(actor: JwtPayload) {
    return actor.activeTenantId ?? actor.tenantId;
  }
}
