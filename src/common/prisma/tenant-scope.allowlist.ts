/**
 * Excepciones explicitas al filtro de tenant.
 *
 * Los modelos que no declaran `tenantId` quedan exentos automaticamente (se
 * acotan por su entidad padre), asi que aqui solo van los que SI lo declaran y
 * aun asi tienen consultas legitimamente sin filtrar.
 *
 * Cada entrada exige un motivo. Esta lista es la que hay que vaciar —o al menos
 * revisar entera— antes de pasar `TENANT_SCOPE_ENFORCEMENT` a `block`.
 *
 * Origen: auditoria de arquitectura 2026-09-04, hallazgo CRITICO-3.
 */
export interface ExcepcionDeAislamiento {
  /** Operaciones exentas, o '*' para todas. */
  operaciones: string[] | '*';
  motivo: string;
}

export const EXCEPCIONES_DE_AISLAMIENTO: Record<string, ExcepcionDeAislamiento> = {
  UserSession: {
    operaciones: ['findUnique', 'findFirst', 'findMany', 'update', 'updateMany'],
    motivo:
      'El refresco de sesion resuelve la sesion por su identificador antes de conocer el tenant (auth.service.ts:92-121).',
  },
  User: {
    operaciones: ['findFirst', 'findUnique'],
    motivo:
      'El login busca por correo y slug de tenant antes de que exista contexto de tenant (auth-context.service.loadUserByEmail).',
  },
};

/**
 * `Tenant` y `PublicRequestRateLimit` no figuran aqui a proposito: no declaran
 * `tenantId`, de modo que ya quedan exentos por la via general de los modelos
 * que se acotan por su entidad padre. Esta lista se reserva para los modelos que
 * SI lo declaran y aun asi tienen consultas legitimamente sin filtrar.
 */

export function estaExento(modelo: string, operacion: string) {
  const excepcion = EXCEPCIONES_DE_AISLAMIENTO[modelo];
  if (!excepcion) return false;
  return excepcion.operaciones === '*' || excepcion.operaciones.includes(operacion);
}
