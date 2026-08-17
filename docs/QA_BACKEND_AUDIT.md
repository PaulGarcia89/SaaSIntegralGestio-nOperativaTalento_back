# Auditoría QA profunda del backend

## Dictamen ejecutivo

El backend muestra una arquitectura de seguridad considerablemente más madura que un CRUD convencional: guards de tenant/suscripción/módulo/permiso, contexto activo reconstruido desde persistencia, filtros por sucursal en dominios principales, refresh token rotation, outbox e idempotencia, almacenamiento privado y contratación serializable.

Sin embargo, **no está listo para certificación final**. La razón principal es verificable: el gate automatizado no está verde. Además, la auditoría detectó una brecha HIGH de sucursal en Productividad y ausencia HIGH de rate limiting en superficies públicas y de autenticación.

## Alcance y método

- 382 archivos bajo `src` identificados al inicio.
- 560 rutas efectivas inventariadas, incluyendo aliases.
- Revisión de controladores, guards, servicios críticos, Prisma, uploads, errores, logs, tests y scripts.
- Compilación y suites Jest/RBAC ejecutadas.
- Sin cambios de código y sin operaciones destructivas contra producción.
- E2E y carga no ejecutados por ausencia de una base efímera autorizada.

## Evaluación por fase

| Fase | Resultado | Comentario |
|---|---|---|
| Inventario API | PASS | Matriz completa generada |
| Funcional | PARTIAL | 116 Jest pasan; faltan E2E y matriz parametrizada completa |
| Estados | PARTIAL | Buenas reglas ATS/workflow; falta certificación exhaustiva por dominio |
| RBAC | FAIL gate | 24/27 casos RBAC pasan |
| Multi-tenant | PASS parcial | Casos centrales cubiertos; falta E2E completo |
| Sucursales | FAIL | Productividad no aplica branch scope del actor |
| Autenticación | PARTIAL | Rotación/reuse sólidos; falta rate limit y carrera de reset |
| Suscripciones | PASS parcial | Guards y módulos presentes; falta matriz de todos los estados |
| Integridad | PASS parcial | FKs/uniques extensos; falta verificación de datos reales aislados |
| Concurrencia | PARTIAL | Hiring serializable; carreras pendientes en reset/productividad |
| Idempotencia | PARTIAL | Outbox sólido; casos puntuales no normalizan carreras |
| Paginación/search | PARTIAL | DTOs y límites variables; falta contrato uniforme |
| Errores | PASS parcial | No fuga stack/SQL; mapeo Prisma incompleto |
| Seguridad | FAIL | Dos hallazgos HIGH abiertos |
| File upload | PASS parcial | ATS fuerte; preboarding/SCORM desiguales |
| Performance | NOT CERTIFIED | Sin ejecución controlada p95/p99 |
| Auditoría | PASS parcial | Middleware e eventos presentes; falta matriz de acciones completa |
| Automatización | FAIL gate | 4 suites Jest y 3 casos RBAC fallan |

## Arquitectura observada

Cadena habitual: JWT → TenantGuard → SubscriptionGuard → ModuleAccessGuard → ScopeGuard/BranchAccessGuard → PermissionGuard → filtro de servicio por tenant/branch. La defensa en profundidad funciona bien en vacantes, postulaciones, empleados, workflows, comunicaciones ATS y archivos privados.

El riesgo aparece donde una familia se aparta de esa cadena. Productividad recibe IDs de sucursal sin actor/BranchAccessGuard. También existen rutas cuya política está sólo en el servicio, aumentando el riesgo de omisión en nuevas operaciones.

## Integridad y concurrencia

Prisma define claves únicas para tenant/email, tenant/sourceCandidate, vacancy/candidate, outbox idempotency, ofertas/versiones, scorecards, activos y otras relaciones. Hiring usa aislamiento `Serializable` y retry de conflicto. Estos son controles positivos.

No obstante, un unique constraint por sí solo no garantiza una respuesta API idempotente: ingestión de productividad puede producir P2002 concurrente. El reset de candidato necesita consumo condicional atómico.

## Contratos y errores

`ValidationPipe` usa `whitelist`, `transform` y `forbidNonWhitelisted`, lo cual cubre mass assignment DTO. `GlobalExceptionFilter` oculta detalles internos y agrega requestId. Debe añadirse traducción estable de errores Prisma y homogeneizar 409/422.

## Uploads

ATS privado presenta controles fuertes: magic bytes, límites, PDF activo, DOCX seguro, hash, storage key segura y enlaces firmados. SCORM bloquea traversal y expansión masiva. La brecha está en la desigualdad: preboarding confía en MIME y SCORM permite aceptación por extensión.

## Rendimiento

Existe logging de requests lentos y script k6 ATS. No se pudo certificar p95/p99, queries/request o N+1 sin entorno aislado y dataset conocido. La gran cantidad de includes/relaciones en ATS, training, onboarding y métricas amerita observabilidad de Prisma y explain plans.

## Recomendación de salida

1. Corregir QA-001, QA-002 y QA-003 antes del siguiente release.
2. Reparar carreras QA-004/005 y unificar uploads QA-006/007.
3. Ejecutar E2E con Postgres/Redis efímeros.
4. Ejecutar carga read-only y mixta con SLO acordado.
5. Repetir auditoría y cerrar hallazgos con evidencia de test.

Documentos relacionados:

- `docs/QA_API_MATRIX.md`
- `docs/QA_SECURITY_FINDINGS.md`
- `docs/QA_BACKEND_TEST_PLAN.md`
- `docs/QA_BACKEND_TEST_RESULTS.md`
