# Restaurant inventory Phase 1

## Security model

Inventory requests are evaluated after JWT, tenant, subscription, capability and permission guards. `RestaurantInventoryContextGuard` validates branch ownership, branch scope, warehouse ownership and the branch/warehouse relationship. Routes that operate on a document (`receipts`, `consumptions`, `wastes`, `productions`, `stock-counts`, `transfers` and `sales-imports`) resolve the document by `tenantId` before allowing the operation.

## Idempotency

Critical mutations accept `Idempotency-Key`. The key is scoped by tenant, authenticated user, HTTP method and route. The payload hash includes query, route parameters, body and uploaded-file hash. A repeated key returns the persisted JSON response; a different payload returns `409 Conflict`. Records are stored in `RestaurantInventoryIdempotencyRecord` and must be retained according to the audit retention policy.

The header is optional for backward compatibility with existing clients. New clients should send it on every create, confirm, approve, adjust, transfer and import mutation.

## Permissions

New permissions are seeded for:

- `restaurant_inventory.receipts.create`
- `restaurant_inventory.receipts.confirm`
- `restaurant_inventory.recipes.manage`
- `restaurant_inventory.operations.create`
- `restaurant_inventory.operations.confirm`
- `restaurant_inventory.counts.approve`
- `restaurant_inventory.adjustments.create`
- `restaurant_inventory.transfers.manage`
- `restaurant_inventory.settings.manage`

`restaurant_inventory.manage` remains a compatibility alias. Existing `inventory.create`, `inventory.update`, `inventory.confirm` and `inventory.manage` permissions are also honored during the transition.

## Sales import endpoints

The import API supports CSV/XLSX upload, header inspection, persistent column configuration, product mappings, row validation, preview, asynchronous processing, progress, retries, history and CSV error export:

```text
POST /api/restaurant-inventory/sales-imports/upload
POST /api/restaurant-inventory/sales-imports/:sessionId/configure
POST /api/restaurant-inventory/sales-imports/:sessionId/validate
GET  /api/restaurant-inventory/sales-imports/:sessionId
POST /api/restaurant-inventory/sales-imports/:sessionId/columns
GET  /api/restaurant-inventory/sales-imports/:sessionId/mappings
GET  /api/restaurant-inventory/sales-imports/mappings
POST /api/restaurant-inventory/sales-imports/mappings
POST /api/restaurant-inventory/sales-imports/:sessionId/preview
POST /api/restaurant-inventory/sales-imports/:sessionId/process
GET  /api/restaurant-inventory/sales-imports/:jobId
GET  /api/restaurant-inventory/sales-imports/history
GET  /api/restaurant-inventory/sales-imports/:sessionId/errors/export
```

Route parameter names are aliases only; the persisted ID remains tenant-scoped. Validation never confirms or changes inventory. Processing reuses `ConsumptionRecord` and the existing transactional confirmation service.

## Deployment

Apply the migration with:

```bash
npx prisma migrate deploy
```

Run the unit/contract suite with:

```bash
npx jest src/restaurant-inventory --runInBand
```

Run real API integration tests only against an isolated database whose name contains `e2e`, `test` or `certification`:

```bash
RUN_RESTAURANT_INVENTORY_E2E=1 npm run test:e2e -- restaurant-inventory
```
