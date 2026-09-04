import { createHash } from 'node:crypto';
import { message } from '../localization/catalogs/catalog';
import { SupportedLocale } from '../localization/localization.service';

export interface JobOfferPdfInput {
  companyName: string;
  candidateName: string;
  jobTitle: string;
  salary: string;
  periodicity: string;
  startDate: string;
  validUntil: string;
  benefits: string[];
  message?: string | null;
  version: number;
  /** Idioma en el que se redacta este ejemplar. Por omision, castellano. */
  locale?: SupportedLocale;
  /**
   * Idioma del ejemplar RECTOR: aquel cuya huella SHA-256 quedo registrada al
   * enviar la oferta y que el candidato firma. Cuando no coincide con `locale`,
   * el documento lleva impreso que es una traduccion de cortesia y cual es la
   * version que prevalece. Asi el PDF puede leerse en el idioma de quien lo
   * descarga sin que se pierda la cadena probatoria de la firma.
   */
  governingLocale?: SupportedLocale;
}

function pdfText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/([\\()])/g, '\\$1');
}

export function createJobOfferPdf(input: JobOfferPdfInput) {
  const locale: SupportedLocale = input.locale ?? 'es';
  const governing: SupportedLocale = input.governingLocale ?? locale;
  const label = (key: string) => message(`offer_pdf.${key}` as never, locale);
  const translated = governing !== locale;
  const lines = [
    `${input.companyName} - ${label('title')} v${input.version}`,
    '',
    `${label('candidate')}: ${input.candidateName}`,
    `${label('position')}: ${input.jobTitle}`,
    `${label('compensation')}: ${input.salary} (${input.periodicity})`,
    `${label('start_date')}: ${input.startDate}`,
    `${label('valid_until')}: ${input.validUntil}`,
    '',
    `${label('benefits')}:`,
    ...(input.benefits.length ? input.benefits.map((item) => `- ${item}`) : [`- ${label('none_specified')}`]),
    '',
    input.message ?? '',
    // El aviso va al final para no desplazar el cuerpo del ejemplar rector:
    // asi el rector conserva exactamente el mismo diseno que antes.
    ...(translated
      ? ['', message('offer_pdf.translation_notice', locale, 'es', { language: message(`offer_pdf.language_${governing}` as never, locale) })]
      : []),
  ].slice(0, 44);
  const commands = lines.map((line, index) => `BT /F1 ${index === 0 ? 16 : 10} Tf 50 ${790 - index * 16} Td (${pdfText(line)}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

export function jobOfferPdfHash(buffer: Buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}
