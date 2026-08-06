# Gate de escala ATS en Railway

Este gate no crea, modifica ni elimina datos de clientes. Antes de admitir más clientes, ejecútalo manualmente desde GitHub Actions con el entorno protegido `production`.

## Configuración

- Variables: `ATS_PRODUCTION_BACKEND_URL`, `ATS_PRODUCTION_TENANT_SLUG`, `ATS_PRODUCTION_TENANT_ID`, `ATS_PRODUCTION_BRANCH_ID`.
- Secretos: `ATS_PRODUCTION_CERT_EMAIL`, `ATS_PRODUCTION_CERT_PASSWORD`.
- La cuenta certificadora debe tener ATS habilitado y acceso únicamente al tenant y sucursal esperados.

## Cobertura

- El script de certificación valida HTTPS, salud, autenticación, endpoints ATS protegidos, paginación y alcance de tenant/sucursal.
- La suite `test/e2e/ats-multitenant-security.e2e-spec.ts` valida intentos de acceso cruzado en CI usando PostgreSQL efímero.
- k6 usa únicamente `health/live` y vacantes públicas, con rampa de 10 VU por defecto, error menor al 1% y p95 inferior a 1.5 s.

No aumentes `virtual_users` por encima de 25 sin revisar CPU, memoria, base de datos y logs de Railway. Un resultado fallido bloquea el gate: corrige primero capacidad, índices o errores antes de volver a ejecutarlo.
