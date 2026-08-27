-- Additive indexes for report filters and time-series aggregations.
CREATE INDEX IF NOT EXISTS "RestaurantInventoryMovement_report_filter_idx"
  ON "RestaurantInventoryMovement"("tenantId", "branchId", "warehouseId", "movementType", "occurredAt");
CREATE INDEX IF NOT EXISTS "RestaurantConsumptionRecord_report_filter_idx"
  ON "RestaurantConsumptionRecord"("tenantId", "branchId", "warehouseId", "status", "consumptionDate");
CREATE INDEX IF NOT EXISTS "RestaurantWasteRecord_report_filter_idx"
  ON "RestaurantWasteRecord"("tenantId", "branchId", "warehouseId", "status", "wasteDate");
CREATE INDEX IF NOT EXISTS "RestaurantInventoryLot_expiry_report_idx"
  ON "RestaurantInventoryLot"("tenantId", "branchId", "warehouseId", "status", "expirationDate");
CREATE INDEX IF NOT EXISTS "RestaurantStockCount_report_filter_idx"
  ON "RestaurantStockCount"("tenantId", "branchId", "warehouseId", "status", "countedAt");
