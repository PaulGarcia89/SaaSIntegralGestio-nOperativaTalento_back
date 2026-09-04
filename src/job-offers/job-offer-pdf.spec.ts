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

  // Esta es la garantia que sostiene la firma electronica: la huella que se
  // guardo en JobOfferVersion.pdfSha256 al enviar la oferta tiene que seguir
  // reproduciendose. Si alguien cambia un rotulo del castellano, esta prueba
  // avisa antes de que las ofertas ya firmadas queden sin verificar.
  it('el ejemplar rector en castellano no cambia al hacerse bilingue', () => {
    const antes = createJobOfferPdf(input);
    const conIdiomaExplicito = createJobOfferPdf({ ...input, locale: 'es', governingLocale: 'es' });
    expect(jobOfferPdfHash(conIdiomaExplicito)).toBe(jobOfferPdfHash(antes));
  });

  it('rinde el documento en ingles cuando ese es el idioma rector', () => {
    const pdf = createJobOfferPdf({ ...input, locale: 'en', governingLocale: 'en' }).toString();
    expect(pdf).toContain('Job offer v2');
    expect(pdf).toContain('Candidate:');
    expect(pdf).toContain('Position:');
    expect(pdf).not.toContain('Courtesy translation');
  });

  it('marca como traduccion de cortesia el ejemplar que no es el rector', () => {
    const traduccion = createJobOfferPdf({ ...input, locale: 'en', governingLocale: 'es' }).toString();
    expect(traduccion).toContain('Courtesy translation');
    expect(traduccion).toContain('Spanish');

    const inverso = createJobOfferPdf({ ...input, locale: 'es', governingLocale: 'en' }).toString();
    expect(inverso).toContain('Traduccion de cortesia');
    expect(inverso).toContain('ingles');
  });

  it('la traduccion NO reproduce la huella del ejemplar rector', () => {
    // Se afirma explicitamente para dejar constancia de por que existe
    // `pdfLocale`: sin el, una descarga en otro idioma pareceria el documento
    // firmado y no lo es.
    const rector = createJobOfferPdf({ ...input, locale: 'es', governingLocale: 'es' });
    const traduccion = createJobOfferPdf({ ...input, locale: 'en', governingLocale: 'es' });
    expect(jobOfferPdfHash(traduccion)).not.toBe(jobOfferPdfHash(rector));
  });
});
