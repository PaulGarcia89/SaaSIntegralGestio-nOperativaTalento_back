# Plan exhaustivo de pruebas del backend

## Estrategia

Pirámide recomendada:

1. **Unitarias:** DTOs, resolvers de scope, máquinas de estado, serialización y normalización de errores.
2. **Integración:** servicios + Prisma sobre PostgreSQL real; transacciones, constraints e idempotencia.
3. **HTTP/Supertest:** guards, headers manipulados, cookies, payloads y contratos.
4. **E2E:** recorrido ATS→empleado→onboarding, inventario, formación y documentos.
5. **Carga/seguridad:** k6, carreras, fuzzing de DTOs, uploads y rate limits.

## Matriz parametrizada para cada endpoint

Cada ruta de `QA_API_MATRIX.md` debe ejecutar:

| Variante | Expected |
|---|---|
| Caso válido mínimo | 2xx conforme contrato |
| Caso válido completo | 2xx y persistencia íntegra |
| Campo requerido ausente | 400/422 |
| Campo extra | 400 por `forbidNonWhitelisted` |
| Tipo incorrecto | 400/422 |
| Vacío/null | rechazo o semántica explícita |
| Longitud/límite máximo | acepta límite, rechaza límite+1 |
| UUID inválido | 400 |
| UUID inexistente | 404 sin fuga |
| Estado inválido | 409/422 |
| Sin JWT | 401 |
| JWT corrupto/expirado | 401 |
| Permiso revocado | 403 |
| Tenant/branch manipulado | 403/404 |

## Roles

Ejecutar acceso permitido/denegado para: SUPERADMIN, PLATFORM_ADMIN, TENANT_ADMIN, HR_MANAGER/HR, RECRUITER, INTERVIEWER, INSTRUCTOR, SUPERVISOR, INVENTORY_MANAGER, BRANCH_USER/EMPLOYEE y CANDIDATE. Probar además rol correcto sin permiso y permiso directo con rol distinto.

## Multi-tenant y sucursales

Dataset mínimo: Tenant A con A1/A2 y Tenant B con B1. Para cada familia probar read/update/delete/export/download por ID, query `tenantId`, header `x-tenant-id`, header `x-branch-id`, relaciones anidadas y operaciones bulk. El resultado debe ser 403/404 y nunca incluir nombre, email, existencia o conteo extranjero.

## Máquinas de estado prioritarias

### Postulación

`SUBMITTED → REVIEWING → INTERVIEW → APPROVED → HIRED`; `REJECTED` terminal salvo reapertura explícita; `HIRED` sólo mediante workflow transaccional.

### Vacante

`OPEN ↔ PAUSED → CLOSED/FILLED`; publicar requiere datos mínimos; `FILLED` al cubrir plazas; archivar/clonar debe dejar historial.

### Oferta

Borrador → aprobaciones requeridas → enviada → aceptada/rechazada/contraoferta/cancelada. No enviar sin versión aprobada; respuesta repetida debe ser idempotente.

### Inventario

Disponible → asignado → entregado → devolución solicitada → devuelto/validado. Dos asignaciones simultáneas del mismo activo: una sola debe ganar.

### Curso

DRAFT → IN_REVIEW → APPROVED → SCHEDULED/PUBLISHED → PAUSED/ARCHIVED/RETIRED. No asignar archivado/retirado.

## Autenticación

- Igualar mensajes/tiempos para usuario inexistente y contraseña incorrecta.
- Usuario/tenant suspendido.
- Refresh válido, rotación, reuse, revocación y expiración.
- Logout y revocación de una sesión entre múltiples sesiones.
- Cookie cross-site con Secure/SameSite/HttpOnly.
- Brute force y rate limit distribuido.
- Reset concurrente y revocación posterior.

## Concurrencia e idempotencia

Usar barrera para iniciar 10 requests simultáneas. Casos: contratación, activo, evaluación, webhook, outbox, comunicación, ingestión de productividad, reset y oferta. Validar conteos finales, responses coherentes y ausencia de 500 por constraint esperado.

## Uploads

PDF/DOCX/JPEG/PNG/ZIP válidos; MIME falso; magic bytes falsos; vacío; límite y límite+1; nombre con traversal/CRLF/null; ZIP bomb; duplicado; malware EICAR sólo en ambiente aislado; token firmado expirado/modificado; descarga cruzada por tenant/branch.

## Paginación y búsqueda

`page=0/-1/1/mayor-total`, `pageSize=0/1/100/101`, sorting inválido, filtros combinados, mayúsculas, acentos, espacios, `%_\\'`, cadena vacía y máxima. Verificar metadata uniforme y planes de consulta.

## Performance

Escenarios k6 read-only y mixtos con 1/10/50/100 VUs. Medir media, p95, p99, RPS, error rate, pool DB, Redis, CPU/memoria, tamaño de payload y queries/request. Buscar N+1 en listas con relaciones.

## Automatización CI

Pipeline: migrate DB efímera → seed → build → unit/integration → E2E → coverage → SAST/dependencies → k6 smoke → publicar reportes. Ningún test debe depender de Railway/producción.
