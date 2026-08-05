import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus, Prisma } from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { AtsAnalyticsQueryDto } from './dto/ats-analytics-query.dto';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const TERMINAL_STATUSES = new Set<ApplicationStatus>([
  ApplicationStatus.HIRED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
]);

const applicationInclude = {
  candidate: { select: { id: true } },
  vacancy: {
    select: {
      id: true,
      title: true,
      status: true,
      openings: true,
      createdAt: true,
      updatedAt: true,
      branchId: true,
      branch: { select: { id: true, name: true } },
      stages: {
        select: {
          id: true,
          code: true,
          name: true,
          position: true,
          applicationStatus: true,
          slaHours: true,
        },
        orderBy: { position: 'asc' as const },
      },
    },
  },
  currentStage: {
    select: {
      id: true,
      code: true,
      name: true,
      position: true,
      applicationStatus: true,
      slaHours: true,
    },
  },
  assignedRecruiter: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  structuredRejectionReason: {
    select: { id: true, code: true, label: true, category: true },
  },
  timelineEvents: {
    where: { type: { in: ['STAGE_CHANGED', 'HIRED'] as const } },
    select: {
      type: true,
      occurredAt: true,
      createdAt: true,
      previousValue: true,
      newValue: true,
    },
    orderBy: { occurredAt: 'asc' as const },
  },
} satisfies Prisma.VacancyApplicationInclude;

type AnalyticsApplication = Prisma.VacancyApplicationGetPayload<{
  include: typeof applicationInclude;
}>;

export interface AnalyticsContext {
  type: 'GLOBAL' | 'TENANT' | 'BRANCH';
  tenantId: string | null;
  branchId: string | null;
  branchName: string | null;
}

@Injectable()
export class AtsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(actor: JwtPayload, query: AtsAnalyticsQueryDto) {
    const context = await this.resolveContext(actor, query);
    const period = this.resolvePeriod(query);
    await this.validateDimensions(context, query);

    const applicationWhere = this.applicationWhere(context, query);
    const currentPeriodWhere = {
      ...applicationWhere,
      appliedAt: { gte: period.from, lte: period.to },
    } satisfies Prisma.VacancyApplicationWhereInput;
    const previousPeriodWhere = {
      ...applicationWhere,
      appliedAt: { gte: period.previousFrom, lte: period.previousTo },
    } satisfies Prisma.VacancyApplicationWhereInput;
    const activityApplicationWhere = this.applicationRelationWhere(context, query);
    const tenantWhere = context.tenantId ? { tenantId: context.tenantId } : {};
    const branchWhere = context.branchId ? { branchId: context.branchId } : {};

