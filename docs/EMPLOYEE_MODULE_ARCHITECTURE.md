# Employee Module Architecture

Fecha: 2026-08-19

## 1. Objetivo del módulo

El módulo `People / Employees` del backend actual ya opera como un registro de empleados existentes dentro del contexto multi-tenant y con branch scoping. Sin embargo, su alcance real todavía es más cercano a un directorio operacional con documentos básicos y asignaciones activas que a un `Employee 360` completo.

Este documento describe:

- qué ya existe hoy;
- qué entidades y contratos se pueden reutilizar;
- dónde hay solapamientos o deuda de modelado;
- qué faltaría para evolucionar hacia un expediente central completo sin romper el backend actual.

## 2. Estado actual detectado

### 2.1 Ya existe un módulo de empleados

El backend ya expone:

- `POST /employees`
- `POST /employees/bulk`
- `POST /employees/bulk/validate`
- `GET /employees`
- `GET /employees/:id`
- `GET /employees/:id/document-summary`
- `GET /employees/:id/history`
- `PATCH /employees/:id`
- `PATCH /employees/:id/status`
- `POST /employees/:id/transfer`
- `POST /employees/:id/assignments`

Esto significa que el módulo actual ya cubre:

- registro individual de empleados existentes;
- carga masiva;
- filtrado por sucursal;
- actualización de datos base;
- historial básico;
- resumen documental;
- asignaciones de sucursal.

### 2.2 El enfoque actual no es contratación

El contrato actual usa:

- `RegisterEmployeeDto`
- `BulkLoadEmployeesDto`
- `EmployeeStatus`
- `primaryBranchId`
- `primaryRole`

Eso confirma que el módulo ya está orientado a empleados existentes, no a contratación, entrevistas ni onboarding.

### 2.3 Contrato funcional actual del listado

`GET /employees` ya retorna una estructura enriquecida con:

- `recordSource`
- `primaryBranch`
- `activeBranches`
- `documentSummary.totalDocuments`

Además, el endpoint acepta:

- `search`
- `status`
- `branchId`
- paginación offset-based

## 3. Entidades y módulos existentes reutilizables

### 3.1 Employee y EmployeeBranch

En Prisma ya existen:

- `Employee`
- `EmployeeBranch`

Esto ya resuelve:

- identidad base del empleado;
- sucursal principal;
- sucursales secundarias;
- rol por sucursal;
- historial de asignaciones activas y liberadas.

### 3.2 EmployeeDocument

Existe `EmployeeDocument` como repositorio documental operativo.

Cobertura actual útil:

- categoría documental;
- nombre original;
- estado;
- versión;
- expiración;
- revisión;
- soft delete;
- relación con empleado.

Limitación actual:

- todavía no cubre todo el modelo de expediente completo propuesto en la solicitud;
- no modela explícitamente políticas de retención, legal hold o un catálogo normalizado de tipos documentales en este módulo.

### 3.3 AuditLog

Existe `AuditLog` y el módulo de empleados ya deja trazas en acciones sensibles como:

- registro;
- actualización;
- cambio de estado;
- transferencia;
- asignación secundaria.

Esto es suficiente como base de auditoría, pero aún no equivale a un expediente 360 con trazabilidad documental completa.

### 3.4 Branch, Tenant y RBAC

Ya existen:

- `Branch`
- `Tenant`
- permisos y guards por tenant
- branch scoping

El módulo de empleados ya respeta:

- pertenencia de sucursal al tenant;
- acceso limitado por sucursal;
- permisos `employees.read`, `employees.create`, `employees.update`.

### 3.5 Módulos integrables

El backend ya tiene módulos que el futuro expediente de empleado puede reutilizar, en lugar de duplicar:

- `inventory` y `AssetAssignment`
- `training` y `TrainingAssignment`
- `productivity`
- `audit-logs`
- `onboarding` para referencias históricas o de legado, no como fuente principal del nuevo módulo

## 4. Duplicaciones y riesgos de solapamiento

### 4.1 Riesgo: mezclar Employee 360 con onboarding heredado

Hay varios módulos y rutas heredadas de onboarding, ATS y conversión candidato-empleado.

Riesgo:

- que el front o futuras capas de dominio sigan interpretando el módulo de empleados como parte de contratación;
- que se mezclen conceptos de candidate conversion, onboarding y directorio operativo.

Recomendación:

- mantener `employees` como dominio de empleado existente;
- dejar onboarding/ATS como dominios separados;
- solo exponer referencias a esos dominios cuando aporten valor operacional o de auditoría.

