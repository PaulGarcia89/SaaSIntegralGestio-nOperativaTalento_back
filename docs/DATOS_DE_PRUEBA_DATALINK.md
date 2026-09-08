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

## Pendiente de diagnóstico

Toda escritura en inventario de restaurante devuelve 500 (categorías,
ingredientes, entradas, consumos, mermas, conteos). Las lecturas funcionan
y nada queda a medias en la base. El log del contenedor es lo que falta:

```bash
cd FrontEnd
docker compose --env-file deploy/.env.self-hosted -f docker-compose.self-hosted.yml \
  logs backend --tail 300 | grep -B2 -A12 "3c1d733f-8db7"
```
