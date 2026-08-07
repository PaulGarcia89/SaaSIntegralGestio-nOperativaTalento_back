import { ForbiddenException, Injectable } from '@nestjs/common';
import { WorkflowTaskStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';

type Metric = { label: string; averageHours: number; sampleSize: number };

@Injectable()
export class OnboardingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, actor: JwtPayload, branchId?: string) {
    const allowedBranches = actor.scope === AccessScope.BRANCH ? actor.allowedBranchIds : [];
    if (branchId && allowedBranches.length && !allowedBranches.includes(branchId)) {
      throw new ForbiddenException('No tienes acceso a esta sucursal');
    }
    const flows = await this.prisma.onboardingFlow.findMany({
      where: { tenantId, ...(branchId ? { branchId } : allowedBranches.length ? { branchId: { in: allowedBranches } } : {}) },
      include: {
        branch: { select: { id: true, name: true } }, template: { select: { id: true, name: true, version: true } },
        candidate: { select: { accountId: true } },
        employee: { select: { jobTitle: true, productivityReviews: { where: { status: 'COMPLETED', completedAt: { not: null } }, select: { completedAt: true } } } },
        tasks: { select: { title: true, taskType: true, ownerType: true, ownerId: true, status: true, createdAt: true, updatedAt: true, completedAt: true, dueDate: true, required: true, blockingReason: true } },
        documents: { where: { deletedAt: null, status: { not: 'SUPERSEDED' } }, select: { status: true } },
      },
      orderBy: { startedAt: 'desc' }, take: 1000,
    });
    const now = Date.now();
    const ownerIds = [...new Set(flows.flatMap((flow) => flow.tasks.map((task) => task.ownerId).filter((id): id is string => Boolean(id))))];
    const owners = ownerIds.length ? await this.prisma.user.findMany({ where: { tenantId, id: { in: ownerIds } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    const ownerNames = new Map(owners.map((owner) => [owner.id, `${owner.firstName} ${owner.lastName}`.trim() || owner.email]));
    const completed = flows.filter((flow) => flow.status === WorkflowTaskStatus.COMPLETED);
    const average = (values: number[]) => values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length * 10) / 10 : 0;
    const taskDurations = flows.flatMap((flow) => flow.tasks.filter((task) => task.completedAt).map((task) => ({ task, hours: (task.completedAt!.getTime() - task.createdAt.getTime()) / 3_600_000 })));
    const group = (values: Array<{ key: string; hours: number }>): Metric[] => Object.values(values.reduce<Record<string, number[]>>((acc, value) => { (acc[value.key] ??= []).push(value.hours); return acc; }, {})).map((items, index) => ({ label: Object.keys(values.reduce<Record<string, number[]>>((acc, value) => { (acc[value.key] ??= []).push(value.hours); return acc; }, {}))[index], averageHours: average(items), sampleSize: items.length })).sort((a, b) => b.sampleSize - a.sampleSize);
    const byTask = group(taskDurations.map(({ task, hours }) => ({ key: task.title, hours })));
    const byOwner = group(taskDurations.map(({ task, hours }) => ({ key: task.ownerType === 'USER' ? ownerNames.get(task.ownerId ?? '') ?? 'Usuario sin asignar' : task.ownerType, hours })));
    const risks = flows.map((flow) => {
      const pending = flow.tasks.filter((task) => task.status !== WorkflowTaskStatus.COMPLETED && task.required);
      const overdue = pending.filter((task) => task.dueDate && task.dueDate.getTime() < now);
      const blocked = pending.filter((task) => task.status === WorkflowTaskStatus.BLOCKED);
      const candidateTasks = pending.filter((task) => task.ownerType === 'CANDIDATE' || task.ownerType === 'EMPLOYEE');
      const stale = candidateTasks.some((task) => now - task.updatedAt.getTime() > 7 * 86_400_000);
      const score = overdue.length * 45 + blocked.length * 30 + (stale ? 25 : 0);
      return { id: flow.id, employee: flow.employee, branch: flow.branch.name, score: Math.min(100, score), level: score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW', reasons: [...(overdue.length ? [`${overdue.length} tarea(s) vencida(s)`] : []), ...(blocked.length ? [`${blocked.length} tarea(s) bloqueada(s)`] : []), ...(stale ? ['Preboarding sin actividad durante 7 días'] : [])] };
    });
    const comparison = (key: (flow: typeof flows[number]) => string) => Object.entries(flows.reduce<Record<string, { total: number; completed: number; hours: number[] }>>((acc, flow) => { const label = key(flow) || 'Sin definir'; const entry = acc[label] ??= { total: 0, completed: 0, hours: [] }; entry.total++; if (flow.status === WorkflowTaskStatus.COMPLETED) entry.completed++; if (flow.completedAt) entry.hours.push((flow.completedAt.getTime() - flow.startedAt.getTime()) / 3_600_000); return acc; }, {})).map(([label, value]) => ({ label, total: value.total, completionRate: value.total ? Math.round(value.completed / value.total * 100) : 0, averageCompletionHours: average(value.hours) })).sort((a, b) => b.total - a.total);
    const requiredDocumentTasks = flows.flatMap((flow) => flow.tasks.filter((task) => task.required && task.taskType === 'DOCUMENT_COLLECTION'));
    const approvedDocuments = flows.flatMap((flow) => flow.documents).filter((document) => document.status === 'APPROVED').length;
    const productivityHours = completed.flatMap((flow) => flow.employee.productivityReviews.map((review) => review.completedAt ? (review.completedAt.getTime() - flow.startedAt.getTime()) / 3_600_000 : null).filter((value): value is number => value !== null));
    return {
      summary: { totalFlows: flows.length, completionRate: flows.length ? Math.round(completed.length / flows.length * 100) : 0, documentComplianceRate: requiredDocumentTasks.length ? Math.min(100, Math.round(approvedDocuments / requiredDocumentTasks.length * 100)) : 0, averageTimeToProductivityHours: average(productivityHours), atRisk: risks.filter((risk) => risk.level !== 'LOW').length },
      timeByStage: byTask, timeByResponsible: byOwner, risks: risks.filter((risk) => risk.level !== 'LOW').sort((a, b) => b.score - a.score).slice(0, 50),
      comparisons: { branches: comparison((flow) => flow.branch.name), positions: comparison((flow) => flow.employee.jobTitle ?? 'Sin puesto'), cohorts: comparison((flow) => flow.startedAt.toISOString().slice(0, 7)), templates: comparison((flow) => flow.template ? `${flow.template.name} v${flow.template.version}` : 'Sin plantilla') },
    };
  }
}