    const [applications, previousApplications, vacancies, interviews, offers] =
      await Promise.all([
        this.prisma.vacancyApplication.findMany({
          where: currentPeriodWhere,
          include: applicationInclude,
          orderBy: { appliedAt: 'asc' },
        }),
        this.prisma.vacancyApplication.findMany({
          where: previousPeriodWhere,
          select: {
            status: true,
            appliedAt: true,
            updatedAt: true,
            reviewedAt: true,
            timelineEvents: {
              where: { type: 'HIRED' },
              select: { occurredAt: true, createdAt: true },
              take: 1,
            },
          },
        }),
        this.prisma.vacancy.findMany({
          where: {
            ...tenantWhere,
            ...branchWhere,
            ...(query.vacancyId ? { id: query.vacancyId } : {}),
            createdAt: { lte: period.to },
          },
          select: {
            id: true,
            title: true,
            status: true,
            openings: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.applicationInterview.findMany({
          where: {
            ...tenantWhere,
            OR: [
              { status: 'COMPLETED', completedAt: { gte: period.from, lte: period.to } },
              { status: { not: 'COMPLETED' }, startsAt: { gte: period.from, lte: period.to } },
            ],
            application: activityApplicationWhere,
          },
          select: {
            status: true,
            completedAt: true,
            createdAt: true,
            startsAt: true,
            endsAt: true,
            scorecards: { select: { overallRating: true, signedAt: true } },
          },
        }),
        this.prisma.jobOffer.findMany({
          where: {
            ...tenantWhere,
            ...branchWhere,
            createdAt: { gte: period.from, lte: period.to },
            application: activityApplicationWhere,
          },
          select: {
            status: true,
            createdAt: true,
            updatedAt: true,
            acceptedAt: true,
            rejectedAt: true,
            expiredAt: true,
            approvals: { select: { status: true, decidedAt: true } },
            versions: { select: { source: true } },
          },
        }),
      ]);

    const now = new Date();
    const current = this.summary(applications, now);
    const previous = this.previousSummary(previousApplications);
    const funnel = this.funnel(applications, now);
    const sources = this.sources(applications);
    const sla = this.sla(applications, now);
    const vacancyPerformance = this.vacancyPerformance(vacancies, applications, now);
    const recruiterPerformance = this.recruiterPerformance(applications, now);
    const interviewMetrics = this.interviews(interviews);
    const offerMetrics = this.offers(offers);
    const rejectionReasons = this.rejections(applications);
    const trends = this.trends(
      applications,
      period.from,
      period.to,
      query.granularity ?? this.defaultGranularity(period.from, period.to),
    );

    return {
      generatedAt: now.toISOString(),
      source: 'Postulaciones, auditoría de etapas, entrevistas y ofertas persistentes',
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        previousFrom: period.previousFrom.toISOString(),
        previousTo: period.previousTo.toISOString(),
      },
      scope: context,
      filters: {
        vacancyId: query.vacancyId ?? null,
        recruiterId: query.recruiterId ?? null,
        granularity: query.granularity ?? this.defaultGranularity(period.from, period.to),
      },
      summary: {
        ...current,
        changes: {
          applications: this.change(current.applications, previous.applications),
          hires: this.change(current.hires, previous.hires),
          conversionRate: this.points(current.conversionRate, previous.conversionRate),
          averageTimeToHireHours: this.change(
            current.averageTimeToHireHours,
            previous.averageTimeToHireHours,
          ),
        },
      },
      funnel,
      trends,
      sources,
      vacancies: vacancyPerformance,
      recruiters: recruiterPerformance,
      sla,
      interviews: interviewMetrics,
      offers: offerMetrics,
      rejectionReasons,
      insights: this.insights({
        applications: current.applications,
        funnel,
        sources,
        sla,
        interviews: interviewMetrics,
        offers: offerMetrics,
      }),
    };
  }

  async exportCsv(actor: JwtPayload, query: AtsAnalyticsQueryDto) {
    const report = await this.overview(actor, query);
    const rows: Array<Array<string | number>> = [
      ['Resumen', 'Postulaciones', report.summary.applications, ''],
      ['Resumen', 'Candidatos únicos', report.summary.uniqueCandidates, ''],
      ['Resumen', 'Contrataciones', report.summary.hires, ''],
      ['Resumen', 'Conversión', report.summary.conversionRate, '%'],
      ['Resumen', 'Tiempo promedio de contratación', report.summary.averageTimeToHireHours, 'horas'],
      ['Resumen', 'Cumplimiento SLA', report.sla.complianceRate, '%'],
      ...report.funnel.map((item) => ['Embudo', item.stageName, item.reached, `${item.conversionRate}%`]),
      ...report.sources.map((item) => ['Fuente', item.source, item.applications, `${item.conversionRate}%`]),
      ...report.vacancies.map((item) => ['Vacante', item.title, item.applications, `${item.conversionRate}%`]),
      ...report.recruiters.map((item) => ['Reclutador', item.name, item.applications, `${item.conversionRate}%`]),
      ...report.rejectionReasons.map((item) => ['Descarte', item.label, item.count, `${item.percentage}%`]),
    ];
    const content = [
      ['Dimensión', 'Indicador', 'Valor', 'Detalle'],
      ...rows,
    ].map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\r\n');
    return {
      filename: `analitica-ats-${report.period.from.slice(0, 10)}-${report.period.to.slice(0, 10)}.csv`,
      mimeType: 'text/csv;charset=utf-8',
      content: `\uFEFF${content}`,
      generatedAt: report.generatedAt,
    };
  }

  private summary(applications: AnalyticsApplication[], now: Date) {
    const hires = applications.filter((item) => item.status === ApplicationStatus.HIRED);
    const rejected = applications.filter((item) => item.status === ApplicationStatus.REJECTED).length;
    const withdrawn = applications.filter((item) => item.status === ApplicationStatus.WITHDRAWN).length;
    const timeToHire = hires.map((item) => this.hiredAt(item).getTime() - item.appliedAt.getTime()).filter((value) => value >= 0).map((value) => value / HOUR);
    const timeToReview = applications.flatMap((item) => item.reviewedAt && item.reviewedAt >= item.appliedAt ? [(item.reviewedAt.getTime() - item.appliedAt.getTime()) / HOUR] : []);
    return {
      applications: applications.length,
      uniqueCandidates: new Set(applications.map((item) => item.candidateId)).size,
      hires: hires.length,
      rejected,
      withdrawn,
      activePipeline: applications.filter((item) => !TERMINAL_STATUSES.has(item.status)).length,
      conversionRate: this.percent(hires.length, applications.length),
      rejectionRate: this.percent(rejected, applications.length),
      withdrawalRate: this.percent(withdrawn, applications.length),
      averageTimeToHireHours: this.average(timeToHire),
      medianTimeToHireHours: this.median(timeToHire),
      averageTimeToFirstReviewHours: this.average(timeToReview),
      averageCandidateAgeHours: this.average(
        applications.filter((item) => !TERMINAL_STATUSES.has(item.status)).map((item) => (now.getTime() - item.appliedAt.getTime()) / HOUR),
      ),
    };
  }

  private previousSummary(applications: Array<{ status: ApplicationStatus; appliedAt: Date; updatedAt: Date; timelineEvents: Array<{ occurredAt: Date | null; createdAt: Date }> }>) {
    const hires = applications.filter((item) => item.status === ApplicationStatus.HIRED);
    return {
      applications: applications.length,
      hires: hires.length,
      conversionRate: this.percent(hires.length, applications.length),
      averageTimeToHireHours: this.average(hires.map((item) => ((item.timelineEvents[0]?.occurredAt ?? item.timelineEvents[0]?.createdAt ?? item.updatedAt).getTime() - item.appliedAt.getTime()) / HOUR)),
    };
  }

  private funnel(applications: AnalyticsApplication[], now: Date) {
    const stages = new Map<string, { code: string; name: string; positions: number[]; reached: Set<string>; durations: number[] }>();
    const ensure = (code: string, name: string, position: number) => {
      const current = stages.get(code) ?? { code, name, positions: [], reached: new Set<string>(), durations: [] };
      current.positions.push(position);
      stages.set(code, current);
      return current;
    };
    for (const application of applications) {
      const known = new Map(application.vacancy.stages.map((stage) => [stage.code, stage]));
      const initial = application.vacancy.stages[0];
      if (initial) ensure(initial.code, initial.name, initial.position).reached.add(application.id);
      let cursor = application.appliedAt;
      for (const event of application.timelineEvents.filter((item) => item.type === 'STAGE_CHANGED')) {
        const at = event.occurredAt ?? event.createdAt;
        const previous = this.jsonObject(event.previousValue);
        const next = this.jsonObject(event.newValue);
        const previousCode = this.stringValue(previous.stageCode);
        if (previousCode) {
          const stage = known.get(previousCode);
          const metric = ensure(previousCode, stage?.name ?? this.stringValue(previous.stageName) ?? previousCode, stage?.position ?? 999);
          metric.reached.add(application.id);
          if (at >= cursor) metric.durations.push((at.getTime() - cursor.getTime()) / HOUR);
        }
        const nextCode = this.stringValue(next.stageCode);
        if (nextCode) {
          const stage = known.get(nextCode);
          ensure(nextCode, stage?.name ?? this.stringValue(next.stageName) ?? nextCode, stage?.position ?? 999).reached.add(application.id);
        }
        cursor = at;
      }
      if (application.currentStage) {
        const metric = ensure(application.currentStage.code, application.currentStage.name, application.currentStage.position);
        metric.reached.add(application.id);
        if (!TERMINAL_STATUSES.has(application.status) && now >= cursor) {
          metric.durations.push((now.getTime() - cursor.getTime()) / HOUR);
        }
      }
    }
    const ordered = [...stages.values()].sort((a, b) => this.average(a.positions) - this.average(b.positions));
    return ordered.map((stage, index) => {
      const previous = index === 0 ? applications.length : ordered[index - 1].reached.size;
      return {
        stageCode: stage.code,
        stageName: stage.name,
        reached: stage.reached.size,
        conversionRate: this.percent(stage.reached.size, previous),
        conversionFromApplications: this.percent(stage.reached.size, applications.length),
        dropOff: Math.max(0, previous - stage.reached.size),
        dropOffRate: this.percent(Math.max(0, previous - stage.reached.size), previous),
        averageHours: this.average(stage.durations),
        sampleSize: stage.durations.length,
      };
    });
  }

  private sources(applications: AnalyticsApplication[]) {
    const grouped = new Map<string, { applications: number; hires: number; rejected: number }>();
    for (const application of applications) {
      const source = this.applicationSource(application.dynamicResponses);
      const row = grouped.get(source) ?? { applications: 0, hires: 0, rejected: 0 };
      row.applications += 1;
      if (application.status === ApplicationStatus.HIRED) row.hires += 1;
      if (application.status === ApplicationStatus.REJECTED) row.rejected += 1;
      grouped.set(source, row);
    }
    return [...grouped.entries()].map(([source, row]) => ({
      source,
      ...row,
      conversionRate: this.percent(row.hires, row.applications),
      rejectionRate: this.percent(row.rejected, row.applications),
    })).sort((a, b) => b.applications - a.applications);
  }

  private sla(applications: AnalyticsApplication[], now: Date) {
    const measurable = applications.filter((item) => !TERMINAL_STATUSES.has(item.status) && item.currentStage?.slaHours);
    const breached = measurable.filter((item) => (now.getTime() - item.stageEnteredAt.getTime()) / HOUR > (item.currentStage?.slaHours ?? Infinity));
    return {
      measurable: measurable.length,
      compliant: measurable.length - breached.length,
      breached: breached.length,
      complianceRate: measurable.length ? this.percent(measurable.length - breached.length, measurable.length) : 100,
      warningSent: applications.filter((item) => item.slaWarningSentAt).length,
      escalated: applications.filter((item) => item.slaEscalatedAt).length,
      reassigned: applications.filter((item) => item.slaReassignedAt).length,
      byStage: this.groupCount(breached, (item) => item.currentStage?.name ?? 'Sin etapa'),
    };
  }

  private vacancyPerformance(vacancies: Array<{ id: string; title: string; status: string; openings: number; createdAt: Date; updatedAt: Date }>, applications: AnalyticsApplication[], now: Date) {
    return vacancies.map((vacancy) => {
      const items = applications.filter((item) => item.vacancyId === vacancy.id);
      const hires = items.filter((item) => item.status === ApplicationStatus.HIRED);
      const times = hires.map((item) => (this.hiredAt(item).getTime() - item.appliedAt.getTime()) / HOUR);
      return {
        id: vacancy.id,
        title: vacancy.title,
        status: vacancy.status,
        openings: vacancy.openings,
        applications: items.length,
        active: items.filter((item) => !TERMINAL_STATUSES.has(item.status)).length,
        hires: hires.length,
        rejected: items.filter((item) => item.status === ApplicationStatus.REJECTED).length,
        conversionRate: this.percent(hires.length, items.length),
        averageTimeToHireHours: this.average(times),
        daysOpen: Math.max(0, Math.round(((vacancy.status === 'OPEN' ? now : vacancy.updatedAt).getTime() - vacancy.createdAt.getTime()) / DAY)),
        fillRate: this.percent(hires.length, vacancy.openings),
      };
    }).sort((a, b) => b.applications - a.applications);
  }

  private recruiterPerformance(applications: AnalyticsApplication[], now: Date) {
    const grouped = new Map<string, { id: string | null; name: string; applications: AnalyticsApplication[] }>();
    for (const application of applications) {
      const recruiter = application.assignedRecruiter;
      const key = recruiter?.id ?? 'UNASSIGNED';
      const name = recruiter ? `${recruiter.firstName} ${recruiter.lastName}`.trim() || recruiter.email : 'Sin asignar';
      const row = grouped.get(key) ?? { id: recruiter?.id ?? null, name, applications: [] };
      row.applications.push(application);
      grouped.set(key, row);
    }
    return [...grouped.values()].map((row) => {
      const hires = row.applications.filter((item) => item.status === ApplicationStatus.HIRED).length;
      const active = row.applications.filter((item) => !TERMINAL_STATUSES.has(item.status));
      const overdue = active.filter((item) => item.currentStage?.slaHours && (now.getTime() - item.stageEnteredAt.getTime()) / HOUR > item.currentStage.slaHours).length;
      return {
        id: row.id,
        name: row.name,
        applications: row.applications.length,
        active: active.length,
        hires,
        conversionRate: this.percent(hires, row.applications.length),
        overdue,
        averageActiveStageHours: this.average(active.map((item) => (now.getTime() - item.stageEnteredAt.getTime()) / HOUR)),
      };
    }).sort((a, b) => b.active - a.active);
  }

  private interviews(interviews: Array<{ status: string; completedAt: Date | null; createdAt: Date; startsAt: Date; endsAt: Date; scorecards: Array<{ overallRating: number; signedAt: Date | null }> }>) {
    const counts = this.countBy(interviews.map((item) => item.status));
    const ratings = interviews.flatMap((item) => item.scorecards.map((scorecard) => Number(scorecard.overallRating)));
    return {
      total: interviews.length,
      scheduled: (counts.SCHEDULED ?? 0) + (counts.CONFIRMED ?? 0),
      completed: counts.COMPLETED ?? 0,
      cancelled: counts.CANCELED ?? 0,
      noShow: counts.NO_SHOW ?? 0,
      completionRate: this.percent(counts.COMPLETED ?? 0, interviews.length),
      noShowRate: this.percent(counts.NO_SHOW ?? 0, interviews.length),
      cancellationRate: this.percent(counts.CANCELED ?? 0, interviews.length),
      averageSchedulingLeadHours: this.average(interviews.map((item) => Math.max(0, (item.startsAt.getTime() - item.createdAt.getTime()) / HOUR))),
      averageDurationMinutes: this.average(interviews.map((item) => Math.max(0, (item.endsAt.getTime() - item.startsAt.getTime()) / 60_000))),
      averageScore: this.average(ratings),
      signedScorecards: interviews.reduce((sum, item) => sum + item.scorecards.filter((scorecard) => scorecard.signedAt).length, 0),
      byStatus: Object.entries(counts).map(([status, count]) => ({ status, count })),
    };
  }

  private offers(offers: Array<{ status: string; createdAt: Date; updatedAt: Date; acceptedAt: Date | null; rejectedAt: Date | null; expiredAt: Date | null; approvals: Array<{ status: string; decidedAt: Date | null }>; versions: Array<{ source: string }> }>) {
    const counts = this.countBy(offers.map((item) => item.status));
    const decided = (counts.ACCEPTED ?? 0) + (counts.REJECTED ?? 0) + (counts.EXPIRED ?? 0);
    const approvalHours = offers.flatMap((offer) => {
      const decisions = offer.approvals.flatMap((approval) => approval.decidedAt ? [approval.decidedAt] : []);
      return decisions.length ? [(Math.max(...decisions.map((date) => date.getTime())) - offer.createdAt.getTime()) / HOUR] : [];
    });
    return {
      total: offers.length,
      sent: counts.SENT ?? 0,
      accepted: counts.ACCEPTED ?? 0,
      rejected: counts.REJECTED ?? 0,
      expired: counts.EXPIRED ?? 0,
      countered: counts.COUNTERED ?? 0,
      acceptanceRate: this.percent(counts.ACCEPTED ?? 0, decided),
      counterOfferRate: this.percent(offers.filter((offer) => offer.versions.some((version) => version.source === 'CANDIDATE')).length, offers.length),
      averageApprovalHours: this.average(approvalHours),
      averageResponseHours: this.average(offers.flatMap((offer) => {
        const response = offer.acceptedAt ?? offer.rejectedAt ?? offer.expiredAt;
        return response ? [(response.getTime() - offer.createdAt.getTime()) / HOUR] : [];
      })),
      byStatus: Object.entries(counts).map(([status, count]) => ({ status, count })),
    };
  }

  private rejections(applications: AnalyticsApplication[]) {
    const rejected = applications.filter((item) => item.status === ApplicationStatus.REJECTED);
    const grouped = new Map<string, { code: string | null; label: string; category: string | null; count: number }>();
    for (const application of rejected) {
      const reason = application.structuredRejectionReason;
      const key = reason?.id ?? 'UNSTRUCTURED';
      const row = grouped.get(key) ?? { code: reason?.code ?? null, label: reason?.label ?? 'Sin motivo estructurado', category: reason?.category ?? null, count: 0 };
      row.count += 1;
      grouped.set(key, row);
    }
    return [...grouped.values()].map((row) => ({ ...row, percentage: this.percent(row.count, rejected.length) })).sort((a, b) => b.count - a.count);
  }

  private trends(applications: AnalyticsApplication[], from: Date, to: Date, granularity: 'day' | 'week' | 'month') {
    const buckets = new Map<string, { period: string; applications: number; hires: number; rejected: number; withdrawn: number }>();
    for (let cursor = new Date(from); cursor <= to; cursor = this.nextBucket(cursor, granularity)) {
      const key = this.bucket(cursor, granularity);
      buckets.set(key, { period: key, applications: 0, hires: 0, rejected: 0, withdrawn: 0 });
    }
    for (const application of applications) {
      const key = this.bucket(application.appliedAt, granularity);
      const row = buckets.get(key) ?? { period: key, applications: 0, hires: 0, rejected: 0, withdrawn: 0 };
      row.applications += 1;
      if (application.status === ApplicationStatus.HIRED) row.hires += 1;
      if (application.status === ApplicationStatus.REJECTED) row.rejected += 1;
      if (application.status === ApplicationStatus.WITHDRAWN) row.withdrawn += 1;
      buckets.set(key, row);
    }
    return [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period));
  }

