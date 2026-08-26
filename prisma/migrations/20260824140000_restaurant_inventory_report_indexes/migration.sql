CREATE INDEX IF NOT EXISTS "RestaurantIngredient_tenantId_categoryId_status_idx"
  ON "RestaurantIngredient" ("tenantId", "categoryId", "status");

CREATE INDEX IF NOT EXISTS "RestaurantRecipe_tenantId_categoryId_status_idx"
  ON "RestaurantRecipe" ("tenantId", "categoryId", "status");

CREATE INDEX IF NOT EXISTS "RestaurantGoodsReceipt_tenantId_supplierId_receivedAt_idx"
  ON "RestaurantGoodsReceipt" ("tenantId", "supplierId", "receivedAt");

CREATE INDEX IF NOT EXISTS "RestaurantConsumptionRecord_tenantId_branchId_warehouseId_consumptionDate_idx"
  ON "RestaurantConsumptionRecord" ("tenantId", "branchId", "warehouseId", "consumptionDate");

CREATE INDEX IF NOT EXISTS "RestaurantInventoryMovement_tenantId_movementType_occurredAt_idx"
  ON "RestaurantInventoryMovement" ("tenantId", "movementType", "occurredAt");

CREATE INDEX IF NOT EXISTS "AuditLog_tenantId_action_createdAt_idx"
  ON "audit_logs" ("tenantId", "action", "createdAt");
