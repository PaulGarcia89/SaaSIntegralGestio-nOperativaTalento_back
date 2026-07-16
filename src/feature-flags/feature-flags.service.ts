import { Injectable } from '@nestjs/common';
import { ModuleCode, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PlatformAccessService } from '../platform/platform-access.service';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async findAll(actor: JwtPayload, tenantId: string) {
    const scopedTenantId = actor.isSuperAdmin ? tenantId : actor.tenantId;
    const [catalog, capabilities] = await Promise.all([
      this.platformAccessService.getModuleCatalog(),
      this.platformAccessService.getTenantCapabilities(scopedTenantId),
    ]);

    const flagsByModule = new Map(
      capabilities.featureFlags.map((featureFlag) => [featureFlag.moduleCode, featureFlag]),
    );

    return catalog.map((moduleEntry) => ({
      ...moduleEntry,
      enabled: capabilities.enabledModules.includes(moduleEntry.code as ModuleCode),
      planEnabled: capabilities.planModules.includes(moduleEntry.code as ModuleCode),
      featureFlag: flagsByModule.get(moduleEntry.code as ModuleCode) ?? null,
    }));
  }

  async upsert(actor: JwtPayload, dto: UpsertFeatureFlagDto) {
    const scopedTenantId = actor.isSuperAdmin ? dto.tenantId ?? actor.tenantId : actor.tenantId;

    await this.prisma.tenantFeatureFlag.upsert({
      where: {
        tenantId_moduleCode: {
          tenantId: scopedTenantId,
          moduleCode: dto.moduleCode,
        },
      },
      update: {
        enabled: dto.enabled,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
      create: {
        tenantId: scopedTenantId,
        moduleCode: dto.moduleCode,
        enabled: dto.enabled,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return this.platformAccessService.getTenantCapabilities(scopedTenantId);
  }
}
