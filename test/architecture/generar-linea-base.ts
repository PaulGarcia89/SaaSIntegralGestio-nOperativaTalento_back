import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { analizar, construirLineaBase } from './tenant-scope.analyzer';

const raiz = join(__dirname, '..', '..', 'src');
const resultado = analizar(raiz);
const base = construirLineaBase(resultado.llamadas);

writeFileSync(
  join(__dirname, 'tenant-scope.baseline.json'),
  `${JSON.stringify(
    {
      _comentario:
        'Linea base del aislamiento multiempresa. La prueba falla si algun archivo aumenta su numero de consultas sin filtro de tenant. Regenerar solo tras REDUCIRLO: npx ts-node test/architecture/generar-linea-base.ts',
      _generado: new Date().toISOString().slice(0, 10),
      accesosDinamicos: resultado.accesosDinamicos.length,
      archivos: base,
    },
    null,
    2,
  )}\n`,
);

const totales = Object.values(base).reduce(
  (acc, v) => ({ colectiva: acc.colectiva + v.colectiva, escritura: acc.escritura + v.escritura }),
  { colectiva: 0, escritura: 0 },
);

console.log(`Llamadas a Prisma analizadas: ${resultado.totalLlamadasPrisma}`);
console.log(`Sin filtro — colectivas: ${totales.colectiva} · escrituras: ${totales.escritura}`);
console.log(`Por identidad (informativas): ${resultado.llamadas.filter((l) => l.clasificacion === 'por-identidad').length}`);
console.log(`Accesos dinamicos (tx as any)[modelo]: ${resultado.accesosDinamicos.length}`);
console.log(`Archivos en la linea base: ${Object.keys(base).length}`);
