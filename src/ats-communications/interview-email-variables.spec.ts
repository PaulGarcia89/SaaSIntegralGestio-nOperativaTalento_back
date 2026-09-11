import { AtsCommunicationsService } from './ats-communications.service';

/**
 * El correo de entrevista tiene que decir cuándo es, en el idioma y el huso de
 * quien lo recibe. Antes decía «2026-11-09T23:10:00.000Z».
 */
describe('variables de entrevista para el correo', () => {
  const servicio = new AtsCommunicationsService({} as any, {} as any);
  const llamar = (variables: Record<string, string>, locale: 'es' | 'en') =>
    (servicio as any).variablesDeEntrevista(variables, locale) as Record<string, string>;

  const base = {
    interviewStartsAt: '2026-11-09T23:10:00.000Z',
    interviewTimezone: 'America/New_York',
    interviewType: 'VIRTUAL',
    interviewDurationMinutes: '60',
    interviewerName: 'Paul Garcia',
    interviewJoinUrl: 'https://meet.example.com/abc',
    interviewPlace: '',
  };

  it('escribe la fecha en el huso de la entrevista, no en UTC', () => {
    const salida = llamar(base, 'es');
    // 23:10 UTC son las 18:10 en Nueva York.
    expect(salida.interviewDate).toContain('18:10');
    expect(salida.interviewDate).toContain('noviembre');
    expect(salida.interviewDate).not.toContain('2026-11-09T23:10');
  });

  it('escribe en el idioma de quien lo recibe', () => {
    expect(llamar(base, 'en').interviewDate).toContain('November');
  });

  it('arma el bloque con lo acordado y sin los huecos', () => {
    const detalles = llamar(base, 'es').interviewDetails.split('\n');
    expect(detalles[0]).toContain('America/New_York');
    expect(detalles).toContain('Formato: Por videollamada');
    expect(detalles).toContain('Duración: 60 minutos');
    expect(detalles).toContain('Con: Paul Garcia');
    expect(detalles).toContain('Enlace: https://meet.example.com/abc');
    // No hay dirección: no se escribe una línea vacía.
    expect(detalles.some((linea) => linea.startsWith('Dónde:'))).toBe(false);
  });

  it('una zona horaria inválida no tumba el aviso', () => {
    const salida = llamar({ ...base, interviewTimezone: 'Marte/Olympus' }, 'es');
    expect(salida.interviewDate).toBeTruthy();
  });

  it('sin fecha no toca nada', () => {
    const variables = { candidateName: 'Ana' };
    expect(llamar(variables, 'es')).toBe(variables);
  });
});