  private insights(input: { applications: number; funnel: Array<{ stageName: string; dropOffRate: number; averageHours: number }>; sources: Array<{ source: string; applications: number }>; sla: { breached: number; complianceRate: number }; interviews: { noShowRate: number }; offers: { acceptanceRate: number; total: number } }) {
    const insights: Array<{ severity: 'info' | 'warning' | 'critical'; code: string; title: string; detail: string }> = [];
    const bottleneck = [...input.funnel].sort((a, b) => b.averageHours - a.averageHours)[0];
    if (bottleneck?.averageHours > 0) insights.push({ severity: bottleneck.averageHours > 120 ? 'warning' : 'info', code: 'STAGE_BOTTLENECK', title: `Mayor permanencia: ${bottleneck.stageName}`, detail: `Promedio de ${this.round(bottleneck.averageHours)} horas en la etapa.` });
    const dropOff = [...input.funnel].sort((a, b) => b.dropOffRate - a.dropOffRate)[0];
    if (dropOff?.dropOffRate >= 20) insights.push({ severity: dropOff.dropOffRate >= 50 ? 'critical' : 'warning', code: 'FUNNEL_DROP_OFF', title: `Pérdida elevada en ${dropOff.stageName}`, detail: `${dropOff.dropOffRate}% no continúa desde la etapa anterior.` });
    const unattributed = input.sources.find((item) => item.source === 'No informado')?.applications ?? 0;
    if (this.percent(unattributed, input.applications) >= 20) insights.push({ severity: 'warning', code: 'SOURCE_QUALITY', title: 'Origen de candidatos incompleto', detail: `${this.percent(unattributed, input.applications)}% de las postulaciones no tiene fuente atribuida.` });
    if (input.sla.breached > 0) insights.push({ severity: input.sla.complianceRate < 70 ? 'critical' : 'warning', code: 'SLA_RISK', title: 'Postulaciones fuera de SLA', detail: `${input.sla.breached} postulaciones requieren atención.` });
    if (input.interviews.noShowRate >= 10) insights.push({ severity: 'warning', code: 'INTERVIEW_NO_SHOW', title: 'Ausencias en entrevistas', detail: `La tasa de ausencia es ${input.interviews.noShowRate}%.` });
    if (input.offers.total > 0 && input.offers.acceptanceRate < 70) insights.push({ severity: 'warning', code: 'OFFER_ACCEPTANCE', title: 'Aceptación de ofertas por debajo del objetivo', detail: `La aceptación actual es ${input.offers.acceptanceRate}%.` });
    return insights;
  }

