import { Injectable } from '@nestjs/common';

export interface CompetencyAiSource {
  id: string;
  label: string;
  content: string;
}

export interface CompetencyAiTarget {
  code: string;
  name: string;
  definition?: string | null;
  weight: number;
}

export interface CompetencyAiResult {
  summary: string;
  competencies: Array<{
    code: string;
    score: number;
    confidence: number;
    sufficiency: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT';
    explanation: string;
    evidence: Array<{ sourceId: string; quote: string; relevance: string }>;
    missingInformation: string[];
    suggestedQuestions: string[];
  }>;
}

/**
 * Primera versión local y determinista: analiza texto estructurado sin sacar
 * información del candidato del backend ni tomar decisiones de selección.
 */
@Injectable()
export class CompetencyAiProviderService {
  readonly provider = 'local-explainable-assistant';
  readonly model = 'competency-evidence-v1';
  readonly promptVersion = 'competency-assistant-v1';

  async analyze(input: {
    competencies: CompetencyAiTarget[];
    sources: CompetencyAiSource[];
  }): Promise<CompetencyAiResult> {
    const competencies = input.competencies.map((target) => {
      const terms = this.terms(`${target.name} ${target.definition ?? ''}`);
      const matches = input.sources.flatMap((source) =>
        this.sentences(source.content)
          .map((quote) => ({
            sourceId: source.id,
            quote,
            hits: terms.filter((term) => this.normalize(quote).includes(term)),
          }))
          .filter((item) => item.hits.length > 0),
      ).sort((a, b) => b.hits.length - a.hits.length).slice(0, 4);
      const distinctTerms = new Set(matches.flatMap((item) => item.hits)).size;
      const coverage = terms.length ? distinctTerms / terms.length : 0;
      const sufficiency: 'SUFFICIENT' | 'PARTIAL' | 'INSUFFICIENT' = matches.length >= 3 && coverage >= 0.45
        ? 'SUFFICIENT'
        : matches.length > 0
          ? 'PARTIAL'
          : 'INSUFFICIENT';
      const confidence = sufficiency === 'SUFFICIENT'
        ? Math.min(0.85, 0.55 + coverage * 0.3)
        : sufficiency === 'PARTIAL'
          ? Math.min(0.55, 0.25 + coverage * 0.3)
          : 0.15;
      const score = matches.length
        ? Math.min(5, Math.max(1, 1 + matches.length * 0.65 + coverage * 1.4))
        : 1;
      return {
        code: target.code,
        score: Number(score.toFixed(2)),
        confidence: Number(confidence.toFixed(3)),
        sufficiency,
        explanation: matches.length
          ? `Se localizaron ${matches.length} evidencias relacionadas con ${target.name}; la cobertura de conceptos fue ${Math.round(coverage * 100)}%. La puntuación es orientativa y requiere validación humana.`
          : `No se localizaron evidencias textuales verificables sobre ${target.name}. La ausencia de evidencia no implica falta de competencia.`,
        evidence: matches.map((item) => ({
          sourceId: item.sourceId,
          quote: item.quote,
          relevance: `Coincidencias verificables: ${item.hits.join(', ')}`,
        })),
        missingInformation: sufficiency === 'SUFFICIENT'
          ? []
          : [`Ejemplos concretos, contexto, acciones y resultados relacionados con ${target.name}.`],
        suggestedQuestions: [
          `Cuéntame una situación concreta en la que hayas demostrado ${target.name}. ¿Cuál fue tu aporte y el resultado?`,
          `¿Qué decisión difícil tomaste al aplicar ${target.name} y qué aprendiste?`,
        ],
      };
    });
    const insufficient = competencies.filter((item) => item.sufficiency === 'INSUFFICIENT').length;
    return {
      summary: `Análisis asistido de ${competencies.length} competencias. ${insufficient} requieren recopilar más información. Ninguna puntuación constituye una decisión de selección.`,
      competencies,
    };
  }

  private sentences(value: string) {
    return value.split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter((item) => item.length >= 12).slice(0, 250);
  }

  private terms(value: string) {
    const ignored = new Set(['para', 'como', 'esta', 'este', 'desde', 'entre', 'sobre', 'competencia', 'capacidad', 'habilidad']);
    return [...new Set(this.normalize(value).split(/\s+/).filter((term) => term.length >= 4 && !ignored.has(term)))].slice(0, 20);
  }

  private normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  }
}
