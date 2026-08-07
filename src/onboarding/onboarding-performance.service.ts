import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { CreatePerformanceEvaluationDto, CreatePerformanceObjectiveDto } from './dto/onboarding.dto';

@Injectable()
export class OnboardingPerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  private branchScope(actor: JwtPayload) {
    return actor.scope === AccessScope.BRANCH ? { branchId: { in: actor.allowedBranchIds } } : {};
  }

  private async flow(tenantId: string, actor: JwtPayload, flowId: string) {
    const flow = await this.prisma.onboardingFlow.findFirst({ where: { id: flowId, tenantId, ...this.branchScope(actor) } });
    if (!flow) throw new NotFoundException('Expediente de incorporación no encontrado');
    return flow;
  }

  async overview(tenantId: string, actor: JwtPayload, flowId: string) {
    const flow = await this.flow(tenantId, actor, flowId);
    const [objectives, evaluations] = await this.prisma.$transaction([
      this.prisma.performanceObjective.findMany({ where: { tenantId, workflowId: flow.workflowId }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] }),
      this.prisma.performanceEvaluation.findMany({ where: { tenantId, workflowId: flow.workflowId }, orderBy: { periodDays: 'asc' } }),
    ]);
    const totalWeight = objectives.reduce((total, objective) => total + objective.weight, 0);
    const objectiveProgress = totalWeight ? Math.round(objectives.reduce((total, objective) => total + Math.min(100, objective.currentValue / objective.targetValue * 100) * objective.weight, 0) / totalWeight) : 0;
    return { objectives, evaluations, objectiveProgress, readyForProductivity: evaluations.some((evaluation) => evaluation.score >= 70) && (objectives.length === 0 || objectiveProgress >= 70) };
  }

  async createObjective(tenantId: string, actor: JwtPayload, flowId: string, dto: CreatePerformanceObjectiveDto) {
    const flow = await this.flow(tenantId, actor, flowId);
    return this.prisma.performanceObjective.create({ data: { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, employeeId: flow.employeeId, createdByUserId: actor.sub, title: dto.title, description: dto.description, targetValue: dto.targetValue, currentValue: dto.currentValue, weight: dto.weight, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined } });
  }

  async recordEvaluation(tenantId: string, actor: JwtPayload, flowId: string, dto: CreatePerformanceEvaluationDto) {
    const flow = await this.flow(tenantId, actor, flowId);
    return this.prisma.performanceEvaluation.upsert({ where: { workflowId_periodDays: { workflowId: flow.workflowId, periodDays: dto.periodDays } }, update: { score: dto.score, notes: dto.notes, evaluatorUserId: actor.sub, completedAt: new Date() }, create: { tenantId, branchId: flow.branchId, workflowId: flow.workflowId, employeeId: flow.employeeId, evaluatorUserId: actor.sub, periodDays: dto.periodDays, score: dto.score, notes: dto.notes } });
  }
}
