import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AUTH_PUBLIC_KEY } from '../constants/auth.constants';

/**
 * Invierte el valor por defecto de la autenticacion: toda ruta exige token
 * salvo que se marque con @Public().
 *
 * DESACTIVADO POR DEFECTO. Se activa con `GLOBAL_AUTH_GUARD_ENABLED=true`.
 *
 * Antes de activarlo en produccion:
 *   1. Verificar que las nueve rutas publicas siguen marcadas con @Public()
 *      (lo comprueba `global-jwt-auth.guard.spec.ts`).
 *   2. Ejecutar la bateria e2e de RBAC y el portal publico de candidatos.
 *   3. Activarlo primero en un entorno de preproduccion durante un ciclo completo.
 *
 * Origen: auditoria de arquitectura 2026-09-04, hallazgo CRITICO-4.
 */
@Injectable()
export class GlobalJwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!isGlobalAuthGuardEnabled()) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(AUTH_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}

export function isGlobalAuthGuardEnabled() {
  return process.env.GLOBAL_AUTH_GUARD_ENABLED === 'true';
}
