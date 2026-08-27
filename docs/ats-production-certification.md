# Certificación productiva del ATS

La certificación separa deliberadamente las pruebas con escritura de las
comprobaciones de producción. Nunca se ejecuta el ciclo de contratación E2E
contra la base productiva.

## Puertas de salida

1. `npm run certify`: build, pruebas unitarias y auditoría de dependencias.
2. `npm run test:e2e:full`: migraciones, seed y E2E real contra una base
   desechable cuyo nombre contenga `e2e`, `test` o `certification`.
3. `pnpm test:e2e:ats:staging` en el frontend: navegador real contra frontend y
   backend de staging. Crea una vacante y una postulación efímeras y archiva la
   vacante al finalizar.
4. `npm run certify:integrations:production`: pruebas activas controladas de
   correo SMTP o Resend, S3/R2, ClamAV y calendarios.
5. `npm run certify:ats:production`: smoke ATS de solo lectura en producción.

## Certificación de producción

La cuenta utilizada debe ser una cuenta técnica de una empresa de validación,
con permisos de lectura de vacantes, postulaciones y analítica. No debe ser una
cuenta superadministradora compartida.

```bash
ATS_CERT_BASE_URL="https://api.example.com" \
ATS_CERT_EMAIL="ats-cert@example.com" \
ATS_CERT_PASSWORD="..." \
ATS_CERT_TENANT_SLUG="certificacion" \
ATS_CERT_EXPECTED_TENANT_ID="uuid" \
ATS_CERT_EXPECTED_BRANCH_ID="uuid" \
ATS_CERT_REPORT_PATH="ats-production-certification.json" \
npm run certify:ats:production
```

El comando comprueba:

- disponibilidad de API y base de datos;
- rechazo de solicitudes ATS anónimas;
- autenticación y módulo ATS habilitado;
- empresa y sucursal esperadas;
- contratos paginados de vacantes y postulaciones;
- alcance de la analítica ATS;
- latencia p95 de las comprobaciones.

El reporte no contiene contraseña, token ni datos personales. Un fallo produce
código de salida distinto de cero y un reporte con estado `FAIL`.

### Correo saliente por SMTP

Para usar un buzón SMTP en lugar de Resend, configura únicamente como secretos
del entorno desplegado:

```text
EMAIL_PROVIDER=SMTP
SMTP_HOST=mail.example.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_FAMILY=4
SMTP_USER=talento@example.com
SMTP_PASSWORD=<secreto>
NOTIFICATION_FROM_EMAIL=Talento <talento@example.com>
```

La certificación activa autentica contra el servidor, pero no expone la
contraseña ni envía mensajes. La recepción bidireccional por webhook continúa
requiriendo Resend hasta implementar un consumidor IMAP dedicado.

## Certificación E2E de staging

El workflow manual `ATS staging certification` requiere variables y secretos
del environment `staging`:

- `ATS_STAGING_FRONTEND_URL`
- `ATS_STAGING_BACKEND_URL`
- `ATS_STAGING_TENANT_SLUG`
- `ATS_STAGING_BRANCH_ID`
- `ATS_STAGING_ADMIN_EMAIL`
- `ATS_STAGING_ADMIN_PASSWORD`

La suite exige además `E2E_ATS_ENVIRONMENT=staging` y
`E2E_ATS_ALLOW_WRITES=true`. Sin ambas confirmaciones se detiene antes de abrir
el navegador.

## Criterio de aprobación

Una versión se considera certificada cuando las cinco puertas terminan en
verde sobre el mismo commit y se conservan los reportes de CI. Las pruebas de
integraciones activas pueden ejecutarse después del despliegue, pero cualquier
fallo impide declarar la versión certificada.
