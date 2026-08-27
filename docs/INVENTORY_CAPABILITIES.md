# Inventarios independientes

El backend mantiene dos capacidades separadas dentro del módulo padre `INVENTORY`:

- `ASSET_INVENTORY`: inventario físico existente. Sus rutas compatibles siguen bajo `/api/inventory/*`.
- `RESTAURANT_INVENTORY`: capacidad reservada para el futuro inventario de restaurante. Esta fase no crea tablas ni operaciones de alimentos.

## Activación

La migración `20260823100000_inventory_capabilities` crea una fila por capacidad y tenant. Es idempotente:

- `ASSET_INVENTORY` se activa para tenants con el módulo `INVENTORY` o datos existentes del inventario físico.
- `RESTAURANT_INVENTORY` queda desactivado para todos los tenants existentes.
- La desactivación no elimina datos físicos ni registros de capacidad.

Endpoints:

- `GET /api/inventory-capabilities`: capacidades del tenant actual.
- `PATCH /api/inventory-capabilities/:code`: activa o desactiva una capacidad con `modules.update`.
- `PATCH /api/inventory-capabilities/global/:tenantId/:code`: operación global con alcance de plataforma.
- `GET /api/me/modules`: módulos del plan y capacidades de inventario visibles para el usuario.

Los valores válidos de `:code` son `ASSET_INVENTORY` y `RESTAURANT_INVENTORY`. El acceso a activos exige además la capacidad padre `INVENTORY`, las capacidades `ASSET_INVENTORY` y los permisos legacy `inventory.read`/`inventory.manage`, preservando compatibilidad.

Los permisos nuevos son `asset_inventory.read`, `asset_inventory.manage`, `restaurant_inventory.read` y `restaurant_inventory.manage`. La Fase 1 de restaurante expone operaciones bajo `/api/restaurant-inventory/*` para categorías, unidades, almacenes, proveedores, ingredientes, recepciones, recetas, consumos manuales, desperdicios, balances, movimientos y alertas. Las confirmaciones usan transacciones y las cancelaciones generan movimientos de reversión. No incluye integración POS.

## Fase 2

La migración `20260823120000_restaurant_inventory_phase_two` añade lotes, vencimientos, órdenes de producción, conteos físicos y transferencias sin modificar registros históricos. Se añadieron consultas de lotes y vencimientos, producción con ingrediente de salida, aprobación de conteos mediante ajustes y flujo `DRAFT -> SENT -> RECEIVED` para transferencias.

Permisos adicionales: `inventory.production.create`, `inventory.production.confirm`, `inventory.lot.view`, `inventory.stock_count.create`, `inventory.stock_count.approve`, `inventory.adjustment.approve`, `inventory.transfer.create`, `inventory.transfer.send` y `inventory.transfer.receive`.

## Fase 4: reportes y análisis

Los reportes se consultan en `GET /api/restaurant-inventory/reports/:type` y se exportan en `GET /api/restaurant-inventory/reports/:type/export`. Tipos disponibles: `valued-stock`, `kardex`, `receipts-by-supplier`, `consumption-by-recipe`, `waste-by-reason`, `expiry`, `count-variances`, `low-stock`, `purchase-suggestions` y `audit`.

Fórmulas: existencia valorizada = `quantityOnHand * averageCost`; diferencia de conteo = `countedQuantity - systemQuantity`; valor de diferencia = `varianceQuantity * averageCost`; consumo promedio diario = `consumedQuantity / days`; sugerencia de compra = `max(0, minimumStock - currentStock)`; costo teórico por plato = suma de `convertedInventoryQuantity * ingredient.currentAverageCost`; margen teórico = `sellingPrice - calculatedCost`.

Las exportaciones escapan prefijos de fórmula (`=`, `+`, `-`, `@`) y quedan auditadas mediante `RESTAURANT_INVENTORY_REPORT_EXPORTED`. Los reportes son de solo lectura y no modifican movimientos históricos.

## Fase 3: importación manual de ventas

La importación usa `POST /api/restaurant-inventory/sales-imports/upload` con `multipart/form-data` y el campo `file`. Acepta CSV y XLSX, aplica el límite `SALES_IMPORT_MAX_BYTES`, guarda SHA-256 y rechaza fórmulas de Excel.

Flujo: `upload -> validate -> mappings -> process`. La validación no modifica inventario. El procesamiento crea y confirma `ConsumptionRecord` mediante el servicio existente, conserva la importación y sus filas, y bloquea cargas duplicadas por tenant y hash. También están disponibles `GET /template`, `GET /:id`, `POST /:id/validate`, `POST /mappings`, `POST /:id/process` y `POST /:id/cancel`.
