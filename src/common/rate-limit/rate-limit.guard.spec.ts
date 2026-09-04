import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';
import { RateLimitGuard } from './rate-limit.guard';
import { MemoryRateLimitStore, RateLimitStore } from './rate-limit.store';
import { RATE_LIMIT_POLICY_KEY, RATE_LIMIT_SKIP_KEY, RateLimitPolicy } from './rate-limit.options';

type Metadata = { policy?: RateLimitPolicy; skip?: boolean };

function buildContext(
  request: Record<string, unknown>,
  metadata: Metadata = {},
): { context: ExecutionContext; headers: Record<string, string>; reflector: Reflector } {
  const headers: Record<string, string> = {};
  const response = { setHeader: (name: string, value: string) => { headers[name] = value; } };

  const reflector = {
    getAllAndOverride: (key: string) => (key === RATE_LIMIT_POLICY_KEY ? metadata.policy : metadata.skip),
  } as unknown as Reflector;

  const context = {
    getType: () => 'http',
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;

  return { context, headers, reflector };
}

function baseRequest(overrides: Record<string, unknown> = {}) {
  return {
    ip: '203.0.113.10',
    method: 'POST',
    url: '/api/auth/login',
    originalUrl: '/api/auth/login',
    headers: {},
    body: {},
    socket: { remoteAddress: '203.0.113.10' },
    ...overrides,
  };
}

const policy: RateLimitPolicy = { name: 'test-login', limit: 3, windowSeconds: 60, scope: 'email' };

describe('RateLimitGuard', () => {
  let store: MemoryRateLimitStore;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    store = new MemoryRateLimitStore();
  });

  afterEach(() => {
    store.onModuleDestroy();
    process.env = { ...originalEnv };
  });

  it('permite las peticiones dentro del limite y publica las cabeceras', async () => {
    const { context, headers, reflector } = buildContext(baseRequest(), { policy });
    const guard = new RateLimitGuard(reflector, store);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(headers['X-RateLimit-Limit']).toBe('3');
    expect(headers['X-RateLimit-Remaining']).toBe('2');
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('rechaza con 429 y Retry-After al superar el limite', async () => {
    const request = baseRequest({ body: { email: 'victima@example.test' } });
    const { context, reflector } = buildContext(request, { policy });
    const guard = new RateLimitGuard(reflector, store);

    await guard.canActivate(context);
    await guard.canActivate(context);
    await guard.canActivate(context);

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      constructor: AppException,
    });

    try {
      await guard.canActivate(context);
      fail('deberia haber lanzado');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      const body = exception.getResponse() as { code: ErrorCode; retryAfter: number };
      expect(body.code).toBe(ErrorCode.RATE_LIMITED);
      expect(body.retryAfter).toBeGreaterThan(0);
    }
  });

  it('separa los contadores por correo cuando el alcance es email', async () => {
    const guard = new RateLimitGuard(
      buildContext(baseRequest(), { policy }).reflector,
      store,
    );

    const primero = buildContext(baseRequest({ body: { email: 'uno@example.test' } }), { policy });
    const segundo = buildContext(baseRequest({ body: { email: 'dos@example.test' } }), { policy });

    await guard.canActivate(primero.context);
    await guard.canActivate(primero.context);
    await guard.canActivate(primero.context);

    // El segundo correo arranca su propia ventana pese a compartir IP.
    await expect(guard.canActivate(segundo.context)).resolves.toBe(true);
    expect(segundo.headers['X-RateLimit-Remaining']).toBe('2');
  });

  it('separa los contadores por IP', async () => {
    const { reflector } = buildContext(baseRequest(), { policy });
    const guard = new RateLimitGuard(reflector, store);

    const uno = buildContext(baseRequest({ ip: '203.0.113.10' }), { policy });
    const otro = buildContext(baseRequest({ ip: '203.0.113.99' }), { policy });

    await guard.canActivate(uno.context);
    await guard.canActivate(uno.context);
    await guard.canActivate(uno.context);

    await expect(guard.canActivate(otro.context)).resolves.toBe(true);
  });

  it('toma la ultima entrada de x-forwarded-for, no la que puede falsificar el cliente', async () => {
    const guard = new RateLimitGuard(buildContext(baseRequest(), { policy }).reflector, store);

    // Un atacante prefija IP falsas; nginx anade la real al final.
    const atacante = buildContext(
      baseRequest({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 198.51.100.5' } }),
      { policy },
    );
    const mismoCliente = buildContext(
      baseRequest({ headers: { 'x-forwarded-for': '9.9.9.9, 198.51.100.5' } }),
      { policy },
    );

    await guard.canActivate(atacante.context);
    await guard.canActivate(mismoCliente.context);

    // Ambas peticiones cuentan contra la misma ventana: la IP real es la ultima.
    expect(mismoCliente.headers['X-RateLimit-Remaining']).toBe('1');
  });

  it('ignora x-forwarded-for cuando no hay proxies de confianza', async () => {
    process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS = '0';
    const guard = new RateLimitGuard(buildContext(baseRequest(), { policy }).reflector, store);

    const uno = buildContext(
      baseRequest({ ip: '203.0.113.10', headers: { 'x-forwarded-for': '1.1.1.1' } }),
      { policy },
    );
    const dos = buildContext(
      baseRequest({ ip: '203.0.113.10', headers: { 'x-forwarded-for': '2.2.2.2' } }),
      { policy },
    );

    await guard.canActivate(uno.context);
    await guard.canActivate(dos.context);

    expect(dos.headers['X-RateLimit-Remaining']).toBe('1');
  });

  it('respeta @SkipRateLimit', async () => {
    const { context, headers, reflector } = buildContext(baseRequest(), { skip: true });
    const guard = new RateLimitGuard(reflector, store);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(headers['X-RateLimit-Limit']).toBeUndefined();
  });

  it('se desactiva por completo con RATE_LIMIT_ENABLED=false', async () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    const { context, headers, reflector } = buildContext(baseRequest(), { policy });
    const guard = new RateLimitGuard(reflector, store);

    for (let i = 0; i < 10; i += 1) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }
    expect(headers['X-RateLimit-Limit']).toBeUndefined();
  });

  it('deja pasar la peticion si el almacen falla (nunca tumba la API)', async () => {
    const brokenStore: RateLimitStore = {
      hit: async () => {
        throw new Error('redis caido');
      },
    };
    const { context, reflector } = buildContext(baseRequest(), { policy });
    const guard = new RateLimitGuard(reflector, brokenStore);

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('aplica la politica global cuando la ruta no declara ninguna', async () => {
    process.env.RATE_LIMIT_GLOBAL_LIMIT = '2';
    process.env.RATE_LIMIT_GLOBAL_WINDOW_SECONDS = '60';
    const { context, headers, reflector } = buildContext(baseRequest());
    const guard = new RateLimitGuard(reflector, store);

    await guard.canActivate(context);
    expect(headers['X-RateLimit-Limit']).toBe('2');
    await guard.canActivate(context);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(AppException);
  });
});

describe('MemoryRateLimitStore', () => {
  it('reinicia el contador al expirar la ventana', async () => {
    const store = new MemoryRateLimitStore();
    const primera = await store.hit('clave', 0);
    expect(primera.count).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 5));
    const segunda = await store.hit('clave', 60);
    expect(segunda.count).toBe(1);

    store.onModuleDestroy();
  });
});
