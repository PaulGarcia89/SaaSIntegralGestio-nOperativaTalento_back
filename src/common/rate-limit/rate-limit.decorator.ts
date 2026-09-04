import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_POLICY_KEY, RATE_LIMIT_SKIP_KEY, RateLimitPolicy } from './rate-limit.options';

/**
 * Declara una politica de limitacion de tasa mas estricta que la global para un
 * controlador o una ruta concreta.
 *
 *   @RateLimit({ name: 'auth-login', limit: 10, windowSeconds: 900, scope: 'email' })
 */
export const RateLimit = (policy: RateLimitPolicy) => SetMetadata(RATE_LIMIT_POLICY_KEY, policy);

/** Exime a la ruta de toda limitacion (sondas de salud, webhooks internos). */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_SKIP_KEY, true);
