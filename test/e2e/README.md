# Suite E2E ATS

Esta suite inicia la aplicacion Nest real y prueba sus controladores, guards,
servicios y transacciones contra PostgreSQL. No reemplaza dependencias con mocks.

## Cobertura

- Vacante con pipeline personalizado.
- Registro y perfil del candidato.
- Postulacion y avance por etapas auditadas.
- Oferta estructurada, aprobacion financiera y gerencial.
- Envio, firma electronica y conversion automatica a empleado.
- Creacion del expediente y tareas de onboarding.
- Autenticacion obligatoria.
- Aislamiento por tenant y sucursal en listados y acceso directo por ID.
- Proteccion de vacantes, postulaciones y archivos de CV.
- Permisos de solo lectura.
- Validacion atomica de operaciones masivas con IDs de otra empresa.

## Ejecucion local

La base debe ser exclusiva para pruebas y su nombre debe contener `e2e`, `test` o
`certification`. El harness aborta antes de crear datos si esta condicion no se
cumple.

```bash
DATABASE_URL="postgresql://usuario:clave@localhost:5432/talentos_ats_e2e?schema=public" \
  npm run test:e2e:full
```

Si la base ya tiene migraciones y seed:

```bash
DATABASE_URL="postgresql://usuario:clave@localhost:5432/talentos_ats_e2e?schema=public" \
  npm run test:e2e
```

Los workers de correo, SLA y outbox se desactivan durante la prueba. La suite
conserva los registros auditables hasta que se descarte la base E2E, evitando
eliminar relaciones protegidas por `onDelete: Restrict` durante las aserciones.

## Integracion continua

El workflow `certification.yml` aplica migraciones, ejecuta la certificacion
existente, carga el seed y corre esta suite con PostgreSQL y Redis efimeros.
