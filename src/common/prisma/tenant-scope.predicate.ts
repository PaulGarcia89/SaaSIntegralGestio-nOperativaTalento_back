const PROFUNDIDAD_MAXIMA = 6;

/**
 * Busca `tenantId` en cualquier punto de una clausula `where` o `data`.
 *
 * Cuenta como acotada tanto la forma directa (`{ tenantId }`) como:
 *  - dentro de `AND` / `OR` / `NOT`;
 *  - a traves de un filtro de relacion (`{ module: { course: { tenantId } } }`),
 *    que es el patron con el que el modulo de formacion acota sus contenidos;
 *  - en una clave unica compuesta (`tenantId_branchId_warehouseId_ingredientId`).
 *
 * Se limita la profundidad para que el coste sea constante en la practica: las
 * clausulas reales del proyecto no pasan de tres niveles.
 */
export function contieneFiltroDeTenant(valor: unknown, profundidad = 0): boolean {
  if (valor === null || valor === undefined || profundidad > PROFUNDIDAD_MAXIMA) {
    return false;
  }

  if (Array.isArray(valor)) {
    return valor.some((elemento) => contieneFiltroDeTenant(elemento, profundidad + 1));
  }

  if (typeof valor !== 'object') {
    return false;
  }

  for (const [clave, contenido] of Object.entries(valor as Record<string, unknown>)) {
    if (clave === 'tenantId' || clave.startsWith('tenantId_')) {
      return true;
    }
    if (contieneFiltroDeTenant(contenido, profundidad + 1)) {
      return true;
    }
  }

  return false;
}

export interface ArgumentosDeConsulta {
  where?: unknown;
  data?: unknown;
  create?: unknown;
  [clave: string]: unknown;
}

/**
 * Decide si una llamada esta acotada por tenant, segun el tipo de operacion:
 *  - colectivas y por identidad: el filtro debe estar en `where`;
 *  - escrituras: el tenant debe viajar en `data` (o en `create`, para `upsert`).
 */
export function consultaAcotada(
  clasificacion: 'colectiva' | 'por-identidad' | 'escritura' | 'otra',
  argumentos: ArgumentosDeConsulta | undefined,
): boolean {
  if (clasificacion === 'otra') return true;
  if (!argumentos) return false;

  if (clasificacion === 'escritura') {
    return contieneFiltroDeTenant(argumentos.data) || contieneFiltroDeTenant(argumentos.create);
  }

  return contieneFiltroDeTenant(argumentos.where);
}

/**
 * Primer marco de pila fuera de la propia extension y del runtime de Prisma:
 * es el archivo y la linea que hay que corregir.
 */
export function puntoDeLlamada(pila: string | undefined): string {
  if (!pila) return 'desconocido';

  const marcos = pila.split('\n').slice(1);
  for (const marco of marcos) {
    if (
      marco.includes('tenant-scope') ||
      marco.includes('node_modules') ||
      marco.includes('prisma.service')
    ) {
      continue;
    }
    const coincidencia = marco.match(/\(?([^()\s]+:\d+:\d+)\)?$/);
    if (coincidencia) {
      return coincidencia[1].replace(/^.*?\/src\//, 'src/');
    }
  }

  return 'desconocido';
}