  private async resolveContext(actor: JwtPayload, query: AtsAnalyticsQueryDto): Promise<AnalyticsContext> {
    const global = actor.isSuperAdmin && actor.isGlobalContext && !query.tenantId;
    const tenantId = global ? null : query.tenantId ?? actor.activeTenantId ?? actor.tenantId;
    if (query.tenantId && !actor.isSuperAdmin && !actor.allowedTenantIds.includes(query.tenantId)) throw new ForbiddenException('Empresa fuera del alcance autorizado');
    const branchRestricted = !actor.isSuperAdmin && actor.scope === AccessScope.BRANCH;
    let branchId = query.scope === 'tenant' && !branchRestricted ? null : query.branchId ?? actor.activeBranchId;
    if (branchRestricted) {
      branchId = query.branchId ?? actor.activeBranchId;
      if (!branchId || !actor.allowedBranchIds.includes(branchId)) throw new ForbiddenException('Sucursal fuera del alcance autorizado');
    } else if (branchId && !actor.isSuperAdmin && actor.allowedBranchIds.length > 0 && !actor.allowedBranchIds.includes(branchId)) {
      throw new ForbiddenException('Sucursal fuera del alcance autorizado');
    }
    if (branchId) {
      const branch = await this.prisma.branch.findFirst({ where: { id: branchId, ...(tenantId ? { tenantId } : {}) }, select: { name: true } });
      if (!branch) throw new NotFoundException('Sucursal no encontrada');
      return { type: 'BRANCH', tenantId, branchId, branchName: branch.name };
    }
    return { type: global ? 'GLOBAL' : 'TENANT', tenantId, branchId: null, branchName: null };
  }

