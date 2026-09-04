import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import IORedis, { Redis } from 'ioredis';
import { RateLimitHit } from './rate-limit.options';

export abstract class RateLimitStore {
  /** Registra una peticion y devuelve el recuento de la ventana vigente. */
  abstract hit(key: string, windowSeconds: number): Promise<RateLimitHit>;
}

/**
 * Respaldo en memoria del proceso. Suficiente para desarrollo y para un unico
 * contenedor; con varias replicas el recuento se fragmenta entre ellas, por lo
 * que en produccion debe configurarse Redis.
 */
@Injectable()
export class MemoryRateLimitStore extends RateLimitStore implements OnModuleDestroy {
  private readonly windows = new Map<string, RateLimitHit>();
  private readonly sweeper: NodeJS.Timeout;

  constructor() {
    super();
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref?.();
  }

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const now = Date.now();
    const current = this.windows.get(key);

    if (!current || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowSeconds * 1000 };
      this.windows.set(key, fresh);
      return fresh;
    }

    current.count += 1;
    return current;
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
  }

  private sweep() {
    const now = Date.now();
    for (const [key, value] of this.windows) {
      if (value.resetAt <= now) this.windows.delete(key);
    }
  }
}

/**
 * Contador distribuido sobre Redis. Reutiliza la misma configuracion de conexion
 * que la capa de colas (`REDIS_URL` o `REDIS_HOST`/`REDIS_PORT`).
 */
@Injectable()
export class RedisRateLimitStore extends RateLimitStore implements OnModuleDestroy {
  private readonly logger = new Logger(RedisRateLimitStore.name);
  private readonly client: Redis;

  constructor() {
    super();
    const redisUrl = process.env.REDIS_URL?.trim();
    this.client = redisUrl
      ? new IORedis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true })
      : new IORedis({
          host: process.env.REDIS_HOST ?? '127.0.0.1',
          port: Number(process.env.REDIS_PORT ?? '6379'),
          db: Number(process.env.REDIS_DB ?? '0'),
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: true,
        });

    this.client.on('error', (error: Error) => {
      this.logger.warn(`Rate limit Redis error: ${error.message}`);
    });

    void this.client.connect().catch((error: Error) => {
      this.logger.warn(`Rate limit Redis is unavailable: ${error.message}`);
    });
  }

  async hit(key: string, windowSeconds: number): Promise<RateLimitHit> {
    const results = await this.client
      .multi()
      .incr(key)
      .pttl(key)
      .exec();

    const count = Number(results?.[0]?.[1] ?? 1);
    const ttl = Number(results?.[1]?.[1] ?? -1);

    if (ttl < 0) {
      await this.client.pexpire(key, windowSeconds * 1000);
      return { count, resetAt: Date.now() + windowSeconds * 1000 };
    }

    return { count, resetAt: Date.now() + ttl };
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
  }
}

export function hasRedisConfigured() {
  return Boolean(process.env.REDIS_URL?.trim() || process.env.REDIS_HOST?.trim());
}
