import { HttpStatus, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

@Injectable()
export class RestaurantInventoryAuditService {
  constructor(private readonly prisma: PrismaService) {}
  async list(tenantId: string, query: { actorId?: string; action?: string; entityType?: string; entityId?: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page) || 1); const pageSize = Math.min(200, Math.max(1, Number(query.pageSize) || 50));
    const from = query.from ? new Date(query.from) : undefined; const to = query.to ? new Date(query.to) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (from && to && from > to)) throw new AppException('Rango de fechas inválido', ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST);
    const where: any = { tenantId, ...(query.actorId ? { actorId: query.actorId } : {}), ...(query.action ? { action: query.action } : {}), ...(query.entityType ? { entityType: query.entityType } : {}), ...(query.entityId ? { entityId: query.entityId } : {}), ...(from || to ? { createdAt: { gte: from, lte: to } } : {}) };
    const [rows, total] = await Promise.all([this.prisma.restaurantInventoryAuditLog.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }), this.prisma.restaurantInventoryAuditLog.count({ where })]);
    return { rows, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}