  private async validateDimensions(context: AnalyticsContext, query: AtsAnalyticsQueryDto) {
    if (query.vacancyId) {
      const vacancy = await this.prisma.vacancy.findFirst({ where: { id: query.vacancyId, ...(context.tenantId ? { tenantId: context.tenantId } : {}), ...(context.branchId ? { branchId: context.branchId } : {}) }, select: { id: true } });
      if (!vacancy) throw new NotFoundException('Vacante no encontrada');
    }
    if (query.recruiterId) {
      const user = await this.prisma.user.findFirst({ where: { id: query.recruiterId, ...(context.tenantId ? { tenantId: context.tenantId } : {}), ...(context.branchId ? { OR: [{ activeBranchId: context.branchId }, { branchAccesses: { some: { branchId: context.branchId } } }] } : {}) }, select: { id: true } });
      if (!user) throw new NotFoundException('Reclutador no encontrado');
    }
  }

  private applicationWhere(context: AnalyticsContext, query: AtsAnalyticsQueryDto): Prisma.VacancyApplicationWhereInput {
    return { ...(context.tenantId ? { tenantId: context.tenantId } : {}), ...(query.vacancyId ? { vacancyId: query.vacancyId } : {}), ...(query.recruiterId ? { assignedRecruiterId: query.recruiterId } : {}), ...(context.branchId ? { vacancy: { branchId: context.branchId } } : {}) };
  }

