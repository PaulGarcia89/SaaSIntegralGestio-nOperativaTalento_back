const multiCalls: string[] = [];
const pexpire = jest.fn().mockResolvedValue(1);
let execResult: Array<[Error | null, unknown]> | null = [];

jest.mock('ioredis', () => {
  const client = {
    multi: () => ({
      incr: (key: string) => {
        multiCalls.push(`incr:${key}`);
        return client.multi();
      },
      pttl: (key: string) => {
        multiCalls.push(`pttl:${key}`);
        return client.multi();
      },
      exec: async () => execResult,
    }),
    pexpire,
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK'),
  };
  return { __esModule: true, default: jest.fn(() => client), Redis: jest.fn(() => client) };
});

import { RedisRateLimitStore, hasRedisConfigured } from './rate-limit.store';

describe('hasRedisConfigured', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('detecta REDIS_URL', () => {
    process.env.REDIS_URL = 'redis://localhost:6379/0';
    expect(hasRedisConfigured()).toBe(true);
  });

  it('detecta REDIS_HOST', () => {
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST = '127.0.0.1';
    expect(hasRedisConfigured()).toBe(true);
  });

  it('devuelve false sin configuracion', () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS_HOST;
    expect(hasRedisConfigured()).toBe(false);
  });
});

describe('RedisRateLimitStore', () => {
  beforeEach(() => {
    multiCalls.length = 0;
    pexpire.mockClear();
  });

  it('incrementa y fija el TTL en la primera peticion de la ventana', async () => {
    execResult = [
      [null, 1],
      [null, -1],
    ];
    const store = new RedisRateLimitStore();

    const hit = await store.hit('rl:test:1.2.3.4', 60);

    expect(multiCalls).toEqual(['incr:rl:test:1.2.3.4', 'pttl:rl:test:1.2.3.4']);
    expect(pexpire).toHaveBeenCalledWith('rl:test:1.2.3.4', 60_000);
    expect(hit.count).toBe(1);
    expect(hit.resetAt).toBeGreaterThan(Date.now());
    await store.onModuleDestroy();
  });

  it('conserva el TTL vigente en las peticiones siguientes', async () => {
    execResult = [
      [null, 4],
      [null, 30_000],
    ];
    const store = new RedisRateLimitStore();

    const hit = await store.hit('rl:test:1.2.3.4', 60);

    expect(pexpire).not.toHaveBeenCalled();
    expect(hit.count).toBe(4);
    expect(hit.resetAt - Date.now()).toBeGreaterThan(25_000);
    await store.onModuleDestroy();
  });

  it('tolera una respuesta vacia de la transaccion', async () => {
    execResult = null;
    const store = new RedisRateLimitStore();

    const hit = await store.hit('rl:test:1.2.3.4', 60);

    expect(hit.count).toBe(1);
    expect(pexpire).toHaveBeenCalled();
    await store.onModuleDestroy();
  });
});
