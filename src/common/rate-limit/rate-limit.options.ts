export const RATE_LIMIT_POLICY_KEY = 'rateLimit:policy';
export const RATE_LIMIT_SKIP_KEY = 'rateLimit:skip';

/**
 * Discriminante adicional que se combina con la IP para construir la clave.
 * - `ip`     : solo la IP del cliente.
 * - `email`  : IP + hash del campo `email` del cuerpo (login, recuperacion).
 * - `user`   : IP + identificador del usuario autenticado, si existe.
 */
export type RateLimitScope = 'ip' | 'email' | 'user';

export interface RateLimitPolicy {
  /** Nombre corto de la politica; forma parte de la clave y de los logs. */
  name: string;
  /** Numero maximo de peticiones permitidas dentro de la ventana. */
  limit: number;
  /** Duracion de la ventana en segundos. */
  windowSeconds: number;
  /** Como se construye la identidad del solicitante. Por defecto `ip`. */
  scope?: RateLimitScope;
}

export interface RateLimitHit {
  count: number;
  /** Marca de tiempo (epoch ms) en la que expira la ventana actual. */
  resetAt: number;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

export function isRateLimitEnabled() {
  return process.env.RATE_LIMIT_ENABLED !== 'false';
}

/**
 * Politica aplicada a toda ruta que no declare una propia. Deliberadamente
 * generosa: su papel es contener abuso automatizado, no moldear el trafico.
 */
export function resolveGlobalPolicy(): RateLimitPolicy {
  return {
    name: 'global',
    limit: positiveInt(process.env.RATE_LIMIT_GLOBAL_LIMIT, 300),
    windowSeconds: positiveInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_SECONDS, 60),
    scope: 'ip',
  };
}

/**
 * Numero de proxies de confianza delante de la aplicacion. Con el valor por
 * defecto (1, que corresponde al nginx de los despliegues actuales) se toma la
 * ultima entrada de `x-forwarded-for`, que es la que anade el proxy y por tanto
 * la unica que el cliente no puede falsificar. Poner a 0 si la aplicacion se
 * expone directamente a internet.
 */
export function resolveTrustedProxyHops() {
  const raw = process.env.RATE_LIMIT_TRUSTED_PROXY_HOPS;
  if (raw === undefined) return 1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : 1;
}
