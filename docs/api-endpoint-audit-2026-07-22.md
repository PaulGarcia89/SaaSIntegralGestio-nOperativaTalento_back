# Inventario y auditoría de endpoints

Fecha: 2026-07-22. Todas las rutas usan el prefijo `/api`, salvo `/health`.

Leyenda: C=crítica, A=alta, M=media, B=baja. El riesgo de compatibilidad indica el efecto de aplicar la recomendación, no el riesgo actual.

## Auth y contexto

| Método y ruta | Propósito | Problema / impacto | Recomendación | Compat. | Prioridad |
|---|---|---|---|---|---|
| POST `/auth/login` | Autenticar y crear sesión | Sin rate limit; tenant opcional ambiguo | Throttling y resolver colisiones de email | Baja | C |
| POST `/auth/refresh` | Rotar tokens | JWT refresh sobredimensionado | Token mínimo con tipo/jti | Baja | A |
| GET `/auth/me` | Contexto frontend | Ruta distinta a la requerida; contexto parcial | Mantener y agregar `/me/context` | Baja | A |
| PUT `/auth/context/branch` | Cambiar sucursal | Estado compartido en User entre sesiones | Persistir branch en UserSession | Media | A |
| PUT `/auth/context/tenant` | Cambiar tenant | Solo PLATFORM_ADMIN; correcto, pero no retorna tokens nuevos | Documentar rehidratación por request | Baja | M |
| POST `/auth/impersonation/start` | Iniciar impersonación | Requiere motivo, pero falta rate limit/alerta | Alerta y auditoría reforzada | Baja | A |
| POST `/auth/impersonation/stop` | Terminar impersonación | Sin problema funcional crítico | Conservar | Baja | B |
| GET `/auth/sessions` | Listar sesiones | Expone IP completa al usuario | Evaluar enmascarado | Baja | M |
| POST `/auth/logout` | Revocar sesión actual | Correcto | Conservar | Baja | B |
| DELETE `/auth/sessions/:sessionId` | Revocar otra sesión | Correcto, pertenencia validada | Conservar y auditar | Baja | B |

## Plataforma y administración

| Método y ruta(s) | Propósito | Problema / impacto | Recomendación | Compat. | Prioridad |
|---|---|---|---|---|---|
| POST/GET `/tenants`, `/admin/tenants`; GET/PATCH/DELETE `/:id` | CRUD tenants | DELETE físico con cascadas; listas sin paginar | Suspender/soft-delete y paginar | Alta | C |
| POST/GET `/plans`, `/admin/plans`; GET/PATCH/DELETE `/:id` | CRUD planes | Sin paginación ni cuotas | Plan limits y paginación | Media | A |
| POST/GET `/modules`, `/admin/modules`; GET/PATCH/DELETE `/:id` | Catálogo de módulos | OpenAPI parcial; borrar puede afectar planes | Restrict y documentar dependencias | Media | A |
| POST/GET `/subscriptions`, `/admin/subscriptions`; GET/PATCH/DELETE `/:id` | Suscripciones | DELETE elimina control comercial; sin webhooks Stripe | Cancelar, no borrar; idempotencia webhook | Alta | C |
| GET `/feature-flags` | Flags del tenant | Bien filtrado; respuesta no cacheada | ETag/cache por tenant | Baja | M |
| PUT `/feature-flags/:moduleCode` | Override de módulo | Reutiliza permiso modules.update | Permiso `feature_flags.manage` | Media | A |
| GET `/companies/current` y `/company/settings` | Perfil del tenant | Alias duplicados | Elegir canónico y deprecar | Media | M |
| GET `/companies/current/capabilities` y alias | Capacidades | Duplica datos de auth/me | Integrar en `/me/context`, cachear | Baja | A |
| PATCH `/companies/current` y `/company/settings` | Ajustes | DTO mass-assignment mitigado por whitelist | Conservar y auditar campos sensibles | Baja | M |
| GET `/permissions`, `/company/permissions` | Catálogo permisos | Sin paginación | Paginación/búsqueda | Media | M |
| POST/GET `/roles`, `/company/roles`; GET/PATCH/DELETE `/:id` | CRUD roles | Riesgo relacional cross-tenant | Validación/constraints compuestas | Media | C |
| POST/GET `/users`, `/company/users`; GET/PATCH/DELETE `/:id` | CRUD usuarios | Lista sin paginar; relaciones cross-tenant posibles | Paginar y policy transaccional | Media | C |

