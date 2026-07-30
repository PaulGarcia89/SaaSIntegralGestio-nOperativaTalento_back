# Auditoría de arquitectura, API y seguridad del backend

Fecha: 2026-07-22

## Alcance y estado auditado

La auditoría se realizó sobre el estado actual del repositorio, incluyendo los cambios locales sin confirmar. No se revirtió ni modificó código funcional durante la inspección. El stack real es NestJS 10, TypeScript 5.6, Prisma 5, PostgreSQL, JWT, cookies de refresh token, BullMQ/Redis o RabbitMQ, y un documento OpenAPI construido manualmente. No hay SDK de Stripe, almacenamiento S3/R2 ni un framework de pruebas configurado.

El sistema contiene 26 controladores, aproximadamente 124 operaciones protegidas con permisos y 63 modelos Prisma. Los servicios suman unas 13 000 líneas; `WorkflowsService` (2 382), `MetricsService` (1 585), `AutomationService` (1 397) y `TrainingService` (1 255) concentran gran parte de la complejidad.

## Resumen ejecutivo

La base arquitectónica tiene buenas decisiones: DTO globalmente validados con whitelist, contexto autenticado rehidratado desde base de datos en cada solicitud, sesiones revocables, rotación de refresh token con detección de reutilización, filtros por tenant en la mayoría de servicios, RBAC basado en permisos, scopes global/tenant/sucursal, paginación limitada, auditoría, request ID y un outbox con colas.

No obstante, el aislamiento SaaS todavía depende demasiado de disciplina en servicios y no de invariantes estructurales. Los riesgos más importantes son la ausencia general de `ModuleAccessGuard`, rutas operativas sin `SubscriptionGuard`, métricas protegidas solamente por JWT, falta de rate limiting en login y endpoints públicos, asociaciones relacionales que pueden cruzar tenants, y JWT innecesariamente voluminosos.

## Hallazgos priorizados

