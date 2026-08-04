import { createHash, createHmac } from 'crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AiEvidenceSufficiency, Prisma, ScorecardCriterionType, ScorecardTemplateScope } from '@prisma/client';
import { AccessScope } from '../common/enums/access-scope.enum';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { PrismaService } from '../common/prisma/prisma.service';
import { SignAiCompetencyAssessmentDto } from './dto/recruitment.dto';
import { CompetencyAiProviderService, CompetencyAiSource, CompetencyAiTarget } from './competency-ai-provider.service';

const assessmentInclude = {
  items: { orderBy: [{ weight: 'desc' as const }, { competencyName: 'asc' as const }] },
  generatedBy: { select: { id: true, firstName: true, lastName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  signedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.AiCompetencyAssessmentInclude;

const applicationInclude = {
  vacancy: { select: { id: true, branchId: true, title: true, description: true, requirements: true } },
  candidate: { select: { resumeFiles: { where: { status: 'ACTIVE' as const }, select: { id: true }, take: 1 } } },
  interviews: { include: { scorecards: { where: { status: 'SIGNED' as const }, include: { responses: true } } } },
  externalAssessments: { where: { status: 'COMPLETED' as const } },
} satisfies Prisma.VacancyApplicationInclude;

type ApplicationEvidence = Prisma.VacancyApplicationGetPayload<{ include: typeof applicationInclude }>;
type Target = CompetencyAiTarget & { criterionId?: string };

@Injectable()
export class CompetencyAiAssessmentService {
  constructor(private readonly prisma: PrismaService, private readonly provider: CompetencyAiProviderService) {}

  async latest(tenantId: string, actor: JwtPayload, applicationId: string) {
    const application = await this.assertApplicationAccess(tenantId, actor, applicationId);
    const assessment = await this.prisma.aiCompetencyAssessment.findFirst({
      where: { tenantId, applicationId },
      include: assessmentInclude,
      orderBy: { version: 'desc' },
    });
    return { assessment, guardrail: this.guardrail(), sourceAvailability: this.sourceAvailability(application) };
  }

  async generate(tenantId: string, actor: JwtPayload, applicationId: string) {
    const application = await this.assertApplicationAccess(tenantId, actor, applicationId);
    const competencies = await this.resolveCompetencies(tenantId, application.vacancyId, application.currentStageId);
    if (!competencies.length) {
      throw new BadRequestException('Configura competencias o una plantilla de scorecard activa antes de ejecutar el análisis');
    }
    const sources = this.buildSources(application);
    const result = await this.provider.analyze({ competencies: competencies.map(({ criterionId: _id, ...item }) => item), sources });
    const normalized = competencies.map((target) => this.normalizeCompetency(
      target,
      result.competencies.find((item) => item.code.trim().toUpperCase() === target.code),
      sources,
    ));
    const latest = await this.prisma.aiCompetencyAssessment.aggregate({ where: { applicationId }, _max: { version: true } });
    return this.prisma.aiCompetencyAssessment.create({
      data: {
        tenantId,
        branchId: application.vacancy.branchId,
        applicationId,
        version: (latest._max.version ?? 0) + 1,
        provider: this.provider.provider,
        model: this.provider.model,
        promptVersion: this.provider.promptVersion,
        summary: result.summary.slice(0, 4000),
        sourceSnapshot: sources.map((source) => ({ id: source.id, label: source.label, sha256: createHash('sha256').update(source.content).digest('hex') })) as Prisma.InputJsonValue,
        generatedByUserId: actor.sub,
        items: { create: normalized },
      },
      include: assessmentInclude,
    });
  }

  async sign(tenantId: string, actor: JwtPayload, applicationId: string, assessmentId: string, dto: SignAiCompetencyAssessmentDto) {
    await this.assertApplicationAccess(tenantId, actor, applicationId);
    const assessment = await this.prisma.aiCompetencyAssessment.findFirst({ where: { id: assessmentId, tenantId, applicationId }, include: { items: true } });
    if (!assessment) throw new NotFoundException('Evaluación de IA no encontrada');
    if (assessment.status === 'SIGNED') throw new ConflictException('Una evaluación firmada es inmutable');
    if (!dto.acknowledgement) throw new BadRequestException('Debes confirmar la revisión humana antes de firmar');
    const reviews = new Map(dto.items.map((item) => [item.itemId, item]));
    if (reviews.size !== assessment.items.length || assessment.items.some((item) => !reviews.get(item.id)?.confirmed)) {
      throw new BadRequestException('Debes revisar y confirmar todas las competencias');
    }
    if (dto.items.some((item) => !assessment.items.some((stored) => stored.id === item.itemId))) {
      throw new BadRequestException('La revisión contiene una competencia ajena a la evaluación');
    }
    const signedAt = new Date();
    const canonical = JSON.stringify({ assessmentId, version: assessment.version, reviewerUserId: actor.sub, reviewerNotes: dto.reviewerNotes?.trim() || null, items: [...dto.items].sort((a, b) => a.itemId.localeCompare(b.itemId)), acknowledgement: true, signedAt: signedAt.toISOString() });
    const signatureHash = createHmac('sha256', process.env.AI_COMPETENCY_SIGNATURE_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'local-ai-competency-signature').update(canonical).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.aiCompetencyAssessment.updateMany({
        where: { id: assessmentId, status: 'READY_FOR_REVIEW' },
        data: { status: 'SIGNED', reviewedByUserId: actor.sub, reviewedAt: signedAt, reviewerNotes: dto.reviewerNotes?.trim() || null, signedByUserId: actor.sub, signedAt, signatureHash },
      });
      if (claimed.count !== 1) throw new ConflictException('La evaluación ya fue firmada por otro responsable');
      for (const item of dto.items) {
        await tx.aiCompetencyAssessmentItem.update({ where: { id: item.itemId }, data: { humanScore: item.humanScore, reviewerNotes: item.reviewerNotes?.trim() || null, reviewerConfirmed: true } });
      }
      return tx.aiCompetencyAssessment.findUniqueOrThrow({ where: { id: assessmentId }, include: assessmentInclude });
    });
  }

  private guardrail() {
    return { assistantOnly: true, automaticRejection: false, changesApplicationStatus: false, requiresHumanSignature: true, message: 'La IA aporta evidencia y preguntas; la decisión permanece exclusivamente en el equipo de selección.' };
  }

  private sourceAvailability(application: ApplicationEvidence) {
    return {
      coverLetter: Boolean(application.coverLetter?.trim()),
      applicationAnswers: Boolean(application.dynamicResponses && Object.keys(application.dynamicResponses as object).length),
      interviewEvidence: application.interviews.some((interview) => interview.scorecards.length > 0 || Boolean(interview.notes)),
      externalAssessments: application.externalAssessments.length > 0,
      resumeContent: false,
      resumeNotice: application.candidate.resumeFiles.length ? 'El CV está protegido, pero no existe texto extraído verificable; el archivo no se procesa ni se envía fuera del backend.' : 'No hay CV disponible.',
    };
  }

  private buildSources(application: ApplicationEvidence): CompetencyAiSource[] {
    const sources: CompetencyAiSource[] = [];
    if (application.coverLetter?.trim()) sources.push({ id: 'cover-letter', label: 'Carta de presentación', content: application.coverLetter.trim() });
    if (application.dynamicResponses) sources.push({ id: 'application-answers', label: 'Respuestas de postulación', content: JSON.stringify(application.dynamicResponses) });
    for (const interview of application.interviews) {
      if (interview.notes?.trim()) sources.push({ id: `interview-${interview.id}`, label: `Entrevista: ${interview.title}`, content: interview.notes.trim() });
      for (const scorecard of interview.scorecards) {
        const content = scorecard.responses.map((response) => [response.criterionLabel, response.evidence, response.textValue].filter(Boolean).join(': ')).filter(Boolean).join('\n');
        if (content) sources.push({ id: `scorecard-${scorecard.id}`, label: `Scorecard: ${interview.title}`, content });
      }
    }
    for (const external of application.externalAssessments) {
      if (external.result) sources.push({ id: `assessment-${external.id}`, label: `Assessment externo: ${external.assessmentType}`, content: JSON.stringify(external.result) });
    }
    return sources.slice(0, 40).map((source) => ({ ...source, content: source.content.slice(0, 12_000) }));
  }

  private async resolveCompetencies(tenantId: string, vacancyId: string, stageId: string | null): Promise<Target[]> {
    const include = { criteria: { where: { type: ScorecardCriterionType.RATING }, include: { competency: true }, orderBy: { sortOrder: 'asc' as const } } };
    const template = (stageId ? await this.prisma.scorecardTemplate.findFirst({ where: { tenantId, vacancyId, stageId, isActive: true }, include, orderBy: { version: 'desc' } }) : null)
      ?? await this.prisma.scorecardTemplate.findFirst({ where: { tenantId, vacancyId, stageId: null, isActive: true }, include, orderBy: { version: 'desc' } })
      ?? await this.prisma.scorecardTemplate.findFirst({ where: { tenantId, scope: ScorecardTemplateScope.TENANT, isActive: true }, include, orderBy: [{ updatedAt: 'desc' }, { version: 'desc' }] });
    if (template?.criteria.length) return template.criteria.map((criterion) => ({ criterionId: criterion.id, code: (criterion.competencyCode || criterion.key).trim().toUpperCase(), name: criterion.competencyName || criterion.label, definition: criterion.competency?.description || criterion.description, weight: criterion.weight }));
    const global = await this.prisma.scorecardCompetency.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 30 });
    return global.map((item) => ({ code: item.code, name: item.name, definition: item.description, weight: 0 }));
  }

  private normalizeCompetency(target: Target, raw: Awaited<ReturnType<CompetencyAiProviderService['analyze']>>['competencies'][number] | undefined, sources: CompetencyAiSource[]) {
    const evidence = (raw?.evidence ?? []).flatMap((entry) => {
      const source = sources.find((item) => item.id === entry.sourceId);
      const quote = entry.quote.trim().slice(0, 500);
      if (!source || !quote || !source.content.toLocaleLowerCase().includes(quote.toLocaleLowerCase())) return [];
      return [{ sourceId: source.id, sourceLabel: source.label, quote, relevance: entry.relevance.slice(0, 500) }];
    });
    const hasEvidence = evidence.length > 0;
    const requestedSufficiency = raw?.sufficiency;
    const sufficiency = hasEvidence && requestedSufficiency && requestedSufficiency !== 'INSUFFICIENT' ? requestedSufficiency as AiEvidenceSufficiency : AiEvidenceSufficiency.INSUFFICIENT;
    return {
      criterionId: target.criterionId,
      competencyCode: target.code,
      competencyName: target.name,
      competencyDefinition: target.definition,
      weight: target.weight,
      aiScore: this.clamp(raw?.score, 1, 5, 1),
      confidence: hasEvidence ? this.clamp(raw?.confidence, 0, 1, 0.25) : Math.min(this.clamp(raw?.confidence, 0, 1, 0.15), 0.25),
      sufficiency,
      explanation: raw?.explanation.slice(0, 4000) || 'No se encontró evidencia verificable suficiente.',
      evidence: evidence as Prisma.InputJsonValue,
      missingInformation: (raw?.missingInformation ?? []).slice(0, 8) as Prisma.InputJsonValue,
      suggestedQuestions: (raw?.suggestedQuestions ?? []).slice(0, 5) as Prisma.InputJsonValue,
    };
  }

  private async assertApplicationAccess(tenantId: string, actor: JwtPayload, applicationId: string) {
    const application = await this.prisma.vacancyApplication.findFirst({ where: { id: applicationId, tenantId }, include: applicationInclude });
    if (!application) throw new NotFoundException('Postulación no encontrada');
    if (actor.scope === AccessScope.BRANCH && !actor.allowedBranchIds.includes(application.vacancy.branchId)) throw new NotFoundException('Postulación no encontrada');
    return application;
  }

  private clamp(value: number | undefined, min: number, max: number, fallback: number) { return Number.isFinite(value) ? Math.min(max, Math.max(min, value!)) : fallback; }
}