## Sucursales, empleados y reclutamiento

| Método y ruta(s) | Propósito | Problema / impacto | Recomendación | Compat. | Prioridad |
|---|---|---|---|---|---|
| POST/GET `/branches`, `/company/branches`; GET/PATCH/DELETE `/:id` | CRUD sucursales | Sin SubscriptionGuard; DELETE cascada | Guard de suscripción y archivado | Media | C |
| POST `/employees` | Crear empleado | Sin SubscriptionGuard ni ModuleAccess | ONBOARDING/HR policy y cuota | Media | C |
| GET `/employees` | Listar empleados | Paginado, pero módulo/suscripción omitidos | Guards; conservar filtros | Media | C |
| GET/PATCH `/employees/:id` | Leer/editar empleado | Branch guard existe; falta suscripción/módulo | Guards y constraint tenant | Media | C |
| PATCH `/employees/:id/status` | Cambiar estado | Permiso CRUD demasiado amplio | `employees.change_status` | Media | A |
| GET `/employees/:id/history` | Historial | Correcto en scope; puede crecer | Paginación cursor | Media | M |
| POST `/employees/:id/transfer` | Transferir | Requiere consistencia transaccional de branches | Mantener transacción y constraint | Baja | A |
| POST `/employees/:id/assignments` | Asignar branch | Cross-tenant posible a nivel DB | FK/validación compuesta | Baja | C |
| POST `/vacancies` | Crear vacante | Sin suscripción ni ATS guard | Guards, cuota e idempotencia opcional | Media | C |
| GET `/vacancies` | Listar vacantes | Buena paginación; falta guard de plan | ATS+Subscription | Media | C |
| GET/POST `/vacancies/form-templates` | Listar/crear plantillas | Lista no paginada; esquema JSON | Validar versión/esquema y paginar | Media | A |
| PATCH `/vacancies/form-templates/:id/delete` | Borrar plantilla | Verbo/ruta engañosos | Añadir DELETE o archive y deprecar | Media | M |
| GET/PATCH `/vacancies/:id` | Leer/editar vacante | Falta guard de plan/suscripción | Guards y permiso publish separado | Media | C |
| GET `/public/vacancies` | Catálogo público | Sin rate limit; requiere tenant/publicación inequívocos | Throttle, cache y slug tenant | Baja | A |
| GET `/public/vacancies/:id` | Detalle público | ID enumerables; filtrar solo publicada | Mantener filtro y rate limit | Baja | A |
| POST `/public/vacancies/:vacancyId/applications` | Postular | Sin rate limit/idempotencia/antispam | Throttle, captcha/risk y clave idempotente | Media | C |
| GET `/applications` | Lista tenant | Sin Subscription/ATS guard | Guards; filtros ya presentes | Media | C |
| GET `/applications/branch` | Lista sucursal | Duplica ruta tenant con branch | Unificar con scope/filtro a futuro | Media | M |
| GET `/applications/:id`, `/applications/branch/:id` | Detalle | Superficie duplicada | Mantener temporalmente; unificar policy | Media | M |
| PATCH `/applications/:id/status`, `/applications/branch/:id/status` | Estado | Permiso CRUD amplio; idempotencia de transición | `applications.change_status`, state machine | Media | A |

## Training

Todas las rutas de esta sección validan tenant y, salvo module-access, usan SubscriptionGuard + TrainingAccessGuard + PermissionGuard.

