import { CareerPortalsService } from './career-portals.service';

describe('CareerPortalsService localization', () => {
  it('translates public vacancy fields and falls back per field', () => {
    const service = new CareerPortalsService(undefined as never);
    const result = (service as unknown as { publicVacancy: (value: unknown, locale?: string) => Record<string, unknown> }).publicVacancy({
      id: 'vacancy-1',
      publicSlug: 'analyst',
      publishedAt: null,
      tenant: { slug: 'acme' },
      vacancy: {
        id: 'vacancy-1',
        title: 'Analista',
        summary: 'Resumen en español',
        description: 'Descripción en español',
        requirements: null,
        responsibilities: null,
        benefits: null,
        translations: { en: { title: 'Analyst', description: 'English description' } },
      },
    }, 'en');

    expect(result.title).toBe('Analyst');
    expect(result.description).toBe('English description');
    expect(result.summary).toBe('Resumen en español');
  });
});