| ID | Severidad | Hallazgo | Evidencia | Impacto | Recomendación |
|---|---|---|---|---|---|
| SEC-01 | Crítica | Los módulos del plan no se exigen en la API general. | `ModuleAccessGuard` existe, pero ningún controlador usa `@ModuleAccess`; Training usa un guard propio. | Un tenant puede invocar ATS, onboarding, reportes u otras funciones aunque su plan no incluya el módulo. | Mapear cada familia de rutas a `ModuleCode` y aplicar guard + decorador. |
| SEC-02 | Crítica | Vacancies, Applications, Branches y Employees omiten `SubscriptionGuard`. | Sus controladores solo aplican JWT, tenant, scope, branch y permisos. | Suscripciones suspendidas o vencidas conservan acceso operativo. | Aplicar `SubscriptionGuard` con estados permitidos explícitos. |
| SEC-03 | Crítica | Todas las rutas de Metrics usan exclusivamente `JwtAuthGuard`. | `MetricsController` no exige tenant, scope ni permisos. | Usuarios autenticados podrían consultar telemetría empresarial o global si un chequeo de servicio queda incompleto. | Separar métricas globales y tenant; exigir guards y permisos granulares. |
| SEC-04 | Crítica | La base permite relaciones cruzadas entre tenants. | `UserRole`, `UserPermission`, `UserBranchAccess` y varias tablas hijas no incluyen tenant en sus claves; FKs simples no verifican igualdad de tenant. | Una escritura defectuosa puede asignar rol, sucursal, usuario, curso o candidato de otro tenant. | Incorporar invariantes compuestas o validaciones transaccionales centralizadas y pruebas negativas. |
| SEC-05 | Alta | No existe protección contra fuerza bruta ni rate limiting. | No está instalado/configurado `@nestjs/throttler`; login, refresh, postulaciones y vacantes públicas no tienen límites. | Credential stuffing, abuso y consumo de recursos. | Rate limit distribuido por IP/identidad y límites más estrictos en autenticación. |
| SEC-06 | Alta | El JWT contiene identidad, tenants, sucursales, roles, permisos, módulos, nombres e impersonación completos. | `generateTokens` firma el `JwtPayload` hidratado completo tanto en access como refresh. | Tokens grandes, exposición innecesaria de metadatos y cookies/cabeceras sobredimensionadas. | Firmar solo `sub`, `sessionId`, `type`, `iat/jti`; rehidratar contexto como ya hace la estrategia. |
| SEC-07 | Alta | `loadUserByEmail` sin tenant usa `findFirst` y el correo solo es único por tenant. | Login acepta `tenantSlug` opcional. | Un mismo correo en varios tenants produce selección ambigua y comportamiento no determinista. | Exigir tenant slug cuando haya múltiples coincidencias o usar una identidad global separada. |
| SEC-08 | Alta | El contexto activo de sucursal se guarda también en `User.activeBranchId`. | `buildAuthorizedPayload` actualiza el usuario; las sesiones solo guardan tenant activo. | Dos sesiones del mismo usuario pueden sobrescribir la sucursal entre sí. | Guardar `activeBranchId` en `UserSession` y eliminar el estado de sesión del usuario. |
| SEC-09 | Alta | Los catálogos Training globales usan `tenantId` nullable y unicidad `[tenantId, slug]`. | PostgreSQL permite múltiples NULL en una restricción unique. | Duplicados globales ambiguos; las relaciones hijas no tienen tenant y requieren recorridos para verificar aislamiento. | Índice parcial para slugs globales y validación de pertenencia por cadena relacional. |
| SEC-10 | Alta | URLs de facturas, certificados y recursos se persisten y retornan sin capa de firma/expiración visible. | Campos `hostedInvoiceUrl`, `invoicePdfUrl`, `certificateUrl`, `fileUrl`, `resourceUrl`. | Acceso prolongado o público a documentos sensibles. | Guardar keys privadas y emitir URLs firmadas de corta duración. |
| API-01 | Alta | Falta el contrato canónico `GET /me/context`. | Existe `GET /auth/me`, con gran parte del contexto. | El frontend depende de una ruta específica y aún debe combinar capacidades. | Crear alias aditivo `/me/context` con usuario, tenant, sucursales, RBAC, plan, suscripción, flags, preferencias y menú. |
| API-02 | Alta | OpenAPI cubre solo una fracción de las rutas y no deriva de DTO/controladores. | `OpenApiService` contiene un objeto manual con unas 20 rutas. | Contratos incompletos y deriva documental. | Adoptar `@nestjs/swagger` o generar el documento desde metadata y DTO. |
| API-03 | Media | Respuestas de listas no son uniformes. | Algunas retornan `{data, meta}`, otras `{items, meta}` o arrays directos; `pageSize` difiere de `limit`. | Adaptadores repetidos y errores en frontend. | Introducir una convención en v2 o migración aditiva; no envolver todo globalmente de golpe. |
| API-04 | Media | Catálogos administrativos carecen de paginación. | Users, Roles, Permissions, Plans, Modules y Subscriptions usan `findMany` directo. | Payloads crecientes y consultas costosas. | Agregar paginación/filtros conservando temporalmente el contrato actual. |
| API-05 | Media | Alias dobles (`users`/`company/users`, etc.) duplican superficie. | Varios `@Controller` reciben dos prefijos. | Mantenimiento y documentación duplicados. | Declarar uno canónico y deprecar alias con telemetría. |
| API-06 | Media | Operaciones semánticas usan rutas o verbos poco claros. | `PATCH form-templates/:id/delete`, `PATCH :id/recompute`, body en `DELETE /training/favorites`. | Clientes/proxies y semántica REST inconsistentes. | Añadir rutas canónicas; mantener alias durante deprecación. |
| ARCH-01 | Alta | Servicios de dominio excesivamente grandes. | Cuatro servicios superan 1 200 líneas. | Alto acoplamiento, pruebas difíciles y riesgo de regresión. | Extraer casos de uso y policies por agregado, sin introducir repositorios vacíos. |
| ARCH-02 | Alta | Autorización se reparte entre guards y comprobaciones privadas de servicios. | Hay `AccessControlService`, guards y numerosos `assert*` locales. | Omisiones al agregar endpoints. | Crear una policy reutilizable que valide tenant, branch, módulo y recurso. |
| ARCH-03 | Media | Configuración no validada y acceso directo a `process.env`. | CORS, cookies, colas, branding y messaging leen variables directamente. | Fallos tardíos y configuraciones inseguras. | Esquema de configuración tipado y validado al arrancar. |
| DB-01 | Alta | No existen cuotas de plan estructuradas. | Plan/Subscription modelan módulos, no límites de usuarios, sucursales, vacantes, candidatos o almacenamiento. | No se pueden hacer cumplir los límites comerciales en backend. | Modelo `PlanLimit` + override por tenant + servicio atómico de consumo. |
| DB-02 | Alta | Cascadas desde Tenant eliminan prácticamente toda la historia operativa. | Muchas relaciones usan `onDelete: Cascade`. | Eliminación irreversible y pérdida de auditoría. | Suspensión/soft delete para tenant; `Restrict` en datos regulados; política de retención. |
| DB-03 | Media | Hay campos de refresh heredados en User además de UserSession. | `User.refreshTokenHash` y `UserSession.refreshTokenHash`. | Fuente de verdad ambigua. | Migrar/eliminar el campo de User cuando se confirme que no tiene consumidores. |
| PERF-01 | Alta | Cada request autenticado carga un grafo amplio y vuelve a consultar capacidades. | `authorizedUserInclude` trae roles, permisos, branches, tenants y sesiones; luego consulta tenant/capabilities. | Latencia y carga DB proporcional a permisos/sucursales por cada llamada. | Cache breve versionada por usuario/tenant; query mínima de sesión y carga paralela selectiva. |
| PERF-02 | Media | `SubscriptionGuard` carga plan+módulos y luego `getTenantCapabilities` vuelve a consultar suscripción. | Dos lecturas solapadas por request protegido. | Consultas duplicadas. | Construir capacidades desde la primera consulta o cachearlas. |
| PERF-03 | Media | Training pagina algunos resultados en memoria. | `listAssignments` calcula slice después de construir resultados. | Consumo creciente de memoria/CPU. | Expresar orden/filtros en SQL o materializar vista de lectura. |
| OBS-01 | Media | Logs son JSON serializado sobre Logger, sin redacción central ni exporter. | Middlewares y filtro construyen strings JSON. | Búsqueda y correlación limitadas; riesgo de registrar URLs con query sensible. | Logger estructurado, sanitización y OpenTelemetry. |
| TEST-01 | Crítica | No hay unit/integration/E2E test runner configurado. | `package.json` solo expone scripts de integración manuales; no hay `*.spec.ts`. | No existe barrera automática contra fugas multi-tenant o regresiones RBAC. | Configurar Jest/Supertest y una matriz de aislamiento. |

