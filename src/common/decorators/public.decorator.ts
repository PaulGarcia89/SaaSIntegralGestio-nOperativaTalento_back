import { SetMetadata } from '@nestjs/common';
import { AUTH_PUBLIC_KEY } from '../constants/auth.constants';

/**
 * Marca una ruta o un controlador como accesible sin token.
 *
 * Solo tiene efecto cuando el guard global de autenticacion esta activo
 * (`GLOBAL_AUTH_GUARD_ENABLED=true`). Hasta entonces documenta la intencion y
 * alimenta la prueba `global-jwt-auth.guard.spec.ts`, que falla si aparece un
 * controlador publico que no este en la lista revisada.
 *
 * Toda ruta marcada con @Public() debe proteger su acceso por otro medio:
 * token firmado (archivos privados), guard propio de candidato o postulante,
 * firma HMAC (webhooks) o ser deliberadamente anonima (salud, portal publico).
 */
export const Public = () => SetMetadata(AUTH_PUBLIC_KEY, true);
