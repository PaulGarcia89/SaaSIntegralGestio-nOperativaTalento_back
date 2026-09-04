import { Prisma } from '@prisma/client';

/**
 * Metadatos de aislamiento derivados del propio esquema, no de una lista escrita
 * a mano: si manana se anade un modelo con `tenantId`, entra solo.
 */
export interface TenantScopeModelInfo {
  /** Nombre del modelo en el esquema (PascalCase). */
  modelo: string;
  /** Nombre de la propiedad en el cliente Prisma (camelCase). */
  delegado: string;
  /** El modelo declara `tenantId`. */
  tieneTenantId: boolean;
  /** `tenantId` admite null: el modelo mezcla filas globales y de tenant. */
  tenantIdOpcional: boolean;
}

function aDelegado(modelo: string) {
  return modelo.charAt(0).toLowerCase() + modelo.slice(1);
}

let cache: Map<string, TenantScopeModelInfo> | null = null;

/** Indexado por nombre de delegado (camelCase), que es como aparece en el codigo. */
export function registroDeModelos(): Map<string, TenantScopeModelInfo> {
  if (cache) return cache;

  cache = new Map();
  for (const modelo of Prisma.dmmf.datamodel.models) {
    const campo = modelo.fields.find((f) => f.name === 'tenantId');
    cache.set(aDelegado(modelo.name), {
      modelo: modelo.name,
      delegado: aDelegado(modelo.name),
      tieneTenantId: Boolean(campo),
      tenantIdOpcional: Boolean(campo) && !campo!.isRequired,
    });
  }

  return cache;
}

export function infoDeModelo(delegado: string) {
  return registroDeModelos().get(delegado);
}

/**
 * Operaciones que devuelven o afectan a un conjunto de filas. Sin filtro de
 * tenant, una sola de ellas expone o modifica datos de otra empresa.
 */
export const OPERACIONES_COLECTIVAS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'updateMany',
  'updateManyAndReturn',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

/**
 * Operaciones que apuntan a una fila concreta por su identificador. En este
 * proyecto el patron habitual es leerlas por id y comprobar la propiedad justo
 * despues, de modo que su ausencia de filtro no es por si sola un defecto: se
 * registran aparte, con severidad informativa.
 */
export const OPERACIONES_POR_IDENTIDAD = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'delete',
  'upsert',
]);

/** Operaciones que insertan filas: el tenant debe viajar en `data`. */
export const OPERACIONES_DE_ESCRITURA = new Set(['create', 'createMany', 'createManyAndReturn']);

export function clasificarOperacion(operacion: string) {
  if (OPERACIONES_COLECTIVAS.has(operacion)) return 'colectiva' as const;
  if (OPERACIONES_POR_IDENTIDAD.has(operacion)) return 'por-identidad' as const;
  if (OPERACIONES_DE_ESCRITURA.has(operacion)) return 'escritura' as const;
  return 'otra' as const;
}
