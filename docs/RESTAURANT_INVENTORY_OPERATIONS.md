# Restaurant Inventory Operations

## Seguridad y contexto

Todas las rutas del módulo pasan por `JwtAuthGuard`, `TenantGuard`, `SubscriptionGuard`, `PermissionGuard`, `InventoryCapabilityGuard` y `RestaurantInventoryContextGuard`. Los servicios reciben el `tenantId` del contexto autenticado y deben mantenerlo en cada consulta y mutación. Las operaciones con sucursal o almacén validan que el almacén pertenezca a la sucursal y que la sucursal esté dentro del alcance del usuario.

La auditoría HTTP se registra mediante `AuditLogMiddleware` y `AuditContextInterceptor`. El endpoint de auditoría del inventario es de solo lectura; las correcciones se realizan mediante movimientos de reversión, nunca editando ni eliminando movimientos históricos.

## Permisos

| Capacidad | Permiso |
| --- | --- |
| Lectura | `inventory.view`, `inventory.read` |
| Catálogos | `inventory.create`, `inventory.update` |
| Confirmaciones | `inventory.confirm` |
| Cancelaciones | `inventory.cancel` |
| Override de saldo negativo | `inventory.override` |
| Reportes y exportaciones | `inventory.report.view`, `inventory.report.export` |
| Producción | `inventory.production.create`, `inventory.production.confirm` |
| Lotes | `inventory.lot.view` |
| Conteos | `inventory.stock_count.create`, `inventory.stock_count.approve` |
| Transferencias | `inventory.transfer.create`, `inventory.transfer.send`, `inventory.transfer.receive` |
| Importación de ventas | `inventory.sales_import.create`, `inventory.sales_import.validate`, `inventory.sales_import.map`, `inventory.sales_import.process`, `inventory.sales_import.reverse`, `inventory.sales_import.view` |

Durante la migración de permisos se conservan los permisos genéricos para compatibilidad. Las rutas específicas deben migrarse progresivamente a los permisos de flujo sin ampliar privilegios.

## Estados y garantías

- Entradas: `DRAFT -> CONFIRMED -> CANCELLED`; una entrada confirmada no se edita.
- Consumos y desperdicios: `DRAFT -> CONFIRMED -> CANCELLED`.
- Producción: `DRAFT -> CONFIRMED` o `CANCELLED`.
- Conteos: `DRAFT -> IN_PROGRESS -> REVIEW -> APPROVED` o `CANCELLED`; antes de aprobar no se expone la cantidad teórica.
- Transferencias: `DRAFT -> SENT -> RECEIVED` o `CANCELLED`; el envío no altera saldos y la recepción no puede repetirse.
- Importaciones: validación sin movimientos; procesamiento asíncrono, reclamación idempotente por fila, progreso, reintento de fallos y reversión auditable.

Las confirmaciones usan transacciones y reclamaciones atómicas por estado. Los movimientos tienen referencias de documento y las cancelaciones crean movimientos `REVERSAL`.

## Endpoints principales

- `restaurant-inventory/categories`, `units`, `branches`, `warehouses`, `suppliers`, `ingredients`: CRUD de catálogos.
- `restaurant-inventory/recipes`: recetas versionadas.
- `restaurant-inventory/receipts`: preview, borrador, confirmación y cancelación.
- `restaurant-inventory/consumptions`, `wastes`, `productions`: preview, creación, confirmación y cancelación.
- `restaurant-inventory/stock-counts`: creación, envío, aprobación y cancelación.
- `restaurant-inventory/transfers`: creación, envío, recepción y cancelación.
- `restaurant-inventory/reports/:type`: reportes paginados y `reports/:type/export` para CSV.
- `restaurant-inventory/sales-imports`: plantilla, carga, validación, progreso, errores, procesamiento, retry y cancelación.

## Migraciones e índices

Aplicar siempre en orden con `prisma migrate deploy`. Las migraciones de inventario son aditivas e incluyen índices para saldos, movimientos por fecha, recepciones por proveedor, consumos, categorías, recetas, auditoría e importaciones.

## Despliegue

1. Ejecutar `npx prisma migrate deploy` en una ventana compatible con cambios de esquema.
2. Ejecutar `npx prisma generate` y `npm run build`.
3. Configurar `MESSAGING_ENABLED` y Redis para procesar importaciones asíncronas; sin Redis el fallback es síncrono y debe reservarse para desarrollo.
4. Verificar permisos sembrados y acceso de sucursales antes de habilitar mutaciones.
5. Ejecutar pruebas unitarias y de integración; ejecutar E2E con una base de datos aislada.
6. Monitorizar errores de transacción, jobs fallidos, importaciones parciales y eventos de auditoría.

## Verificación de auditoría

La auditoría productiva debe revisar especialmente aislamiento por tenant, alcance de sucursal, reintentos concurrentes, duplicidad de movimientos, rollback por insuficiencia, fórmulas XLSX, límites de archivo y que no existan rutas de escritura con permisos de lectura.
