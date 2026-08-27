ALTER TABLE "RestaurantConsumptionRecord"
  ADD COLUMN "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overrideJustification" TEXT;

ALTER TABLE "RestaurantWasteRecord"
  ADD COLUMN "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overrideJustification" TEXT;

ALTER TABLE "RestaurantProductionOrder"
  ADD COLUMN "overrideUsed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "overrideJustification" TEXT;

CREATE INDEX "RestaurantConsumptionRecord_tenantId_overrideUsed_idx"
  ON "RestaurantConsumptionRecord" ("tenantId", "overrideUsed", "confirmedAt");
CREATE INDEX "RestaurantWasteRecord_tenantId_overrideUsed_idx"
  ON "RestaurantWasteRecord" ("tenantId", "overrideUsed", "confirmedAt");
CREATE INDEX "RestaurantProductionOrder_tenantId_overrideUsed_idx"
  ON "RestaurantProductionOrder" ("tenantId", "overrideUsed", "confirmedAt");
