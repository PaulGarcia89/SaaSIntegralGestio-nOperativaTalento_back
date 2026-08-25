ALTER TABLE "Branch"
  ADD COLUMN "inventoryStatus" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "RestaurantInventorySupplier_tenantId_name_key"
  ON "RestaurantInventorySupplier" ("tenantId", "name");

CREATE INDEX "RestaurantInventoryCategory_tenantId_status_name_idx"
  ON "RestaurantInventoryCategory" ("tenantId", "status", "name");
CREATE INDEX "RestaurantInventoryUnit_tenantId_status_name_idx"
  ON "RestaurantInventoryUnit" ("tenantId", "status", "name");
CREATE INDEX "RestaurantInventorySupplier_tenantId_status_name_idx"
  ON "RestaurantInventorySupplier" ("tenantId", "status", "name");
CREATE INDEX "RestaurantInventoryWarehouse_tenantId_status_name_idx"
  ON "RestaurantInventoryWarehouse" ("tenantId", "status", "name");
CREATE INDEX "RestaurantIngredient_tenantId_status_sku_idx"
  ON "RestaurantIngredient" ("tenantId", "status", "sku");
CREATE INDEX "Branch_tenantId_inventoryStatus_name_idx"
  ON "Branch" ("tenantId", "inventoryStatus", "name");
