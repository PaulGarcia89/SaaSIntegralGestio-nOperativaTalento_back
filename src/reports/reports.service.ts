import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApplicationStatus,
  InventoryAssetStatus,
  Prisma,
  TrainingProgressStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { ReportQueryDto } from './dto/report-query.dto';
import { AccessScope } from '../common/enums/access-scope.enum';
import { SaveReportFilterDto } from './dto/save-report-filter.dto';

const DAY = 86_400_000;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: JwtPayload, query: ReportQueryDto) {
    const context = await this.resolveContext(actor, query);
    const period = this.resolvePeriod(query);
    const tenantWhere = context.tenantId ? { tenantId: context.tenantId } : {};
    const branchWhere = context.branchId ? { branchId: context.branchId } : {};
    const applicationBranch = context.branchId ? { vacancy: { branchId: context.branchId } } : {};
    const trainingBranch = context.branchId ? { user: { activeBranchId: context.branchId } } : {};
    const dateWhere = { gte: period.from, lte: period.to };

    const [
      applications,
      activeVacancies,
      onboardingFlows,
      onboardingTasks,
      trainingAssignments,
      inventoryAssets,
    ] = await Promise.all([
      this.prisma.vacancyApplication.findMany({
        where: { ...tenantWhere, ...applicationBranch, appliedAt: dateWhere },
        select: {
          status: true,
          appliedAt: true,
          reviewedAt: true,
          contactedAt: true,
          interviewScheduledAt: true,
          interviewCompletedAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.vacancy.count({
        where: { ...tenantWhere, ...branchWhere, status: 'OPEN', createdAt: { lte: period.to } },
      }),
      this.prisma.onboardingFlow.findMany({
        where: { ...tenantWhere, ...branchWhere, startedAt: { lte: period.to } },
        select: { status: true, startedAt: true, completedAt: true },
      }),
      this.prisma.onboardingTask.findMany({
        where: { ...tenantWhere, ...branchWhere, createdAt: { lte: period.to } },
        select: { status: true, progressPercent: true, dueDate: true, blockingReason: true },
      }),
      this.prisma.trainingAssignment.findMany({
        where: { ...tenantWhere, ...trainingBranch, createdAt: { lte: period.to } },
        select: { status: true, progressPercent: true, dueAt: true, completedAt: true },
      }),
      this.prisma.inventoryAsset.findMany({
        where: { ...tenantWhere, ...branchWhere, createdAt: { lte: period.to } },
        select: { status: true },
      }),
    ]);

    const now = new Date();
    const applicationCounts = this.countBy(applications.map((item) => item.status));
    const hired = applicationCounts[ApplicationStatus.HIRED] ?? 0;
    const rejected = applicationCounts[ApplicationStatus.REJECTED] ?? 0;
    const durations = applications
      .filter((item) => item.status === ApplicationStatus.HIRED)
      .map((item) => (item.updatedAt.getTime() - item.appliedAt.getTime()) / 3_600_000);
    const stageDurations = [
      this.stageDuration('Postulación → revisión', applications, (item) => item.reviewedAt),
      this.stageDuration('Revisión → contacto', applications, (item) => item.contactedAt, (item) => item.reviewedAt),
      this.stageDuration('Contacto → entrevista', applications, (item) => item.interviewScheduledAt, (item) => item.contactedAt),
      this.stageDuration('Entrevista → decisión', applications, (item) => item.updatedAt, (item) => item.interviewCompletedAt),
    ];

    const flowCounts = this.countBy(onboardingFlows.map((item) => item.status));
    const completedFlows = flowCounts[WorkflowTaskStatus.COMPLETED] ?? 0;
    const overdueTasks = onboardingTasks.filter(
      (item) =>
        item.dueDate &&
        item.dueDate < now &&
        item.status !== WorkflowTaskStatus.COMPLETED &&
        item.status !== WorkflowTaskStatus.CANCELLED,
    ).length;
    const blockedTasks = onboardingTasks.filter((item) => Boolean(item.blockingReason)).length;

    const trainingCounts = this.countBy(trainingAssignments.map((item) => item.status));
    const completedTraining = trainingCounts[TrainingProgressStatus.COMPLETED] ?? 0;
    const overdueTraining = trainingAssignments.filter(
      (item) =>
        item.status === TrainingProgressStatus.OVERDUE ||
        (item.dueAt && item.dueAt < now && item.status !== TrainingProgressStatus.COMPLETED),
    ).length;
    const inventoryCounts = this.countBy(inventoryAssets.map((item) => item.status));
    const pendingInventory = [
      InventoryAssetStatus.RETURN_PENDING,
      InventoryAssetStatus.IN_TRANSIT,
      InventoryAssetStatus.MAINTENANCE,
      InventoryAssetStatus.LOST,
    ].reduce((sum, status) => sum + (inventoryCounts[status] ?? 0), 0);

    return {
      generatedAt: now.toISOString(),
      source: 'Datos operativos persistentes',
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        label: `${period.from.toLocaleDateString('es-ES')} – ${period.to.toLocaleDateString('es-ES')}`,
      },
      scope: context,
      ats: {
        totals: {
          applications: applications.length,
          activeVacancies,
          hired,
          rejected,
          conversionRate: this.percent(hired, applications.length),
          averageTimeToHireHours: this.average(durations),
        },
        byStatus: Object.entries(applicationCounts).map(([status, count]) => ({ status, count })),
        timeByStage: stageDurations,
      },
      onboarding: {
        totalFlows: onboardingFlows.length,
        completedFlows,
        completionRate: this.percent(completedFlows, onboardingFlows.length),
        overdueTasks,
        blockedTasks,
        averageTaskProgress: this.average(onboardingTasks.map((item) => item.progressPercent)),
        byStatus: Object.entries(flowCounts).map(([status, count]) => ({ status, count })),
      },
      training: {
        totalAssignments: trainingAssignments.length,
        completed: completedTraining,
        overdue: overdueTraining,
        inProgress: trainingCounts[TrainingProgressStatus.IN_PROGRESS] ?? 0,
        complianceRate: this.percent(completedTraining, trainingAssignments.length),
        averageProgress: this.average(trainingAssignments.map((item) => item.progressPercent)),
        byStatus: Object.entries(trainingCounts).map(([status, count]) => ({ status, count })),
      },
      inventory: {
        totalAssets: inventoryAssets.length,
        pendingActions: pendingInventory,
        available: inventoryCounts[InventoryAssetStatus.AVAILABLE] ?? 0,
        assigned: inventoryCounts[InventoryAssetStatus.ASSIGNED] ?? 0,
        returnPending: inventoryCounts[InventoryAssetStatus.RETURN_PENDING] ?? 0,
        maintenance: inventoryCounts[InventoryAssetStatus.MAINTENANCE] ?? 0,
        lost: inventoryCounts[InventoryAssetStatus.LOST] ?? 0,
        byStatus: Object.entries(inventoryCounts).map(([status, count]) => ({ status, count })),
      },
    };
  }

  async exportCsv(actor: JwtPayload, query: ReportQueryDto) {
    const report = await this.overview(actor, query);
    const rows: Array<[string, string, string | number]> = [
      ['ATS', 'Postulaciones', report.ats.totals.applications],
      ['ATS', 'Vacantes activas', report.ats.totals.activeVacancies],
      ['ATS', 'Contratados', report.ats.totals.hired],
      ['ATS', 'Conversión (%)', report.ats.totals.conversionRate],
      ['Onboarding', 'Procesos', report.onboarding.totalFlows],
      ['Onboarding', 'Avance (%)', report.onboarding.completionRate],
      ['Onboarding', 'Tareas vencidas', report.onboarding.overdueTasks],
      ['Formación', 'Asignaciones', report.training.totalAssignments],
      ['Formación', 'Cumplimiento (%)', report.training.complianceRate],
      ['Formación', 'Vencidas', report.training.overdue],
      ['Inventario', 'Activos', report.inventory.totalAssets],
      ['Inventario', 'Pendientes', report.inventory.pendingActions],
    ];
    const csv = [
      ['Módulo', 'Indicador', 'Valor'],
      ...rows,
    ]
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
    return {
      filename: `reporte-operativo-${report.period.from.slice(0, 10)}-${report.period.to.slice(0, 10)}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: `\uFEFF${csv}`,
      generatedAt: report.generatedAt,
    };
  }

  async listSavedFilters(actor: JwtPayload) {
    const tenantId = this.requireTenantContext(actor);
    return this.prisma.reportSavedFilter.findMany({
      where: { tenantId, userId: actor.userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async saveFilter(actor: JwtPayload, dto: SaveReportFilterDto) {
    const tenantId = this.requireTenantContext(actor);
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Report filter name is required');
    const filters = dto.filters as Prisma.InputJsonValue;

    return this.prisma.reportSavedFilter.upsert({
      where: {
        tenantId_userId_name: {
          tenantId,
          userId: actor.userId,
          name,
        },
      },
      update: { filters },
      create: { tenantId, userId: actor.userId, name, filters },
    });
  }

  async deleteFilter(actor: JwtPayload, id: string) {
    const tenantId = this.requireTenantContext(actor);
    const savedFilter = await this.prisma.reportSavedFilter.findFirst({
      where: { id, tenantId, userId: actor.userId },
      select: { id: true },
    });
    if (!savedFilter) {
      throw new NotFoundException('Saved report filter not found');
    }

    await this.prisma.reportSavedFilter.delete({ where: { id } });
    return { deleted: true, id };
  }

  private requireTenantContext(actor: JwtPayload) {
    const tenantId = actor.activeTenantId ?? actor.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Select an active tenant before managing report filters');
    }
    if (!actor.isSuperAdmin && actor.allowedTenantIds.length > 0 && !actor.allowedTenantIds.includes(tenantId)) {
      throw new ForbiddenException('Tenant is outside the active user scope');
    }
    return tenantId;
  }

  private async resolveContext(actor: JwtPayload, query: ReportQueryDto) {
    const global = actor.isSuperAdmin && actor.isGlobalContext && !query.tenantId;
    const tenantId = global ? null : query.tenantId ?? actor.activeTenantId ?? actor.tenantId;
    if (query.tenantId && !actor.isSuperAdmin && !actor.allowedTenantIds.includes(query.tenantId)) {
      throw new ForbiddenException('Tenant fuera del alcance autorizado');
    }
    const branchRestricted = !actor.isSuperAdmin && actor.scope === AccessScope.BRANCH;
    const branchId = branchRestricted
      ? query.branchId ?? actor.activeBranchId
      : query.scope === 'tenant'
        ? null
        : query.branchId ?? actor.activeBranchId;
    if (branchRestricted && (!branchId || !actor.allowedBranchIds.includes(branchId))) {
      throw new ForbiddenException('Sucursal fuera del alcance autorizado');
    }
    if (branchId) {
      if (!actor.isSuperAdmin && actor.allowedBranchIds.length > 0 && !actor.allowedBranchIds.includes(branchId)) {
        throw new ForbiddenException('Sucursal fuera del alcance autorizado');
      }
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, ...(tenantId ? { tenantId } : {}) },
        select: { id: true, name: true },
      });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
      return { type: 'BRANCH' as const, tenantId, branchId, branchName: branch.name };
    }
    return { type: global ? ('GLOBAL' as const) : ('TENANT' as const), tenantId, branchId: null, branchName: null };
  }

  private resolvePeriod(query: ReportQueryDto) {
    const to = query.to
      ? new Date(query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to)
      : new Date();
    const from = query.from
      ? new Date(query.from.length === 10 ? `${query.from}T00:00:00.000Z` : query.from)
      : new Date(to.getTime() - 29 * DAY);
    if (from > to) throw new BadRequestException('La fecha inicial debe ser anterior a la fecha final');
    if (to.getTime() - from.getTime() > 366 * DAY) {
      throw new BadRequestException('El periodo máximo permitido es de 366 días');
    }
    return { from, to };
  }

  private countBy(values: Array<string>) {
    return values.reduce<Record<string, number>>((counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    }, {});
  }

  private stageDuration<T>(
    label: string,
    items: T[],
    end: (item: T) => Date | null,
    start: (item: T) => Date | null = (item: T) => (item as T & { appliedAt: Date }).appliedAt,
  ) {
    const values = items.flatMap((item) => {
      const from = start(item);
      const to = end(item);
      return from && to && to >= from ? [(to.getTime() - from.getTime()) / 3_600_000] : [];
    });
    return { stage: label, averageHours: this.average(values), sampleSize: values.length };
  }

  private average(values: number[]) {
    return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0;
  }

  private percent(value: number, total: number) {
    return total ? Math.round((value / total) * 1000) / 10 : 0;
  }

  private csvCell(value: string | number) {
    const safe = String(value).replace(/"/g, '""');
    const protectedValue = /^[=+\-@]/.test(safe) ? `'${safe}` : safe;
    return `"${protectedValue}"`;
  }
}
