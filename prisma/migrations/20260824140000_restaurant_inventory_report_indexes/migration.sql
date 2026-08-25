CREATE INDEX "RestaurantIngredient_tenantId_categoryId_status_idx"
  ON "RestaurantIngredient" ("tenantId", "categoryId", "status");

CREATE INDEX "RestaurantRecipe_tenantId_categoryId_status_idx"
  ON "RestaurantRecipe" ("tenantId", "categoryId", "status");

CREATE INDEX "RestaurantGoodsReceipt_tenantId_supplierId_receivedAt_idx"
  ON "RestaurantGoodsReceipt" ("tenantId", "supplierId", "receivedAt");

CREATE INDEX "RestaurantConsumptionRecord_tenantId_branchId_warehouseId_consumptionDate_idx"
  ON "RestaurantConsumptionRecord" ("tenantId", "branchId", "warehouseId", "consumptionDate");

CREATE INDEX "RestaurantInventoryMovement_tenantId_movementType_occurredAt_idx"
  ON "RestaurantInventoryMovement" ("tenantId", "movementType", "occurredAt");

CREATE INDEX "AuditLog_tenantId_action_createdAt_idx"
  ON "AuditLog" ("tenantId", "action", "createdAt");
