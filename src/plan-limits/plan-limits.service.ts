import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

export type PlanLimitKey =
  | 'maxUsers'
  | 'maxBranches'
  | 'maxActiveVacancies'
  | 'maxCourses'
  | 'maxAssets';

type PlanLimits = Partial<Record<PlanLimitKey | 'storageGb', number | null>>;

@Injectable()
export class PlanLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCapacity(tenantId: string, key: PlanLimitKey) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { tenantId },
      select: { plan: { select: { name: true, limits: true } } },
    });
    const limits = (subscription?.plan.limits ?? {}) as PlanLimits;
    const limit = limits[key];
    if (limit === undefined || limit === null) return;

    const current = await this.currentUsage(tenantId, key);
    if (current >= limit) {
      throw new ConflictException(
        `Se alcanzó el límite de ${limit} para ${this.label(key)} del plan ${subscription?.plan.name ?? ''}.`,
      );
    }
  }

  private currentUsage(tenantId: string, key: PlanLimitKey) {
    switch (key) {
      case 'maxUsers':
        return this.prisma.user.count({ where: { tenantId, status: { not: 'SUSPENDED' } } });
      case 'maxBranches':
        return this.prisma.branch.count({ where: { tenantId } });
      case 'maxActiveVacancies':
        return this.prisma.vacancy.count({ where: { tenantId, status: { in: ['OPEN', 'PAUSED'] } } });
      case 'maxCourses':
        return this.prisma.trainingCourse.count({ where: { tenantId, status: { notIn: ['ARCHIVED', 'RETIRED'] } } });
      case 'maxAssets':
        return this.prisma.inventoryAsset.count({ where: { tenantId, status: { not: 'RETIRED' } } });
    }
  }

  private label(key: PlanLimitKey) {
    return {
      maxUsers: 'usuarios',
      maxBranches: 'sucursales',
      maxActiveVacancies: 'vacantes activas',
      maxCourses: 'cursos',
      maxAssets: 'activos',
    }[key];
  }
}
