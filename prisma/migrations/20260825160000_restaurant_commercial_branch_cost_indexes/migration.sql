CREATE INDEX "RestaurantIngredient_tenantId_categoryId_status_idx"
  ON "RestaurantIngredient"("tenantId", "categoryId", "status");

CREATE INDEX "RestaurantConsumptionRecord_tenantId_branchId_warehouseId_status_consumptionDate_idx"
  ON "RestaurantConsumptionRecord"("tenantId", "branchId", "warehouseId", "status", "consumptionDate");

CREATE INDEX "RestaurantInventoryMovement_tenantId_branchId_warehouseId_occurredAt_referenceType_movementType_idx"
  ON "RestaurantInventoryMovement"("tenantId", "branchId", "warehouseId", "occurredAt", "referenceType", "movementType");

CREATE INDEX "RestaurantStockCount_tenantId_branchId_warehouseId_status_countedAt_idx"
  ON "RestaurantStockCount"("tenantId", "branchId", "warehouseId", "status", "countedAt");

CREATE INDEX "RestaurantInventoryBalance_tenantId_branchId_warehouseId_updatedAt_idx"
  ON "RestaurantInventoryBalance"("tenantId", "branchId", "warehouseId", "updatedAt");
