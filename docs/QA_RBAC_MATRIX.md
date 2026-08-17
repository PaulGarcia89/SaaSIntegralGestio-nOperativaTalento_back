# Matriz RBAC, tenant, sucursal y ownership

Fecha: **2026-08-13**

## Convenciones

- `Global`: SUPERADMIN/PLATFORM_ADMIN bajo el scope exigido.
- `Tenant admin`: rol tenant-wide con el permiso indicado.
- `Branch role`: BRANCH_ADMIN, HR_MANAGER, SUPERVISOR, BRANCH_USER o INVENTORY_MANAGER según su catálogo efectivo.
- `Owner`: sólo el usuario/candidato propietario.
- `T`: consulta ligada a tenant; `B`: ligada a sucursal autorizada; `O`: ligada al owner; `M`: requiere módulo contratado.
- PASS estático significa que controller/guard/servicio componen el filtro; PASS test significa que también existe evidencia automatizada ejecutada.

## Matriz completa por familia de recurso y acción

| Recurso | Acción | Permiso | Rol | Tenant | Branch | Owner | Resultado |
|---|---|---|---|---|---|---|---|
| Sesión | Login | Público + credenciales | Usuario activo | Derivado | Derivado | Sí | PASS estático |
| Sesión | Refresh | Refresh token vigente | Usuario/sesión | Derivado | Derivado | Sí | PASS test |
| Sesión | Leer/revocar sesiones | JWT | Usuario | T | N/A | Sí | PASS estático |
| Contexto | Leer `/me/context` | JWT | Cualquiera | T | B | O | PASS test |
| Contexto | Cambiar tenant | `platform.tenant.switch` | Global | Permitido | N/A | N/A | PASS estático |
| Contexto | Impersonar tenant | `platform.tenant.impersonate` | SUPERADMIN | Objetivo | N/A | N/A | PASS estático |
| Tenants | Listar/leer | `tenants.read` | Global/tenant según ruta | T/permitidos | N/A | N/A | PASS estático |
| Tenants | Crear | `tenants.create` | Global | Global | N/A | N/A | PASS estático |
| Tenants | Actualizar | `tenants.update` | Global/Tenant admin | T | N/A | N/A | PASS estático |
| Tenants | Eliminar | `tenants.delete` | Global | Global | N/A | N/A | PASS estático |
| Sucursales | Listar/leer | `branches.read` | Tenant/branch role | T | B para scope branch | N/A | PASS test |
| Sucursales | Crear | `branches.create` | Tenant admin | T | Tenant-wide | N/A | PASS estático |
| Sucursales | Actualizar/eliminar | `branches.update/delete` | Tenant admin o autorizado | T | B | N/A | PASS test |
| Usuarios tenant | Listar/leer | `users.read` | Tenant/HR/branch según rol | T | N/A | N/A | PASS estático; exposición branch depende del diseño tenant-wide |
| Usuarios tenant | Crear/actualizar/eliminar | `users.create/update/delete` | Tenant admin | T | Asignaciones validadas | N/A | PASS estático |
| Usuarios global | Listar | `users.read` + global | SUPERADMIN/PLATFORM_ADMIN | Permitidos | N/A | N/A | PASS estático |
| Roles | Listar/leer | `roles.read` | Global/Tenant admin | T/scope | N/A | N/A | PASS estático |
| Roles | Crear/actualizar/eliminar | `roles.create/update/delete` | Global/Tenant admin | T | N/A | N/A | PASS test para no otorgar permisos ajenos |
| Permisos | Listar | `permissions.read` | Global/Tenant admin | Catálogo permitido | N/A | N/A | PASS estático |
| Planes | Leer | `plans.read` | Global/roles con lectura | Scope de ruta | N/A | N/A | PASS estático |
| Planes | Crear/actualizar/eliminar | `plans.create/update/delete` | Global | Global | N/A | N/A | PASS estático |
| Módulos | Leer | `modules.read` | Global/roles con lectura | Scope de ruta | N/A | N/A | PASS estático |
| Módulos | Crear/actualizar/eliminar | `modules.create/update/delete` | Global | Global | N/A | N/A | PASS estático |
| Suscripciones | Leer | `subscriptions.read` | Global/Tenant admin | T/scope | N/A | N/A | PASS estático |
| Suscripciones | Crear/actualizar/eliminar | `subscriptions.create/update/delete` | Gobierno autorizado | T/scope | N/A | N/A | PASS estático |
| Vacantes | Listar/leer | `vacancies.read` + ATS | HR/Tenant/branch role | T | B para scope branch | N/A | FAIL gate: expectativa branch desactualizada; revisar E2E |
| Vacantes | Crear | `vacancies.create` + ATS | HR/Tenant admin | T | B | N/A | PASS test |
| Vacantes | Actualizar/eliminar | `vacancies.update/delete` + ATS | HR/Tenant admin | T | B | N/A | PASS estático/test parcial |
| Vacantes públicas | Leer abiertas | Público | Anónimo | Derivado de vacante | B de vacante | N/A | PASS estático |
| Postulaciones | Crear pública | Público + ATS | Candidato | Derivado de vacante | B de vacante | O por identidad/datos | PASS estático |
| Postulaciones | Listar/leer | `applications.read` + ATS | HR/Tenant/branch | T | B | O para candidato | PASS test |
| Postulaciones | Actualizar etapa/estado | `applications.update` + ATS | HR/Tenant/branch autorizado | T | B | No | PASS test parcial |
| Postulaciones | Bulk update | `applications.bulk_update` + ATS | HR/Tenant autorizado | T | B para todos | No | PASS test rollback cross-tenant |
| Postulaciones | Eliminar | `applications.delete` + ATS | HR/Tenant autorizado | T | B | No | PASS estático |
| Postulaciones | Exportar | `applications.export` | HR/Tenant autorizado | T | B | No | PASS estático; falta E2E dedicado |
| Currículos ATS | Solicitar enlace | `applications.files.read` | HR/Tenant/branch | T | B | Candidato propio en portal | PASS estático |
| Currículos ATS | Descargar firmado | Token HMAC vigente | Portador del enlace | Implícito al emitir | Implícito | Implícito | PASS con riesgo bearer LOW |
| Imágenes de vacante | Subir/reemplazar | `vacancies.update` + ATS | HR/Tenant autorizado | T | B | N/A | PASS estático |
| Ofertas | Listar/crear/revisar | `applications.read/update` | HR/Tenant/branch | T | B | N/A | PASS estático |
| Ofertas | Descargar PDF staff | `applications.read` | HR/Tenant/branch | T | B | N/A | PASS estático |
| Ofertas | Ver/descargar/responder | Candidate JWT | Candidato | Derivado | Derivado | O | PASS estático |
| Entrevistas | Programar/actualizar | `applications.update` + ATS | HR/interviewer autorizado | T | B | Asignación interviewer | PASS test |
| Scorecards | Leer/evaluar/aprobar | `applications.read/update` | Interviewer/manager/admin | T | B | Asignado/manager | PASS estático |
| Conversión a empleado | Contratar | `applications.update` + ATS | HR/Tenant/branch | T | B | N/A | FAIL de test por mock; flujo serializable revisado |
| Empleados | Listar/leer | `employees.read` | Tenant/branch/supervisor | T | B | O para empleado simple | PASS test |
| Empleados | Crear/actualizar/eliminar | `employees.create/update/delete` | Tenant/branch autorizado | T | B | O cuando corresponde | PASS test parcial |
| Onboarding | Leer flujos/tareas | permisos de workflow/empleado | Tenant/branch/candidato | T | B | O para portal | PASS estático |
| Onboarding | Crear/actualizar/completar | permiso declarado | Tenant/branch/owner según tarea | T | B | O según ownerType | PASS estático |
| Documentos empleado | Subir/reemplazar/eliminar | permiso onboarding | Tenant/branch/owner | T | B | O según tarea | PASS estático; validación de contenido mejorable |
| Training | Leer cursos/asignaciones | `training.read`/`training.course.read` + M | Tenant/branch/learner | T | B/policy propia | O en progreso | PASS estático/test parcial |
| Training | Administrar cursos | permisos `training.course.*` + M | Admin/formación | T | Según asignación | N/A | PASS estático |
| Training | Asignar/calificar/certificar | permisos granulares + M | Admin/instructor | T | B/policy propia | O cuando aplica | PASS estático/test parcial |
| Training | Exportar reportes | `training.reports.export` + M | Admin autorizado | T | Scope propio | N/A | PASS estático; falta E2E cross-tenant |
| Inventario | Leer contexto/catálogo | `inventory.read` + M | Tenant/Inventory/branch | T | No en contexto | N/A | FAIL branch (HIGH) |
| Inventario | Leer activos/almacén/analytics | `inventory.read` + M | Tenant/Inventory/branch | T | **No valida allowedBranchIds** | N/A | FAIL branch (HIGH) |
| Inventario | Administrar activos/stock/PO | `inventory.manage` + M | Tenant/Inventory manager | T | **No valida actor** | N/A | FAIL branch (HIGH) |
| Inventario | Exportar movimientos | `inventory.read` + M | Tenant/Inventory manager | T | **branchId manipulable** | N/A | FAIL branch (HIGH) |
| Inventario | Descargar evidencia | `inventory.read` + M | Tenant/Inventory manager | T | **No valida actor** | N/A | FAIL branch (HIGH) |
| Inventario | Ver mis activos | `inventory.read` + M | Empleado | T | Derivada | O por email/empleado | PASS estático |
| Productividad | Leer overview/cámaras/alertas | `productivity.view` + M | Tenant/branch | T | **branchId manipulable** | N/A | FAIL branch (HIGH) |
| Productividad | Crear cámara/zona/regla | `productivity.manage` + M | Tenant/branch | T | **Sólo pertenencia tenant** | N/A | FAIL branch (HIGH) |
| Productividad | Actualizar alerta | `productivity.manage` + M | Tenant/branch | T | **No valida allowedBranchIds** | N/A | FAIL branch (HIGH) |
| Productividad | Ingestar evento | Service key | Servicio interno | Derivado de cámara | Derivado | N/A | PASS estático; requiere rotación de key |
| Reportes | Overview | `metrics.read` | Global/Tenant/branch | T/Global | B | N/A | PASS estático |
| Reportes | Exportar CSV | `applications.export` | Global/Tenant/branch | T/Global | B | N/A | PASS estático |
| Analítica ATS | Leer | `applications.read` | Tenant/HR/branch | T | B según servicio | N/A | PASS estático; suite unitaria actualmente rota |
| Analítica ATS | Exportar | `applications.export` | Tenant/HR/branch | T | B según servicio | N/A | PASS estático; falta E2E |
| Notificaciones | Leer/actualizar propias | `notifications.read_own/update_own` | Usuario | T | N/A | O | PASS estático |
| Notificaciones | Enviar | `notifications.send` | Admin autorizado | T | Según destino | N/A | PASS estático parcial |
| Automatizaciones | Leer/crear/actualizar | `automation.*` | Tenant admin autorizado | T | Scope de regla | N/A | PASS estático; suite unitaria rota |
| Eventos de dominio | Emitir | `domain_events.create` + permiso de evento | Servicio/actor autorizado | T | Validación por evento | N/A | PASS estático/test cross-tenant |
| Workflows | Leer/administrar | permisos workflow/aplicación | Tenant/branch autorizado | T | B en servicio | Owner en tareas | PASS estático parcial |
| Auditoría | Leer | `audit.read` | Admin/auditor | T | Según filtro | N/A | PASS estático |
| Métricas | Leer | `metrics.read`/`metrics.operations.read` | Global/Tenant autorizado | T/Global | Según operación | N/A | PASS estático parcial |
| Feature flags | Leer/administrar | permiso administrativo | Global/Tenant | Tenant objetivo | N/A | N/A | PASS estático parcial; requiere E2E de tenant activo |
| Billing | Leer/administrar | permiso de suscripción | Global/Tenant admin | Tenant activo | N/A | N/A | PASS estático parcial; requiere E2E de contexto activo |

## Catálogo de permisos por dominio

El seed define permisos granulares para: plataforma, tenants, sucursales, vacantes, postulaciones, training, inventario, productividad, usuarios, empleados, roles, permisos, planes, módulos, suscripciones, automatización, auditoría, workflow master, métricas, notificaciones, exportaciones, archivos y eventos de dominio.

La tabla representa la decisión efectiva de acceso; el inventario ruta por ruta permanece documentado en `docs/QA_API_MATRIX.md`.

