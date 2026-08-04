import { CompetencyAiProviderService } from './competency-ai-provider.service';

describe('CompetencyAiProviderService', () => {
  const provider = new CompetencyAiProviderService();

  it('grounds scores and explanations in internal evidence', async () => {
    const result = await provider.analyze({
      competencies: [{ code: 'LIDERAZGO', name: 'Liderazgo de equipos', definition: 'Coordina equipos y obtiene resultados', weight: 100 }],
      sources: [{ id: 'scorecard-1', label: 'Scorecard', content: 'Coordiné un equipo de soporte y obtuvimos resultados medibles durante el cierre.' }],
    });

    expect(result.competencies[0].evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'scorecard-1' }),
    ]));
    expect(result.competencies[0].score).toBeGreaterThan(1);
    expect(result.competencies[0].suggestedQuestions).toHaveLength(2);
  });

  it('marks missing evidence without treating absence as lack of competency', async () => {
    const result = await provider.analyze({
      competencies: [{ code: 'NEGOCIACION', name: 'Negociación', weight: 100 }],
      sources: [{ id: 'form-1', label: 'Formulario', content: 'Disponible para iniciar en septiembre.' }],
    });

    expect(result.competencies[0].sufficiency).toBe('INSUFFICIENT');
    expect(result.competencies[0].confidence).toBeLessThanOrEqual(0.25);
    expect(result.competencies[0].explanation).toContain('no implica falta de competencia');
  });
});