## Auditoría de arquitectura

La organización por módulo NestJS es apropiada y los controladores contienen poca lógica de negocio. Prisma se usa directamente desde servicios; no es necesario introducir repositorios genéricos, pero sí conviene extraer puertos en integraciones y casos de uso en los cuatro servicios más grandes.

`AuthContextService` es una buena pieza central, aunque mezcla carga de identidad, resolución de tenant, persistencia de sucursal, capacidades, serialización frontend y estado de suscripción. Debe separarse en `SessionContextLoader`, `EffectiveAccessPolicy` y `FrontendContextAssembler`.

Outbox, idempotencia, tracking de integración, DLQ y abstracción BullMQ/RabbitMQ son una base adecuada para procesos pesados. Debe evitarse que servicios HTTP ejecuten trabajo pesado de documentos, reportes, videos, certificados, importaciones o emails de forma síncrona cuando esos módulos se implementen.

## Auditoría multi-tenant y RBAC

El flujo nominal es JWT -> rehidratación de sesión -> TenantGuard -> Subscription/Scope/Branch/Permission. Este orden es correcto cuando todos los guards están presentes. `TenantGuard` no confía ciegamente en `x-tenant-id`; resuelve el tenant contra el contexto autorizado. `BranchAccessGuard` valida que la sucursal pertenezca al tenant y al conjunto permitido. Los servicios principales filtran por tenant antes de mutar recursos.