| Método y ruta | Propósito | Problema / impacto | Recomendación | Compat. | Prioridad |
|---|---|---|---|---|---|
| GET `/training/module-access` | Diagnóstico de acceso | Solo TenantGuard; puede revelar estado | Limitar payload y mantener como preflight | Baja | M |
| GET `/training/overview` | Dashboard | Puede agregar demasiado por request | Read model/cache | Baja | M |
| GET `/training/assignments` | Asignaciones | Paginación parcialmente en memoria | Paginar en SQL | Baja | A |
| GET `/training/catalog` | Catálogo | `sort` acepta string libre | Enum estricto y query SQL | Baja | M |
| GET `/training/library` | Biblioteca | URLs potencialmente públicas | URLs firmadas | Media | A |
| GET `/training/events` | Eventos | Sin paginación | Paginar/rango máximo | Media | M |
| GET `/training/analytics` | Analítica | Cálculo costoso síncrono | Snapshot/job | Baja | A |
| GET `/training/courses/:courseId` | Curso | Hijos sin tenant directo | Verificar cadena de pertenencia | Baja | C |
| GET `/training/curriculums/:curriculumId` | Curriculum | Catálogo global/tenant ambiguo | Policy global+tenant explícita | Baja | A |
| POST/DELETE `/training/favorites` | Favoritos | DELETE con body y constraints nullable | DELETE por tipo/id; mantener alias | Media | M |
| PATCH `/training/progress/course/:courseId` | Progreso curso | Cliente controla porcentaje | Derivar progreso de pasos/eventos | Media | A |
| PATCH `/training/progress/step/:stepId` | Progreso paso | Step no tiene tenant directo | Verificar curso tenant/global | Baja | C |
| POST `/training/quizzes/:quizId/attempts` | Iniciar intento | Concurrencia/max attempts | Transacción/constraint condicional | Baja | A |
| POST `/training/quizzes/:quizId/attempts/:attemptId/answers` | Responder | Debe comprobar intento, quiz, user y tenant | Policy compuesta e idempotencia | Baja | C |
| POST `/training/quizzes/:quizId/attempts/:attemptId/submit` | Enviar quiz | Riesgo doble submit | Update condicional IN_PROGRESS | Baja | A |
| GET `/training/certificates` | Certificados | URL sensible persistente | URL firmada de corta vida | Media | A |

## Workflows, automatización y eventos

| Método y ruta(s) | Propósito | Problema / impacto | Recomendación | Compat. | Prioridad |
|---|---|---|---|---|---|
| POST `/workflows/hiring` | Crear flujo de contratación | Módulo no validado; permiso amplio | ATS+ONBOARDING policy e idempotencia | Media | C |
| POST `/workflows/branch-transfer`, `/offboarding` | Crear flujos laborales | Módulo no validado | Policy por tipo y branch | Media | C |
| GET `/workflows` | Listar workflows | Paginado; sin ModuleAccess | Módulo según tipo o core | Media | A |
| GET `/workflows/:employeeId/current` | Actual por empleado | Puede confundirse con `/:id` | Ruta `/employees/:id/current-workflow` aditiva | Media | M |
| GET `/workflows/:id` | Detalle | Payload potencialmente grande | `include` selectivo/expand | Media | M |
| GET `/workflows/:id/master-card` | Vista agregada | Útil para reducir llamadas; costosa | Read model/cache | Baja | A |
| GET `/workflows/:id/timeline` | Timeline | Sin paginación | Cursor | Media | M |
| GET `/workflows/:id/blockers` | Bloqueos | Correcto como agregado | Conservar | Baja | B |
| POST `/workflows/:id/events` | Agregar evento | Requiere idempotencia | Idempotency-Key | Baja | A |
| PATCH `/workflows/:id/steps/:stepKey/start`, `/complete` | Transiciones | Permiso genérico y posible doble ejecución | State machine + update condicional | Baja | A |
| POST `/workflows/:id/complete-onboarding`, `/complete-signature`, `/assign-asset`, `/activate-training`, `/provision-access`, `/recover-asset`, `/close-access`, `/archive-record` | Acciones de dominio | Permisos reutilizados y módulos no declarados | Permisos/módulos por acción; idempotencia | Media | C |
| PATCH `/workflows/:id/recompute` | Recalcular | Puede ser pesado/síncrono | Job idempotente + 202 | Media | A |
| PATCH `/workflow-steps/:id/status`, `/progress` | Mutar paso por ID | Hijo expuesto sin tenant en clave | Policy relacional y permiso granular | Baja | C |
| GET `/workflow-master`, `/:employeeId` | Vista maestra | Buen agregado; posible solapamiento con workflows | Consolidar read model y cache | Media | M |
| GET/POST/PATCH `/automation/rules...` | Reglas | JSON de condiciones/consecuencias requiere validación profunda | Versionar schema y branch policy | Baja | A |
| GET `/automation/executions`, `/:id`, `/audit` | Ejecuciones/auditoría | Payloads y retención pueden crecer | Paginación ya presente; retention/cursor | Baja | M |
| POST `/domain-events/candidate-hired`, `/branch-changed`, `/offboarding-started`, `/onboarding-completed`, `/asset-assigned`, `/training-completed`, `/operation-handoff-completed`, `/compliance-closed` | Ingresar eventos | Una API genérica expone eventos internos; ModuleAccess ausente | Idempotencia obligatoria, policies por evento o internal-only | Media | C |

