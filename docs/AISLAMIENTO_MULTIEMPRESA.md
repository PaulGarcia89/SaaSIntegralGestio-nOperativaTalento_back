# Aislamiento multiempresa — barreras y procedimiento

Origen: auditoría de arquitectura del 2026-09-04, hallazgo **CRÍTICO-3** (*el aislamiento entre empresas depende íntegramente de la disciplina del programador*).

## El punto de partida

`PrismaService` eran catorce líneas: un `PrismaClient` con `$connect()`. Sin extensión, sin middleware y sin RLS. Cada una de las llamadas a Prisma del proyecto tenía que acordarse de acotar por `tenantId` por su cuenta, y la primera omisión habría sido una fuga entre empresas que nada habría detectado.

La auditoría verificó quince de las llamadas más sospechosas y **todas estaban correctamente acotadas**. El problema nunca fue el estado actual, sino la ausencia de red.

## Las tres barreras que ahora existen

### 1. Extensión de cliente Prisma — vigilancia en tiempo de ejecución

`src/common/prisma/tenant-scope.extension.ts`, instalada desde `PrismaService`. Se aplica **también dentro de `$transaction`**, que es donde vive la mayor parte de la lógica de inventario; ésa es la razón de usar una extensión de cliente y no un envoltorio propio.

Para cada operación decide si necesita filtro de tenant y si lo lleva:

| Clasificación | Operaciones | Dónde debe estar el tenant |
|---|---|---|
| **Colectiva** | `findMany`, `findFirst`, `updateMany`, `deleteMany`, `count`, `aggregate`, `groupBy`… | en `where` |
| **Escritura** | `create`, `createMany` | en `data` (o `create`, para `upsert`) |
| **Por identidad** | `findUnique`, `update`, `delete`, `upsert` | en `where`, pero se trata aparte: el proyecto las resuelve con una comprobación de propiedad inmediatamente posterior |

Cuenta como acotada la forma directa (`{ tenantId }`), la que va dentro de `AND`/`OR`/`NOT`, la que llega **a través de una relación** (`{ module: { course: { tenantId } } }` — el patrón del módulo de formación) y la clave única compuesta (`tenantId_branchId_warehouseId_ingredientId`).

Quedan exentos automáticamente los **55 modelos que no declaran `tenantId`** (se acotan por su entidad padre). Las excepciones para modelos que sí lo declaran son explícitas y **exigen un motivo escrito**: `src/common/prisma/tenant-scope.allowlist.ts`. Hoy son tres: `UserSession`, `User` (login por correo antes de conocer el tenant) y nada más.

**Modos** — variable `TENANT_SCOPE_ENFORCEMENT`:

| Modo | Comportamiento |
|---|---|
| `off` | Sin vigilancia. La extensión ni siquiera se instala. |
| `warn` | **Por defecto.** Solo observa: registra el hallazgo y deja pasar la consulta **sin alterar ni un argumento**. |
| `block` | Además corta las operaciones colectivas y las escrituras sin tenant. Las lecturas por identidad siguen pasando. |

El registro **deduplica por modelo + operación**: cada combinación se escribe en el log una sola vez por proceso y después solo incrementa su contador. Sin eso, un despliegue con tráfico real generaría miles de líneas idénticas y el aviso dejaría de leerse. La pila de llamadas —que da el archivo y la línea a corregir— se calcula únicamente la primera vez que aparece cada combinación, de modo que su coste es despreciable.

La instalación va dentro de un `try/catch`: si por cualquier motivo la extensión no pudiera aplicarse, se sigue con el cliente sin extender y se avisa por log. **Vigilar el aislamiento nunca debe impedir que la aplicación funcione.**

> **Pendiente de confirmar en un entorno con motor Prisma.** El motor instalado es `darwin-arm64` y la sesión en la que se implementó esto corría sobre Linux, así que la instalación de la extensión no pudo ejercitarse contra un cliente real. Toda su lógica está cubierta por 44 pruebas unitarias, y el peor caso posible es que no se instale y no vigile nada. **Confírmelo al arrancar**: debe aparecer `Vigilancia de aislamiento multiempresa activa en modo "warn"` en el log de arranque.