  private applicationRelationWhere(context: AnalyticsContext, query: AtsAnalyticsQueryDto): Prisma.VacancyApplicationWhereInput {
    return this.applicationWhere(context, query);
  }

  private resolvePeriod(query: AtsAnalyticsQueryDto) {
    const to = query.to ? new Date(query.to.length === 10 ? `${query.to}T23:59:59.999Z` : query.to) : new Date();
    const from = query.from ? new Date(query.from.length === 10 ? `${query.from}T00:00:00.000Z` : query.from) : new Date(to.getTime() - 89 * DAY);
    if (from > to) throw new BadRequestException('La fecha inicial debe ser anterior a la fecha final');
    if (to.getTime() - from.getTime() > 366 * DAY) throw new BadRequestException('El periodo máximo permitido es de 366 días');
    const duration = to.getTime() - from.getTime() + 1;
    return { from, to, previousFrom: new Date(from.getTime() - duration), previousTo: new Date(from.getTime() - 1) };
  }

  private hiredAt(application: AnalyticsApplication) {
    const event = application.timelineEvents.find((item) => item.type === 'HIRED');
    return event?.occurredAt ?? event?.createdAt ?? application.updatedAt;
  }

  private applicationSource(value: Prisma.JsonValue | null) {
    const data = this.jsonObject(value);
    for (const key of ['utm_source', 'utmSource', 'candidateSource', 'sourceType', 'source', 'referralSource', 'jobBoard', 'origin']) {
      const source = this.stringValue(data[key]);
      if (source) return source.trim();
    }
    return 'No informado';
  }

