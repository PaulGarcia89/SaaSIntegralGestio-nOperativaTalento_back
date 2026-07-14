import { Injectable } from '@nestjs/common';
import { ModuleCode } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { buildNavigation, mergeEnabledModules } from './utils/tenant-capabilities.util';

@Injectable()
export class PlatformAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenantCapabilities(tenantId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: {
        plan: {
          include: {
            planModules: {
              include: {
                module: true,
              },
            },
          },
        },
      },
    });

    const featureFlags = await this.prisma.tenantFeatureFlag.findMany({
      where: { tenantId },
      orderBy: { moduleCode: 'asc' },
    });

    const planModules = subscription?.plan.planModules.map((entry) => entry.module.code) ?? [];
    const enabledModules = mergeEnabledModules(
      planModules,
      featureFlags.map((featureFlag) => ({
        moduleCode: featureFlag.moduleCode,
        enabled: featureFlag.enabled,
      })),
    );

    return {
      plan: subscription?.plan
        ? {
            id: subscription.plan.id,
            code: subscription.plan.code,
            name: subscription.plan.name,
            description: subscription.plan.description,
          }
        : null,
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
            trialEndsAt: subscription.trialEndsAt,
            billingProvider: subscription.billingProvider,
            billingCustomerId: subscription.billingCustomerId,
            billingExternalId: subscription.billingExternalId,
            currency: subscription.currency,
          }
        : null,
      planModules,
      enabledModules,
      featureFlags: featureFlags.map((featureFlag) => ({
        id: featureFlag.id,
        moduleCode: featureFlag.moduleCode,
        enabled: featureFlag.enabled,
        metadata: featureFlag.metadata,
        createdAt: featureFlag.createdAt,
        updatedAt: featureFlag.updatedAt,
      })),
      navigation: buildNavigation(enabledModules),
      dashboard: this.buildDashboardCards(enabledModules),
    };
  }

  async getModuleCatalog() {
    const modules = await this.prisma.featureModule.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return modules.map((module) => ({
      id: module.id,
      code: module.code,
      name: module.name,
      description: module.description,
    }));
  }

  private buildDashboardCards(enabledModules: ModuleCode[]) {
    return enabledModules.map((moduleCode) => ({
      moduleCode,
      title: this.resolveDashboardTitle(moduleCode),
      widgetKey: `${moduleCode.toLowerCase()}-overview`,
    }));
  }

  private resolveDashboardTitle(moduleCode: ModuleCode) {
    switch (moduleCode) {
      case ModuleCode.ATS:
        return 'Hiring pipeline';
      case ModuleCode.ONBOARDING:
        return 'Onboarding status';
      case ModuleCode.TRAINING:
        return 'Learning progress';
      case ModuleCode.INVENTORY:
        return 'Stock health';
      case ModuleCode.AI_PRODUCTIVITY:
        return 'Productivity signals';
      case ModuleCode.DOCUMENTS:
        return 'Document flow';
      case ModuleCode.REPORTS:
        return 'Executive reports';
      default:
        return 'Module overview';
    }
  }
}
