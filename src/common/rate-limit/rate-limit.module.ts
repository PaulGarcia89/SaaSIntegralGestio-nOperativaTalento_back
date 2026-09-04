import { Global, Logger, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { MemoryRateLimitStore, RateLimitStore, RedisRateLimitStore, hasRedisConfigured } from './rate-limit.store';

/**
 * Limitacion de tasa global. Se apoya en Redis cuando esta configurado (unico
 * modo correcto con varias replicas) y cae a un contador en memoria en caso
 * contrario, avisando por log.
 *
 * Variables de entorno:
 *   RATE_LIMIT_ENABLED                 (por defecto true)
 *   RATE_LIMIT_GLOBAL_LIMIT            (por defecto 300)
 *   RATE_LIMIT_GLOBAL_WINDOW_SECONDS   (por defecto 60)
 *   RATE_LIMIT_TRUSTED_PROXY_HOPS      (por defecto 1)
 */
@Global()
@Module({
  providers: [
    MemoryRateLimitStore,
    {
      provide: RateLimitStore,
      useFactory: (memory: MemoryRateLimitStore) => {
        if (hasRedisConfigured()) {
          return new RedisRateLimitStore();
        }

        new Logger('RateLimitModule').warn(
          'Rate limiting is using the in-process store because REDIS_URL/REDIS_HOST is not configured. ' +
            'Configure Redis before running more than one replica.',
        );
        return memory;
      },
      inject: [MemoryRateLimitStore],
    },
    {
      provide: APP_GUARD,
      useClass: RateLimitGuard,
    },
  ],
  exports: [RateLimitStore],
})
export class RateLimitModule {}
