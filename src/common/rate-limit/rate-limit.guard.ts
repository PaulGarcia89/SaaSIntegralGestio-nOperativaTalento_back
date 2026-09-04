import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
import { AppException } from '../errors/app-exception';
import { ErrorCode } from '../errors/error-code.enum';
import { RequestWithUser } from '../types/request-with-user.type';
import {
  RATE_LIMIT_POLICY_KEY,
  RATE_LIMIT_SKIP_KEY,
  RateLimitPolicy,
  isRateLimitEnabled,
  resolveGlobalPolicy,
  resolveTrustedProxyHops,
} from './rate-limit.options';
import { RateLimitStore } from './rate-limit.store';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly store: RateLimitStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http' || !isRateLimitEnabled()) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(RATE_LIMIT_SKIP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const policy =
      this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(RATE_LIMIT_POLICY_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? resolveGlobalPolicy();

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<{
      setHeader?: (name: string, value: string) => void;
    }>();

    const key = this.buildKey(policy, request);

    let hit;
    try {
      hit = await this.store.hit(key, policy.windowSeconds);
    } catch (error) {
      // El limitador nunca debe tumbar la API: si el almacen falla, se registra
      // y se deja pasar la peticion.
      this.logger.warn(
        `Rate limit store unavailable for policy ${policy.name}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return true;
    }

    const remaining = Math.max(policy.limit - hit.count, 0);
    response.setHeader?.('X-RateLimit-Limit', String(policy.limit));
    response.setHeader?.('X-RateLimit-Remaining', String(remaining));
    response.setHeader?.('X-RateLimit-Reset', String(Math.ceil(hit.resetAt / 1000)));

    if (hit.count > policy.limit) {
      const retryAfter = Math.max(Math.ceil((hit.resetAt - Date.now()) / 1000), 1);
      this.logger.warn(
        JSON.stringify({
          type: 'rate_limit_exceeded',
          policy: policy.name,
          route: request.originalUrl ?? request.url,
          method: request.method,
          requestId: request.requestId ?? null,
          count: hit.count,
          limit: policy.limit,
        }),
      );

      throw new AppException(
        'Too many requests, please try again later',
        ErrorCode.RATE_LIMITED,
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfter },
      );
    }

    return true;
  }

  private buildKey(policy: RateLimitPolicy, request: RequestWithUser) {
    const parts = ['rl', policy.name, this.resolveClientIp(request)];

    if (policy.scope === 'email') {
      parts.push(this.hash(this.extractEmail(request)));
    } else if (policy.scope === 'user') {
      parts.push(request.user?.sub ?? 'anonymous');
    }

    return parts.join(':');
  }

  /**
   * Toma la entrada de `x-forwarded-for` que anadio el ultimo proxy de
   * confianza. El cliente puede prefijar valores falsos, pero no puede alterar
   * los que el proxy anade por la derecha.
   */
  private resolveClientIp(request: RequestWithUser) {
    const hops = resolveTrustedProxyHops();
    const header = request.headers['x-forwarded-for'];

    if (hops > 0 && header) {
      const chain = (Array.isArray(header) ? header.join(',') : header)
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const candidate = chain[chain.length - hops];
      if (candidate) return candidate;
    }

    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }

  private extractEmail(request: RequestWithUser) {
    const body = request.body as Record<string, unknown> | undefined;
    const email = body?.email;
    return typeof email === 'string' ? email.trim().toLowerCase() : 'anonymous';
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }
}