El problema es que el pipeline no es obligatorio globalmente y cada controlador selecciona guards manualmente. Debe existir una policy declarativa por ruta que falle de forma cerrada. También faltan permisos de negocio más finos: hoy acciones como publicar vacantes, cambiar estados, programar entrevistas, asignar activos o gestionar workflows reutilizan permisos CRUD amplios (`vacancies.update`, `applications.update`, `employees.update`).

Permisos recomendados: `vacancies.publish`, `applications.change_status`, `interviews.schedule`, `workflows.manage`, `documents.sign`, `inventory.assign`, `inventory.recover`, `training.assign`, `training.attempt`, `metrics.view_tenant`, `metrics.view_platform`, `notifications.send`, `impersonation.start`.

## Auditoría de base de datos

La mayoría de tablas operativas principales incluyen `tenantId`, y los recursos de workflow incluyen `branchId`. Hay índices útiles para filtros frecuentes. Sin embargo, tablas hijas como timeline, steps, quiz questions/options/answers y attendances obtienen tenant por relación. Esto es aceptable solo si todas las consultas recorren y verifican la relación; para recursos expuestos directamente por ID, se recomienda tenant denormalizado o una constraint compuesta.

No hay soft delete sistemático ni historial genérico de estados; workflows y application timeline sí conservan historia parcial. La eliminación de tenants, usuarios y catálogos usa cascadas extensas. Debe definirse retención legal y evitar DELETE físico en tenants desde API.

Para concurrencia, las transacciones existentes cubren varios workflows, pero las cuotas, stock, intentos de quiz, cambios de estado e idempotencia deben usar actualizaciones condicionales/versiones. Las claves compuestas actuales reducen duplicados, aunque no garantizan consistencia cross-tenant.

## Contratos y compatibilidad

No se recomienda imponer ahora un interceptor global `{data, meta, error}` porque rompería todos los consumidores. La migración segura es:

1. Mantener respuestas de detalle existentes.
2. Normalizar listas nuevas a `{ data: [], meta: { page, pageSize, total, totalPages } }`.
3. Aceptar temporalmente `limit` como alias de `pageSize` si el frontend lo usa.
4. Versionar o deprecar las listas antiguas mediante headers y OpenAPI.
5. Mantener el error ya estandarizado como `{ error: { code, message, requestId, ... } }`.

Los cambios que más afectan al frontend son activar restricciones de módulo/suscripción (nuevos 403 con códigos explícitos), paginar catálogos hoy devueltos como arrays, retirar alias y reducir campos. Deben hacerse con telemetría y ventana de deprecación.

## Rendimiento y consultas a optimizar

1. Rehidratación JWT: cargar primero sesión+usuario mínimo; cachear access context por versión durante 30-60 segundos e invalidar al cambiar roles, flags, tenant o sesión.
2. SubscriptionGuard: eliminar la segunda consulta de capabilities.
3. Users/Roles/Permissions/Plans/Modules/Subscriptions: paginación server-side y `select` explícito.
4. Metrics: sustituir agregaciones grandes en memoria por SQL/groupBy o snapshots, con rangos máximos.
5. Training: paginar asignaciones antes de enriquecer resultados y precalcular analytics mediante jobs.
6. Workflows/Automation: separar read models para master card, timeline y blockers; conservar transacciones para comandos.
7. Búsquedas `contains` case-insensitive: evaluar trigram/GIN en PostgreSQL para datasets grandes.
8. Outbox: mantener claim condicional y añadir métricas de lag, retries y DLQ por tenant sin payload sensible.

No se recomienda ETag en comandos; puede ser útil en catálogos de módulos, permisos y capacidades. La compresión debe habilitarse en proxy/Nginx para JSON. El caché nunca debe compartir claves sin tenant y versión de permisos.

## Observabilidad