### 2. Test de arquitectura — trinquete en cada PR

`test/architecture/tenant-scope.spec.ts` recorre `src/` con la API del compilador de TypeScript, localiza **2.312 llamadas a Prisma** y comprueba, para cada una sobre un modelo con `tenantId`, si la cláusula correspondiente lo menciona.

Estado en la línea base del 2026-09-04:

| | |
|---|---|
| Llamadas a Prisma analizadas | 2.312 |
| Colectivas sin filtro literal | 383 (en 62 archivos) |
| Escrituras sin `tenantId` en `data` | 10 |
| Por identidad (informativas) | 413 |
| Accesos dinámicos `(tx as any)[modelo]` | 4 |

**Esas 383 no son 383 defectos.** La mayoría se acotan por una comprobación de propiedad previa o a través de la entidad padre, cosa que ningún análisis estático puede ver. La línea base no afirma que estén mal: impide que ese número **crezca** mientras se ordena.

- Si un archivo aumenta su cuenta, la prueba **falla** e imprime el archivo, la línea, el modelo y la operación exactos.
- Si la reduce, la prueba pasa y avisa por consola de que conviene regenerar la base.

Comprobado inyectando una regresión deliberada: la prueba la detectó y la señaló como `health/health.service.ts:27 Employee.findMany`.

Regenerar tras una mejora:

```bash
npx ts-node test/architecture/generar-linea-base.ts
```

Los cuatro **accesos dinámicos** (`(tx as any)[model]` en `restaurant-inventory.service.ts`) son irresolubles estáticamente: solo la extensión de cliente los cubre. La prueba vigila que su número no crezca.

### 3. Ruta de diagnóstico

`GET /api/metrics/tenant-scope` (global, `metrics.operations.read`) devuelve el inventario acumulado por el proceso: modo activo, combinaciones, ocurrencias y el punto de llamada de cada una. Es lo que hay que mirar para decidir el paso a `block`.

## Procedimiento para pasar a `block`

1. **Dejar correr `warn` en producción durante al menos dos semanas**, cubriendo un cierre de mes y un ciclo completo de inventario. Los picos de uso son los que sacan a la luz las rutas poco transitadas.
2. **Vaciar el inventario.** Por cada combinación de `GET /api/metrics/tenant-scope`, decidir una de tres cosas:
   - añadir el filtro que falta (lo habitual);
   - anotarla en `tenant-scope.allowlist.ts` **con su motivo**, si la consulta es legítimamente global;
   - reescribir el acceso si depende de un delegado dinámico.
3. **Estrechar la línea base** con cada mejora, para que el trinquete no se afloje.
4. **Activar `block` primero en preproducción** un ciclo completo. Recuerde que en `block` una consulta sin filtro devuelve 500: es deliberado —es un fallo del programa, no del usuario— pero conviene descubrirlo antes de producción.
5. **Producción**, en ventana de baja actividad. La reversión es inmediata: `TENANT_SCOPE_ENFORCEMENT=warn` y reiniciar.

## Lo que sigue sin resolver

- **Los 55 modelos sin `tenantId`.** La jerarquía completa de contenidos formativos (`TrainingCourseModule`, `TrainingLesson`, `TrainingContentBlock`, `TrainingQuiz`…) se acota subiendo hasta `TrainingCourse`. Hoy se hace bien en todos los puntos revisados, pero denormalizar `tenantId` a esas tablas con su índice compuesto eliminaría la clase entera de fallo. Requiere migración con backfill.
- **Row Level Security de PostgreSQL** como cuarta capa. Sigue sin ser prioritaria: exige gestión de conexión por tenant y la extensión entrega la mayor parte del beneficio a una fracción del coste. Reevaluar cuando `block` lleve un trimestre estable.