## Billing, notificaciones, auditoría, métricas y salud

| Método y ruta(s) | Propósito | Problema / impacto | Recomendación | Compat. | Prioridad |
|---|---|---|---|---|---|
| GET `/billing/overview`, `/invoices` | Billing tenant | SubscriptionGuard puede bloquear al tenant que necesita pagar | Permitir PAST_DUE/SUSPENDED en rutas de recuperación | Baja | A |
| PUT `/billing/customer` | Cliente billing | No hay integración Stripe/idempotencia visible | Adaptador provider + idempotencia | Baja | A |
| GET `/notifications` | Listar | Permiso `users.read` no representa lectura propia | `notifications.read`; scope user por defecto | Media | A |
| POST `/notifications` | Crear/enviar | `users.update` demasiado amplio | `notifications.send`, jobs | Media | A |
| PATCH `/notifications/:id/read` | Marcar leída | Usa `users.read`; validar owner | `notifications.update_own` | Media | A |
| GET `/audit/logs`, `/company/audit-logs` | Auditoría | Permiso tenants.read demasiado amplio | `audit.read`; retención/export job | Media | A |
| GET `/metrics/tenant-activity`, `/active-tenants`, `/active-users-by-tenant`, `/last-access-by-tenant`, `/login-activity` | Métricas tenant/plataforma | Solo JWT; query strings sin DTO | Guards, permisos, DTO y límites de rango | Media | C |
| GET `/metrics/active-branches`, `/active-users-by-branch`, `/last-access-by-branch`, `/branch-request-activity` | Métricas branch | Solo JWT; tenant/branch enviados libremente | Resolver desde contexto autorizado | Media | C |
| GET `/metrics/queue-overview`, `/dead-letter`, `/throughput-by-domain`, `/queue-errors-by-tenant` | Operación de colas | Datos globales sensibles con solo JWT | GlobalOnly + `metrics.view_platform` | Media | C |
| GET `/openapi.json` | Contrato API | Manual e incompleto; security global incluye rutas públicas | Generación Swagger y security por operación | Baja | A |
| GET `/health` | Liveness | No distingue readiness ni dependencias | `/health/live` y `/health/ready` sanitizados | Baja | M |

## Cambios de contrato que requieren coordinación frontend

- Nuevos 403 `MODULE_NOT_ENABLED` y `SUBSCRIPTION_BLOCKED` al activar guards.
- Paginación de arrays administrativos y timelines.
- Ruta canónica `/me/context`; `/auth/me` debe mantenerse durante la migración.
- Permisos granulares nuevos deben coexistir temporalmente con permisos CRUD existentes.
- URLs de archivos pasarían a ser temporales y no deberían persistirse en caché del navegador.
- Alias `/company/*` y `/admin/*` requieren deprecación medible antes de retirarse.
