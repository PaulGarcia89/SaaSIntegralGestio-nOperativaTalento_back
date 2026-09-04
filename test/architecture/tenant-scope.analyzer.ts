import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as ts from 'typescript';
import { estaExento } from '../../src/common/prisma/tenant-scope.allowlist';
import {
  clasificarOperacion,
  infoDeModelo,
} from '../../src/common/prisma/tenant-scope.model-registry';

export type Clasificacion = 'colectiva' | 'por-identidad' | 'escritura';

export interface LlamadaSinAcotar {
  archivo: string;
  linea: number;
  modelo: string;
  operacion: string;
  clasificacion: Clasificacion;
}

export interface ResultadoDelAnalisis {
  llamadas: LlamadaSinAcotar[];
  /** `(tx as any)[modelo]` y similares: el analisis estatico no puede resolverlos. */
  accesosDinamicos: { archivo: string; linea: number }[];
  totalLlamadasPrisma: number;
}

/** Expresiones desde las que se accede al cliente en este proyecto. */
const RAICES_DE_CLIENTE = new Set(['this.prisma', 'tx', 'prisma', 'this.db', 'client']);

function archivosFuente(dir: string): string[] {
  return readdirSync(dir).flatMap((entrada) => {
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) return archivosFuente(completo);
    if (!completo.endsWith('.ts')) return [];
    if (completo.endsWith('.spec.ts') || completo.endsWith('.d.ts')) return [];
    return [completo];
  });
}

/** Busca `tenantId` dentro del nodo de una propiedad concreta del argumento. */
function propiedadContieneTenant(
  argumento: ts.ObjectLiteralExpression,
  nombres: string[],
): boolean {
  for (const propiedad of argumento.properties) {
    if (!ts.isPropertyAssignment(propiedad)) continue;
    const nombre = propiedad.name.getText();
    if (!nombres.includes(nombre)) continue;
    if (propiedad.initializer.getText().includes('tenantId')) return true;
  }
  return false;
}

export function analizar(raizSrc: string): ResultadoDelAnalisis {
  const llamadas: LlamadaSinAcotar[] = [];
  const accesosDinamicos: { archivo: string; linea: number }[] = [];
  let totalLlamadasPrisma = 0;

  for (const ruta of archivosFuente(raizSrc)) {
    const contenido = readFileSync(ruta, 'utf8');
    const fuente = ts.createSourceFile(ruta, contenido, ts.ScriptTarget.ES2021, true);
    const archivo = relative(raizSrc, ruta).split(sep).join('/');

    const visitar = (nodo: ts.Node) => {
      // `(tx as any)[modelo]` o `this.prisma[modelo]`: el delegado se resuelve en
      // tiempo de ejecucion, de modo que ningun analisis estatico puede saber
      // sobre que tabla opera. Solo la extension de cliente los cubre.
      if (ts.isElementAccessExpression(nodo)) {
        const raiz = nodo.expression.getText().replace(/\s+/g, '');
        if (/^\(?(tx|this\.prisma|prisma)(asany)?\)?$/.test(raiz)) {
          accesosDinamicos.push({
            archivo,
            linea: fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1,
          });
        }
      }

      if (ts.isCallExpression(nodo) && ts.isPropertyAccessExpression(nodo.expression)) {
        const acceso = nodo.expression;
        const operacion = acceso.name.getText();

        if (ts.isPropertyAccessExpression(acceso.expression)) {
          const delegado = acceso.expression.name.getText();
          const raiz = acceso.expression.expression.getText();

          if (RAICES_DE_CLIENTE.has(raiz)) {
            totalLlamadasPrisma += 1;
            const info = infoDeModelo(delegado);
            const clasificacion = clasificarOperacion(operacion);

            if (
              info?.tieneTenantId &&
              clasificacion !== 'otra' &&
              !estaExento(info.modelo, operacion)
            ) {
              const primerArgumento = nodo.arguments[0];
              const acotada =
                primerArgumento !== undefined &&
                ts.isObjectLiteralExpression(primerArgumento) &&
                propiedadContieneTenant(
                  primerArgumento,
                  clasificacion === 'escritura' ? ['data', 'create'] : ['where'],
                );

              if (!acotada) {
                llamadas.push({
                  archivo,
                  linea: fuente.getLineAndCharacterOfPosition(nodo.getStart()).line + 1,
                  modelo: info.modelo,
                  operacion,
                  clasificacion,
                });
              }
            }
          }
        }
      }

      ts.forEachChild(nodo, visitar);
    };

    visitar(fuente);
  }

  return { llamadas, accesosDinamicos, totalLlamadasPrisma };
}

export type LineaBase = Record<string, { colectiva: number; escritura: number }>;

export function construirLineaBase(llamadas: LlamadaSinAcotar[]): LineaBase {
  const base: LineaBase = {};
  for (const llamada of llamadas) {
    if (llamada.clasificacion === 'por-identidad') continue;
    base[llamada.archivo] ??= { colectiva: 0, escritura: 0 };
    base[llamada.archivo][llamada.clasificacion] += 1;
  }
  return Object.fromEntries(Object.entries(base).sort(([a], [b]) => a.localeCompare(b)));
}
