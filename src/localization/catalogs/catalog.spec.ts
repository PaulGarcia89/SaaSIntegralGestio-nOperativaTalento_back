import { message } from './catalog';

describe('localization message catalog', () => {
  it('returns the requested language', () => {
    expect(message('common.unauthorized', 'en')).toBe('Your session is not valid.');
  });

  it('falls back to Spanish for an unavailable translation', () => {
    expect(message('applications.submitted', 'en')).toBe('Your application was submitted successfully.');
    expect(message('common.forbidden', 'es', 'en')).toBe('No tienes permisos para realizar esta acción.');
  });
});
