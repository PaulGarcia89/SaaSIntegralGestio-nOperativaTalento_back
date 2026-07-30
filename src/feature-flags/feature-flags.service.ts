import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleCode, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PlatformAccessService } from '../platform/platform-access.service';
import { UpsertFeatureFlagDto } from './dto/upsert-feature-flag.dto';
import { AccessScope } from '../common/enums/access-scope.enum';

@Injectable()
export class FeatureFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAccessService: PlatformAccessService,
  ) {}

  async findAll(actor: JwtPayload, tenantId: string) {
    const scopedTenantId = this.resolveTenant(actor, tenantId);
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

  async findAllGlobal(actor: JwtPayload) {
    const tenants = await this.prisma.tenant.findMany({
      where: actor.isSuperAdmin ? undefined : { id: { in: actor.allowedTenantIds } },
      select: { id: true },
      orderBy: { name: 'asc' },
    });

    const assignments = await Promise.all(
      tenants.map(async ({ id: tenantId }) => {
        const flags = await this.findAll(actor, tenantId);
        return flags.map((flag) => ({ tenantId, ...flag }));
      }),
    );

    return assignments.flat();
  }

  async upsert(
    actor: JwtPayload,
    dto: UpsertFeatureFlagDto & { moduleCode: ModuleCode },
  ) {
    const scopedTenantId = this.resolveTenant(
      actor,
      dto.tenantId ?? actor.activeTenantId ?? actor.tenantId,
    );

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

  private resolveTenant(actor: JwtPayload, requestedTenantId: string) {
    if (actor.isSuperAdmin) {
      return requestedTenantId;
    }

    const activeTenantId = actor.activeTenantId ?? actor.tenantId;
    const canGovernRequestedTenant =
      requestedTenantId === activeTenantId ||
      (actor.scope === AccessScope.GLOBAL && actor.allowedTenantIds.includes(requestedTenantId));

    if (!canGovernRequestedTenant) {
      throw new ForbiddenException('Tenant is outside the active actor context');
    }

    return requestedTenantId;
  }
}
