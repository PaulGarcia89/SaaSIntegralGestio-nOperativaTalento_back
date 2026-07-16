import { Injectable } from '@nestjs/common';
import { AccessControlService } from '../access-control/access-control.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { normalizeOffsetPagination } from '../common/utils/pagination.util';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlService,
  ) {}

  async findAll(actor: JwtPayload, query: ListAuditLogsDto) {
    const pagination = normalizeOffsetPagination(query);
    const where = {
      ...this.accessControl.buildTenantWhere(actor),
      ...(query.action ? { action: query.action } : {}),
      ...(query.route ? { route: query.route } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }
}
