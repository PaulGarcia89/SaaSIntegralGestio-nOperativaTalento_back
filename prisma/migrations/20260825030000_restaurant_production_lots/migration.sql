ALTER TABLE "RestaurantProductionOrder"
  ADD COLUMN "lotNumber" TEXT,
  ADD COLUMN "expirationDate" TIMESTAMP(3);

CREATE INDEX "RestaurantProductionOrder_tenantId_expirationDate_idx"
  ON "RestaurantProductionOrder"("tenantId", "expirationDate");
