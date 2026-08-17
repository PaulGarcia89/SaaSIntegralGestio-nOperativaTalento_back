# Auditoría QA de RBAC, permisos y seguridad multi-tenant

Fecha: **2026-08-13**  
Alcance: backend NestJS/Prisma, revisión estática y ejecución de la suite RBAC existente.  
Clasificación: toda exposición confirmada entre tenants se considera **CRITICAL**.

## Dictamen ejecutivo

El aislamiento de tenant es consistente en los dominios revisados: el tenant efectivo se reconstruye desde sesión/persistencia, `TenantGuard` rechaza un `tenantId` ajeno y las consultas sensibles combinan el ID del recurso con `tenantId`. **No se confirmó una vulnerabilidad cross-tenant**, por lo que esta auditoría no abre hallazgos CRITICAL.

El sistema **no está listo para certificación RBAC final**. Se confirmaron dos fallas HIGH de escalamiento horizontal entre sucursales del mismo tenant:

1. Productividad acepta `branchId`, `cameraId`, `zoneId` y alertas sin restringirlos a `allowedBranchIds` del actor.
2. Inventario permite consultar, exportar y operar recursos de cualquier sucursal del tenant a usuarios con permisos de inventario, sin aplicar el alcance de sucursal del actor.

La suite automatizada reportó 24/27 casos aprobados. Los tres fallos impiden usarla como gate, aunque dos corresponden a expectativas/mocks desactualizados y no prueban por sí solos una explotación.

## Modelo de autorización observado

La cadena predominante es:

`JWT` → `TenantGuard` → `SubscriptionGuard` → `ModuleAccessGuard` → `ScopeGuard`/`BranchAccessGuard` → `PermissionGuard` → filtros de servicio por tenant/sucursal/owner.

Controles relevantes:

- `AuthContextService` reconstruye permisos, módulos, tenants y sucursales desde base de datos para cada access token validado.
- Una sesión revocada o expirada no puede seguir autenticando aunque el JWT no haya expirado.
- `PermissionGuard` exige todos los permisos declarados; sólo `SUPERADMIN` en contexto global tiene bypass.
- `TenantGuard` resuelve el tenant activo y rechaza cabeceras que no coinciden con el contexto autorizado.
- `BranchAccessGuard` valida la cabecera de sucursal, la asignación del usuario y la pertenencia al tenant.
- `ModuleAccessGuard` usa las capacidades actuales de la suscripción, no sólo claims antiguos.
- Roles y usuarios impiden que un administrador de tenant otorgue permisos de plataforma o permisos que no posee.

## Roles efectivos

| Rol | Scope | Acceso esperado | Restricciones principales |
|---|---|---|---|
| `SUPERADMIN` | Global | Gobierno completo de plataforma; puede seleccionar tenant o impersonar | El bypass de permiso sólo aplica en contexto global |
| `PLATFORM_ADMIN` | Global/tenant seleccionado | Gobierno excepto impersonación según seed | Limitado a tenant activo/permitido |
| `TENANT_ADMIN` | Tenant | Administración completa del tenant y todas sus sucursales | No puede otorgar permisos de plataforma ni crear/eliminar tenants |
| `BRANCH_ADMIN` | Branch admin | Lecturas definidas por catálogo y operaciones de empleados | Recursos operativos deben limitarse a sucursales asignadas |
| `HR_MANAGER` | Branch admin | Vacantes, postulaciones, formación y archivos ATS | Limitado a sucursales asignadas y módulos contratados |
| `SUPERVISOR` | Branch admin | Lectura/actualización acotada de empleados y lectura operacional | Limitado a sucursales asignadas; ownership para empleado común |
| `BRANCH_USER` | Branch user | Empleados asignados y notificaciones propias | Sin administración tenant-wide |
| `INVENTORY_MANAGER` | Branch | Inventario, empleados y cambio de sucursal | Actualmente existe brecha de sucursal en Inventario |
| Candidato | Owner | Portal, postulaciones/ofertas/documentos propios | Identidad separada mediante `CandidateAuthGuard` |

Los permisos efectivos pueden diferir del seed por roles personalizados y permisos directos. La autorización real debe evaluarse como intersección de: sesión activa + scope + tenant + sucursal + permiso + módulo + suscripción + ownership.

## Hallazgos

### RBAC-001 — Escalamiento horizontal por sucursal en Productividad

**Severidad: HIGH**  
**Tipo:** BOLA/IDOR intra-tenant, branch isolation.

`ProductivityController` no usa `BranchAccessGuard` ni pasa el actor al servicio. Las operaciones de lectura aceptan un `branchId` arbitrario y el servicio sólo agrega `tenantId`. Crear cámaras, zonas o reglas valida que la entidad pertenezca al tenant, pero no que pertenezca a una sucursal asignada al actor. Actualizar una alerta también se resuelve por `{ id, tenantId }`.