Ya existe `requestId`, header expuesto, audit middleware, activity interceptor, health endpoint y métricas de colas. Faltan readiness detallado de PostgreSQL/Redis/RabbitMQ, histogramas de latencia, tracing distribuido, alertas, redacción de query strings y una taxonomía estable de acciones auditables. El health público no debe revelar versiones, secretos ni topología interna.

## Plan de implementación

### Lote 0: barrera de seguridad y pruebas

- Configurar unit/integration/E2E y fixtures multi-tenant.
- Crear matriz automatizada de guards por endpoint.
- Añadir rate limiting a login, refresh y rutas públicas.
- Reducir JWT y mover active branch a sesión.

### Lote 1: autorización SaaS

- Aplicar SubscriptionGuard y ModuleAccessGuard a todas las familias operativas.
- Proteger Metrics con permisos y scopes explícitos.
- Introducir permisos granulares sin retirar inmediatamente los antiguos.
- Crear `GET /me/context` aditivo.

### Lote 2: invariantes de datos

- Migraciones para impedir relaciones cross-tenant.
- Soft delete/restrict para tenants y datos regulados.
- Índices parciales para catálogos globales Training.
- Modelo de límites y consumo transaccional.

### Lote 3: contratos y eficiencia

- OpenAPI derivado de DTO.
- Paginación de catálogos y respuestas consistentes.
- Cache de access context/capabilities con invalidación.
- Read models y jobs para métricas/training/reportes.

### Lote 4: modularización

- Dividir Workflows, Metrics, Automation y Training por comandos, queries y policies.
- Formalizar puertos de documentos, firmas, almacenamiento, email y billing.

## Pruebas obligatorias recomendadas

- Tenant A no puede leer, actualizar, borrar ni relacionar IDs de tenant B.
- Un branch user no puede enviar `x-branch-id` distinto al contexto activo.
- Una sesión revocada no autentica aunque el access token no haya expirado.
- Reutilizar un refresh token rota y revoca las sesiones afectadas.
- Usuario suspendido, tenant suspendido y suscripción expirada quedan bloqueados.
- Tenant sin ATS no accede a vacancies/applications; sin Training no accede a training.
- Permiso CRUD amplio no concede publicar, firmar, asignar activos ni ver métricas globales.
- Plataforma solo cambia a tenants asignados; impersonación requiere razón y queda auditada.
- Dos sesiones mantienen tenant y branch activos independientes.
- Cuotas concurrentes no exceden el límite.
- Recursos/URLs privados expiran y no son reutilizables fuera del usuario autorizado.

## Riesgos pendientes

- No se ejecutaron pruebas de carga ni `EXPLAIN ANALYZE`; las conclusiones de rendimiento son estáticas.
- No se auditó un frontend consumidor, por lo que el uso real de campos y alias requiere telemetría o revisión conjunta.
- Stripe, S3/R2, firma electrónica y correo aún no aparecen como integraciones completas; deben auditarse cuando se implementen.
- Los cambios locales preexistentes dificultan atribuir regresiones; conviene estabilizar una rama antes de migraciones estructurales.

## Primer lote implementado después de la auditoría

- Se agregó el endpoint aditivo `GET /api/me/context`; `GET /api/auth/me` continúa disponible.
- El contexto retorna usuario, tenant, sucursales permitidas/activa, roles, permisos, plan, suscripción, módulos, feature flags, preferencias e información de menú.
- Los access y refresh tokens nuevos contienen solo `sub`, `sessionId` y `tokenType`, además de claims temporales estándar. El contexto autorizado continúa rehidratándose desde base de datos.
- Se verifica el tipo de token para impedir usar un refresh token como access token o viceversa.
- Vacancies y Applications ahora exigen suscripción válida y módulo ATS.
- Branches y Employees ahora exigen suscripción válida.
- Se actualizó el OpenAPI manual con `/me/context`; la migración a OpenAPI derivado sigue pendiente.

Validación ejecutada: `npm run build`, `npx tsc --noEmit`, `npx prisma validate` y `git diff --check`, todas correctas. `npx prisma migrate status` no pudo completar por un `Schema engine error` al conectar al PostgreSQL local. No hay scripts de lint ni suite de pruebas automatizada configurados en el proyecto.
