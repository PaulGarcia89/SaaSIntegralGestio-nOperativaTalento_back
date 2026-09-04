import { message } from './catalog';

describe('localization message catalog', () => {
  it('returns the requested language', () => {
    expect(message('common.unauthorized', 'en')).toBe('Your session is not valid.');
  });

  // El panel de "Hoy" lo escribe el servidor: si estas claves faltan en ingles,
  // la pantalla traducida vuelve a mostrar frases en espanol sin que nada falle.
  it('traduce los titulos del panel operativo', () => {
    expect(message('dashboard.review_application', 'es')).toBe('Revisar nueva postulación');
    expect(message('dashboard.review_application', 'en')).toBe('Review new application');
    expect(message('dashboard.prepare_interview', 'en')).toBe('Prepare interview');
  });

  it('falls back to Spanish for an unavailable translation', () => {
    expect(message('applications.submitted', 'en')).toBe('Your application was submitted successfully.');
    expect(message('common.forbidden', 'es', 'en')).toBe('No tienes permisos para realizar esta acción.');
  });
});
