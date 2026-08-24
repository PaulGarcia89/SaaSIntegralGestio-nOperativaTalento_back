import { HttpStatus, Injectable } from '@nestjs/common';
import { InventoryCapabilityCode, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-code.enum';

@Injectable()
export class InventoryCapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    const rows = await this.prisma.tenantInventoryCapability.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });

    return Object.values(InventoryCapabilityCode).map((code) => {
      const row = rows.find((item) => item.code === code);
      return {
        code,
        enabled: row?.enabled ?? false,
        activatedAt: row?.activatedAt ?? null,
        deactivatedAt: row?.deactivatedAt ?? null,
        metadata: row?.metadata ?? null,
      };
    });
  }

  async enabledCodes(tenantId: string) {
    const rows = await this.prisma.tenantInventoryCapability.findMany({
      where: { tenantId, enabled: true },
      select: { code: true },
    });
    return rows.map((row) => row.code);
  }

  async assertEnabled(tenantId: string, code: InventoryCapabilityCode) {
    const capability = await this.prisma.tenantInventoryCapability.findUnique({
      where: { tenantId_code: { tenantId, code } },
      select: { enabled: true },
    });

    if (!capability?.enabled) {
      throw new AppException(
        `Inventory capability ${code} is not enabled for this tenant`,
        ErrorCode.MODULE_NOT_ENABLED,
        HttpStatus.FORBIDDEN,
        { details: { capability: code } },
      );
    }
  }

  async setEnabled(
    tenantId: string,
    code: InventoryCapabilityCode,
    enabled: boolean,
    actorUserId: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    if (!Object.values(InventoryCapabilityCode).includes(code)) {
      throw new AppException('Unknown inventory capability', ErrorCode.BAD_REQUEST, HttpStatus.BAD_REQUEST);
    }
    const now = new Date();
    return this.prisma.tenantInventoryCapability.upsert({
      where: { tenantId_code: { tenantId, code } },
      update: {
        enabled,
        activatedAt: enabled ? now : undefined,
        deactivatedAt: enabled ? null : now,
        activatedById: actorUserId,
        ...(metadata !== undefined ? { metadata } : {}),
      },
      create: {
        tenantId,
        code,
        enabled,
        activatedAt: enabled ? now : null,
        deactivatedAt: enabled ? null : now,
        activatedById: actorUserId,
        ...(metadata !== undefined ? { metadata } : {}),
      },
    });
  }

  async listForUser(tenantId: string | null) {
    if (!tenantId) {
      return Object.values(InventoryCapabilityCode).map((code) => ({ code, enabled: false }));
    }
    return this.list(tenantId);
  }
}