  private bucket(value: Date, granularity: 'day' | 'week' | 'month') {
    const date = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
    if (granularity === 'week') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    if (granularity === 'month') date.setUTCDate(1);
    return date.toISOString().slice(0, 10);
  }

  private nextBucket(value: Date, granularity: 'day' | 'week' | 'month') {
    const next = new Date(value);
    if (granularity === 'day') next.setUTCDate(next.getUTCDate() + 1);
    if (granularity === 'week') next.setUTCDate(next.getUTCDate() + 7);
    if (granularity === 'month') { next.setUTCDate(1); next.setUTCMonth(next.getUTCMonth() + 1); }
    return next;
  }

  private defaultGranularity(from: Date, to: Date): 'day' | 'week' | 'month' {
    const days = (to.getTime() - from.getTime()) / DAY;
    return days <= 31 ? 'day' : days <= 120 ? 'week' : 'month';
  }

  private groupCount<T>(items: T[], key: (item: T) => string) {
    const values = new Map<string, number>();
    for (const item of items) values.set(key(item), (values.get(key(item)) ?? 0) + 1);
    return [...values.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }

  private countBy(values: string[]) { return values.reduce<Record<string, number>>((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {}); }
  private average(values: number[]) { return values.length ? this.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0; }
  private median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return this.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2); }
  private percent(value: number, total: number) { return total ? this.round((value / total) * 100) : 0; }
  private change(value: number, previous: number) { return previous ? this.round(((value - previous) / previous) * 100) : value ? 100 : 0; }
  private points(value: number, previous: number) { return this.round(value - previous); }
  private round(value: number) { return Math.round(value * 10) / 10; }
  private jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  private stringValue(value: Prisma.JsonValue | undefined) { return typeof value === 'string' && value.trim() ? value : null; }
  private csvCell(value: string | number) { const safe = String(value).replace(/"/g, '""'); return `"${/^[=+\-@]/.test(safe) ? `'${safe}` : safe}"`; }
}
