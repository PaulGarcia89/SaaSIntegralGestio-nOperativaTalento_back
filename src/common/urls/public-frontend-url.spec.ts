import { publicFrontendUrl } from './public-frontend-url';

describe('publicFrontendUrl', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('normaliza la URL pública configurada', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', PUBLIC_FRONTEND_URL: 'https://talento.example.com/' };
    expect(publicFrontendUrl()).toBe('https://talento.example.com');
  });

  it('impide usar localhost en producción', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production', PUBLIC_FRONTEND_URL: 'http://localhost:3000' };
    expect(() => publicFrontendUrl()).toThrow('must be a public HTTPS URL');
  });

  it('falla de forma explícita si producción no está configurada', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.PUBLIC_FRONTEND_URL;
    expect(() => publicFrontendUrl()).toThrow('is required in production');
  });

  it('mantiene el valor local únicamente durante desarrollo', () => {
    process.env = { ...originalEnv, NODE_ENV: 'development' };
    delete process.env.PUBLIC_FRONTEND_URL;
    expect(publicFrontendUrl()).toBe('http://localhost:3000');
  });
});
