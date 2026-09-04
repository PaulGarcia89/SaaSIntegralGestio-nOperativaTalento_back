import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { analizar, construirLineaBase, LineaBase } from './tenant-scope.analyzer';

/**
 * Trinquete de aislamiento multiempresa.
 *
 * Recorre `src/` con la API del compilador de TypeScript, localiza cada llamada
 * a Prisma sobre un modelo que declara `tenantId` y comprueba si la clausula
 * correspondiente lo menciona. El resultado se compara con una linea base:
 *
 *   - Si un archivo AUMENTA su numero de consultas sin filtro, la prueba falla.
 *   - Si lo reduce, la prueba pasa y avisa de que conviene regenerar la base.
 *
 * No pretende demostrar que las 383 consultas de la linea base sean incorrectas
 * —la mayoria se acotan por una comprobacion de propiedad previa o a traves de
 * la entidad padre—, sino impedir que ese numero crezca mientras se ordena.
 *
 * Regenerar tras una mejora:
 *   npx ts-node test/architecture/generar-linea-base.ts
 *
 * Origen: auditoria de arquitectura 2026-09-04, hallazgo CRITICO-3.
 */
describe('Aislamiento multiempresa — analisis estatico', () => {
  const raiz = join(__dirname, '..', '..', 'src');
  const resultado = analizar(raiz);
  const actual = construirLineaBase(resultado.llamadas);
  const base = JSON.parse(
    readFileSync(join(__dirname, 'tenant-scope.baseline.json'), 'utf8'),
  ) as { archivos: LineaBase; accesosDinamicos: number };

  it('encuentra las llamadas a Prisma del proyecto', () => {
    expect(resultado.totalLlamadasPrisma).toBeGreaterThan(2000);
  });

  it('ningun archivo aumenta sus consultas colectivas sin filtro de tenant', () => {
    const regresiones: string[] = [];

    for (const [archivo, conteo] of Object.entries(actual)) {
      const previo = base.archivos[archivo] ?? { colectiva: 0, escritura: 0 };

      if (conteo.colectiva > previo.colectiva) {
        const nuevas = resultado.llamadas
          .filter((l) => l.archivo === archivo && l.clasificacion === 'colectiva')
          .map((l) => `      ${archivo}:${l.linea}  ${l.modelo}.${l.operacion}`)
          .join('\n');
        regresiones.push(
          `\n  ${archivo}: ${previo.colectiva} -> ${conteo.colectiva} consultas colectivas sin filtro\n${nuevas}`,
        );
      }
    }

    expect(regresiones.join('')).toBe('');
  });

  it('ningun archivo aumenta sus escrituras sin tenantId', () => {
    const regresiones = Object.entries(actual)
      .filter(([archivo, conteo]) => conteo.escritura > (base.archivos[archivo]?.escritura ?? 0))
      .map(([archivo, conteo]) => `${archivo}: ${base.archivos[archivo]?.escritura ?? 0} -> ${conteo.escritura}`);

    expect(regresiones).toEqual([]);
  });

  it('no aparecen nuevos accesos dinamicos al cliente', () => {
    // `(tx as any)[modelo]` impide cualquier comprobacion estatica: solo la
    // extension de cliente los cubre en tiempo de ejecucion.
    expect(resultado.accesosDinamicos.length).toBeLessThanOrEqual(base.accesosDinamicos);
  });

  it('avisa cuando la linea base se puede estrechar', () => {
    const mejoras = Object.entries(base.archivos)
      .filter(([archivo, previo]) => (actual[archivo]?.colectiva ?? 0) < previo.colectiva)
      .map(([archivo, previo]) => `${archivo}: ${previo.colectiva} -> ${actual[archivo]?.colectiva ?? 0}`);

    if (mejoras.length > 0) {
      // No falla: solo lo hace visible para que la base acompane la mejora.
      console.info(
        `\nLa linea base de aislamiento se puede estrechar en ${mejoras.length} archivo(s):\n  ` +
          `${mejoras.join('\n  ')}\n  Regenerar con: npx ts-node test/architecture/generar-linea-base.ts\n`,
      );
    }

    expect(true).toBe(true);
  });
});