Impacto: un usuario branch-scoped con `productivity.view/manage` puede observar o modificar productividad de otra sucursal del mismo tenant.

Remediación: aplicar una política de sucursal uniforme, pasar `JwtPayload`/`allowedBranchIds` al servicio y ligar cada consulta/mutación a `tenantId + branchId IN allowedBranchIds`. Añadir pruebas negativas para query, body y path IDs.

### RBAC-002 — Escalamiento horizontal y exportación de otra sucursal en Inventario

**Severidad: HIGH**  
**Tipo:** BOLA/IDOR y exportación intra-tenant.

`InventoryController` no aplica `BranchAccessGuard` y la mayoría de sus métodos sólo pasan `tenantId`. El actor puede suministrar un `branchId` de otra sucursal en analytics, auditoría, ubicaciones, almacén, activos, órdenes y exportación. Las operaciones por ID y descargas de evidencia se ligan al tenant, pero no al conjunto de sucursales permitido.

Impacto: exposición o modificación de activos, movimientos, proveedores, órdenes y evidencias de otras sucursales del mismo tenant.

Remediación: construir `InventoryAccessContext`, filtrar todos los reads/writes/exports por sucursales permitidas y validar sucursales origen/destino. Mantener `my-assets` por owner. Agregar pruebas por cada forma de ID.

### RBAC-003 — Gate RBAC no determinista frente al comportamiento actual

**Severidad: HIGH (calidad del control)**

La suite falla en filtrado de vacantes, ownership de candidato fusionado y contratación sin workflow. En los dos primeros casos la estructura esperada quedó desactualizada; el tercero falla por un mock incompleto antes de verificar el resultado de seguridad.

Impacto: una regresión real puede llegar a release porque el gate ya se encuentra rojo y pierde capacidad de señal.

### RBAC-004 — Aplicación desigual del control de sucursal

**Severidad: MEDIUM**

Algunos dominios usan `BranchAccessGuard`, otros implementan `allowedBranchIds` en servicios y otros sólo validan tenant. La duplicación facilita omisiones al agregar rutas.

Remediación: centralizar una policy reusable para obtener `branchWhere`, exigirla en revisión/CI y fallar cerrado cuando un actor branch-scoped carece de asignaciones.

### RBAC-005 — URL firmada ATS funciona como capacidad bearer

**Severidad: LOW / riesgo aceptable con condiciones**

La URL pública valida HMAC, tipo, file ID y expiración con comparación segura, pero no vuelve a comprobar tenant/owner al descargar. Esto es el comportamiento normal de una URL firmada: quien posea el enlace durante su vigencia puede usarlo.

Mitigaciones presentes: TTL 30–900 segundos, storage privado, token ligado al recurso, headers `no-store/nosniff` y secreto obligatorio en producción. Evitar registrar o reenviar query strings y reducir TTL cuando el archivo sea sensible.

## Pruebas de ataque solicitadas

| Ataque | Evidencia | Resultado |
|---|---|---|
| IDOR por resource ID | Consultas ATS, empleados, branches, ofertas y archivos revisadas | PASS parcial; FAIL intra-tenant en Inventario/Productividad |
| Escalamiento horizontal | Suite RBAC y filtros `allowedBranchIds` | FAIL en Inventario/Productividad; sin cross-tenant confirmado |
| Escalamiento vertical | `PermissionGuard`, `ScopeGuard`, asignación de roles/permisos | PASS estático/automatizado |
| Cambio manual de IDs | Casos RBAC read/update/delete/export/file | PASS tenant; cobertura branch incompleta |
| Manipulación de `tenantId` | `TenantGuard` + test tenant A/B | PASS, 403/404 sin fuga |
| Manipulación de `branchId` | Tests branch A1/A2 y revisión de servicios | FAIL en Inventario/Productividad |
| Exportación de otro tenant | Reports liga contexto a actor/tenant | PASS estático y caso RBAC genérico |
| Exportación de otra sucursal | Reports protege; Inventory no restringe actor | FAIL para Inventario |
| Acceso a archivos | ATS signed URL, ofertas, evidencia de inventario | PASS tenant/owner en ATS/ofertas; FAIL branch en evidencia de inventario |
| Permisos revocados | Contexto reconstruido desde persistencia | PASS automatizado |
| Sesión antigua/revocada | `assertActiveSession` consulta sesión vigente | PASS automatizado/estático |
| Módulo no contratado | `SubscriptionGuard` + `ModuleAccessGuard` | PASS automatizado |

## Conclusión

No se debe declarar la seguridad RBAC certificada hasta corregir RBAC-001/002, restaurar el gate a 100% y ejecutar E2E real con dos tenants, dos sucursales por tenant y todos los roles. La ausencia de un CRITICAL significa que no se demostró una fuga entre tenants; no equivale a una prueba exhaustiva dinámica contra un entorno desplegado.

