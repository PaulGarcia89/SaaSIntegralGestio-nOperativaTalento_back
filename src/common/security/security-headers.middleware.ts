import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { RequestWithUser } from '../types/request-with-user.type';

/**
 * Cabeceras de seguridad equivalentes a la configuracion por defecto de helmet,
 * escritas a mano para no anadir dependencias.
 *
 * La API sirve JSON y archivos descargables, nunca HTML navegable, de modo que
 * la CSP puede ser maximamente restrictiva. La entrega de archivos privados
 * define ademas su propia CSP en `ats-file-access.controller.ts`, que prevalece
 * porque se escribe despues.
 *
 * Variables de entorno:
 *   SECURITY_HEADERS_ENABLED  (por defecto true)
 *   HSTS_MAX_AGE_SECONDS      (por defecto 15552000, 180 dias; 0 desactiva HSTS)
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(request: RequestWithUser, response: Response, next: NextFunction) {
    if (process.env.SECURITY_HEADERS_ENABLED === 'false') {
      next();
      return;
    }

    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-DNS-Prefetch-Control', 'off');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    response.setHeader('Origin-Agent-Cluster', '?1');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    response.setHeader(
      'Permissions-Policy',
      'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
    );

    // Express expone `X-Powered-By` por defecto; se retira para no publicar la pila.
    response.removeHeader('X-Powered-By');

    const hstsMaxAge = Number(process.env.HSTS_MAX_AGE_SECONDS ?? '15552000');
    const isSecure = request.secure || request.headers['x-forwarded-proto'] === 'https';
    if (isSecure && Number.isFinite(hstsMaxAge) && hstsMaxAge > 0) {
      response.setHeader('Strict-Transport-Security', `max-age=${Math.trunc(hstsMaxAge)}; includeSubDomains`);
    }

    next();
  }
}