### 4.2 Riesgo: duplicar documentos por tipo

La solicitud de target pide un repositorio documental más rico, pero el backend ya tiene `EmployeeDocument` como entidad genérica.

Recomendación:

- no crear columnas específicas por tipo documental;
- extender la entidad actual solo si hace falta;
- usar un catálogo o metadata adicional para clasificar documentos, en vez de hardcodear tipos nuevos como columnas.

### 4.3 Riesgo: duplicar historial laboral en varias tablas incompatibles

Hoy el backend ya conserva:

- `EmployeeBranch` como historial de asignaciones;
- `AuditLog` como historial de acciones;
- `history(id)` como vista consolidada del empleado.

Si se introduce un historial laboral más formal, debe convivir con estos recursos y no reemplazarlos sin necesidad.

## 5. Brecha frente al objetivo Employee 360

La solicitud describe una arquitectura más amplia que lo que hoy expone el backend.

### 5.1 Ya cubierto

- registro individual;
- carga masiva;
- listado por sucursal;
- status de empleado;
- asignaciones de sucursal;
- historial básico;
- resumen documental;
- auditoría de cambios;
- multi-tenant;
- branch scoping.

### 5.2 Parcialmente cubierto

- directorio documental;
- vista resumen tipo `Employee Overview`;
- documentos pendientes como concepto operacional;
- integración con training, assets y productivity.

### 5.3 No modelado todavía como parte explícita del módulo de employees

- `EmployeeSensitiveData`
- `EmploymentRecord`
- `EmploymentHistory` formal
- `EmployeeTaxRecord`
- `EmployeeI9Record`
- `EmployeeEVerifyRecord`
- `FloridaNewHireRecord`
- `ComplianceRequirement`
- `EmployeeComplianceRequirement`
- `RetentionPolicy`
- `EmployeeCertification`
- un `overview` agregado completo con compliance, training, assets y alerts

## 6. Contratos actuales relevantes

### 6.1 Registro de empleado

Contrato actual:

- `name`
- `email`
- `status`
- `primaryBranchId`
- `primaryRole`

### 6.2 Carga masiva

Contrato actual:

- lista de los mismos registros que el alta individual

### 6.3 Listado de empleados

El backend actual devuelve:

- `id`
- `tenantId`
- `name`
- `email`
- `jobTitle`
- `recordSource`
- `status`
- `createdAt`
- `updatedAt`
- `documentSummary.totalDocuments`
- `primaryBranch`
- `activeBranches`

### 6.4 Resumen documental

`GET /employees/:id/document-summary` devuelve:

- `summary.total`
- `summary.pendingReview`
- `summary.approved`
- `summary.rejected`
- `summary.expired`
- `summary.expiringWithin30Days`
- `summary.byCategory`
- `documents[]`

## 7. Recomendación de arquitectura evolutiva

### 7.1 Mantener `employees` como núcleo operativo

El módulo debe seguir siendo el registro de empleados existentes.

No debe volver a hablar de:

- contratación;
- ofertas;
- entrevistas;
- pipeline;
- onboarding como flujo principal del módulo.

### 7.2 Extender por subdominios, no por una mega tabla

Para llegar al Employee 360, conviene crecer por bloques:

- identidad y datos base;
- empleo;
- compliance;
- documentos;
- training;
- assets;
- productivity;
- auditoría.

### 7.3 Reutilizar entidades existentes antes de crear nuevas

Prioridad de reutilización:

1. `Employee`
2. `EmployeeBranch`
3. `EmployeeDocument`
4. `AuditLog`
5. `TrainingAssignment`
6. `AssetAssignment`
7. `Productivity*`

## 8. Criterio de compatibilidad para front y API

El backend actual ya es consistente con un directorio de empleados existentes, pero no con un expediente 360 completo.

Por lo tanto:

- no se deben inventar campos en el front;
- cualquier dato adicional debe tratarse como opcional;
- cualquier métrica o resumen no expuesto por el backend debe mostrarse como placeholder seguro o no mostrarse;
- los listados deben tolerar respuestas parciales.

## 9. Conclusión

El backend ya tiene una base sólida para el módulo `Employees` como directorio operacional con auditoría y documentos.

Lo que falta para un verdadero `Employee 360` no es reemplazar lo existente, sino ampliar el modelo con subentidades especializadas y contratos agregados, manteniendo:

- multi-tenant;
- branch scoping;
- RBAC;
- auditoría;
- soft delete;
- compatibilidad hacia atrás.

