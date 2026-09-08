# Datos de prueba — DATALINK TECH CORP

## Ya cargado por la API (sesión del administrador)

Sucursales (Doral, Brickell), 12 empleados, 4 vacantes con pipeline,
competencia y 4 cursos en cuatro estados, 2 asignaciones, catálogo y 10
activos con custodia, devolución y mantenimiento, existencias con mínimos,
3 cámaras, 5 zonas y ~290 eventos, plantilla de incorporación. Todo lleva
`PRUEBA` o `@example.com`.

## Lo que exige cuentas: `scripts/seed-pruebas-datalink.cjs`

Postular exige una cuenta de candidato autenticada; las contrataciones e
incorporaciones nacen de una postulación; y Formación asigna cursos a
usuarios, no a empleados. Las cuentas necesitan contraseña, y la contraseña
la pone quien ejecuta el script, no quien lo escribió:

```bash
cd FrontEnd
docker compose --env-file deploy/.env.self-hosted -f docker-compose.self-hosted.yml \
  exec -e TEST_PASSWORD='elige-una-de-al-menos-10' backend \
  node scripts/seed-pruebas-datalink.cjs
```

Hace tres cosas, todas idempotentes: publica en el mercado público las
vacantes abiertas que no tengan publicación; registra 12 candidatos y
postula a cada uno a su vacante por la API pública; crea 3 usuarios con rol
(supervisor, encargado de inventario, empleado) y acceso a las tres
sucursales.

Requiere la imagen del backend reconstruida con los dos arreglos de esta
tanda (fuga de cursos entre empresas y publicación de vacantes).

## Después del script

Con las postulaciones creadas, el resto va por la sesión del administrador:
cambios de etapa, entrevistas, evaluaciones, contratación, incorporación y
asignaciones de formación a los tres usuarios nuevos.

## Pendiente de diagnóstico: escrituras de inventario de restaurante → 500

Toda escritura en inventario de restaurante devuelve 500 (categorías,
ingredientes, entradas, consumos, mermas, conteos). Las lecturas funcionan
y nada queda a medias en la base.

### Lo que se pudo descartar sin el log (2026-09-08)

Se revisó el camino completo de una escritura (`POST
/restaurant-inventory/categories`) y se comparó con el de una lectura. Lo
único que tienen las escrituras y no las lecturas es
`RestaurantInventoryIdempotencyInterceptor`, que envuelve **cada** POST,
PATCH y DELETE del módulo en `prisma.$transaction` con un
`pg_advisory_xact_lock`, consulta y escribe `RestaurantInventoryIdempotencyRecord`
y guarda la respuesta como JSON. Se activa siempre, porque usa
`x-request-id` como clave cuando no llega `Idempotency-Key`. Descartado con
el código a la vista:

- La vigilancia de aislamiento por empresa (`tenant-scope`) solo bloquea con
  `TENANT_SCOPE_ENFORCEMENT=block`; `.env.self-hosted` no lo define, así que
  está en `warn`.
- La migración `20260825070000_restaurant_inventory_idempotency` existe y el
  contenedor ejecuta `prisma migrate deploy` al arrancar.
- Las 18 suites unitarias del módulo pasan (89 pruebas), incluida la del
  interceptor con Prisma simulado.
- Ni la auditoría HTTP (se escribe en `finish`, fuera de la respuesta) ni
  la validación de DTO (daría 400) explican un 500.

### Hipótesis ordenadas, y cómo confirmarlas

1. **Agotamiento del pool de conexiones dentro de la transacción.** El
   interceptor abre una transacción interactiva (5 s de tiempo máximo por
   defecto) y, dentro, el manejador ejecuta sus consultas con el cliente
   normal, o sea con *otra* conexión del pool. Si el pool del contenedor es
   pequeño (Prisma usa `CPU×2+1`; con un CPU asignado a Docker son 3) y hay
   otras peticiones en vuelo, el manejador espera una conexión que la
   transacción retiene y el error es
   `Transaction already closed` / `Timed out fetching a new connection`.
   En el log se vería exactamente esa frase. Solución: `connection_limit`
   en `DATABASE_URL` (p. ej. `?connection_limit=10`) o, mejor, ejecutar el
   manejador fuera de la transacción y usar la transacción solo para
   leer/escribir el registro de idempotencia.
2. **`responseJson` no serializable.** `JSON.parse(JSON.stringify(result))`
   revienta si la respuesta trae un `BigInt` o es `undefined`. En el log
   sería `Do not know how to serialize a BigInt` o `"undefined" is not valid
   JSON`. Ningún modelo del módulo usa `BigInt`, así que es poco probable.
3. **Tabla `RestaurantInventoryIdempotencyRecord` ausente** porque la base
   local se creó con `db push` antes de esa migración y `migrate deploy` la
   dio por aplicada. En el log: `relation ... does not exist` (P2021).

### Lo que hace falta de la máquina

```bash
cd FrontEnd
docker compose --env-file deploy/.env.self-hosted -f docker-compose.self-hosted.yml \
  logs backend --tail 300 | grep -B2 -A12 "inventory_error"
```

`inventory_error` es la línea que escribe `RestaurantInventoryResponseInterceptor`
en cada fallo; justo detrás va la traza. Con esas doce líneas se sabe cuál
de las tres es y el arreglo es de una tarde.
