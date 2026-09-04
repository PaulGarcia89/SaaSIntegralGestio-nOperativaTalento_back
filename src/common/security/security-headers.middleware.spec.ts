import { Response } from 'express';
import { SecurityHeadersMiddleware } from './security-headers.middleware';
import { RequestWithUser } from '../types/request-with-user.type';

function build(requestOverrides: Partial<RequestWithUser> = {}) {
  const headers: Record<string, string> = {};
  const removed: string[] = [];
  const response = {
    setHeader: (name: string, value: string) => { headers[name] = value; },
    removeHeader: (name: string) => { removed.push(name); },
  } as unknown as Response;

  const request = { secure: false, headers: {}, ...requestOverrides } as RequestWithUser;
  return { request, response, headers, removed };
}

describe('SecurityHeadersMiddleware', () => {
  const originalEnv = { ...process.env };
  const middleware = new SecurityHeadersMiddleware();

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('aplica las cabeceras defensivas y llama a next', () => {
    const { request, response, headers, removed } = build();
    const next = jest.fn();

    middleware.use(request, response, next);

    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(removed).toContain('X-Powered-By');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('no emite HSTS sobre HTTP', () => {
    const { request, response, headers } = build();
    middleware.use(request, response, jest.fn());
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('emite HSTS cuando la peticion llega por HTTPS', () => {
    const { request, response, headers } = build({ headers: { 'x-forwarded-proto': 'https' } } as Partial<RequestWithUser>);
    middleware.use(request, response, jest.fn());
    expect(headers['Strict-Transport-Security']).toBe('max-age=15552000; includeSubDomains');
  });

  it('permite desactivar HSTS con HSTS_MAX_AGE_SECONDS=0', () => {
    process.env.HSTS_MAX_AGE_SECONDS = '0';
    const { request, response, headers } = build({ secure: true } as Partial<RequestWithUser>);
    middleware.use(request, response, jest.fn());
    expect(headers['Strict-Transport-Security']).toBeUndefined();
  });

  it('se puede desactivar por completo', () => {
    process.env.SECURITY_HEADERS_ENABLED = 'false';
    const { request, response, headers } = build();
    const next = jest.fn();
    middleware.use(request, response, next);
    expect(Object.keys(headers)).toHaveLength(0);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
