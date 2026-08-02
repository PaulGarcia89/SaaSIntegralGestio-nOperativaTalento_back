import { createJobOfferPdf, jobOfferPdfHash } from './job-offer-pdf';

describe('job offer PDF', () => {
  const input = {
    companyName: 'Empresa Demo', candidateName: 'Ana Pérez', jobTitle: 'Analista',
    salary: 'USD 60,000', periodicity: 'ANNUAL', startDate: '2026-09-01',
    validUntil: '2026-08-15', benefits: ['Seguro médico', 'Trabajo remoto'], message: 'Bienvenida.', version: 2,
  };

  it('creates a deterministic valid PDF snapshot', () => {
    const first = createJobOfferPdf(input);
    const second = createJobOfferPdf(input);
    expect(first.subarray(0, 8).toString()).toBe('%PDF-1.4');
    expect(first.toString()).toContain('Oferta laboral v2');
    expect(jobOfferPdfHash(first)).toBe(jobOfferPdfHash(second));
  });
});
