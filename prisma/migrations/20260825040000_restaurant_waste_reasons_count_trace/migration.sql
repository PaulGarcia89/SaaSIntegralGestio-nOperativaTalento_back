ALTER TYPE "RestaurantStockCountStatus" ADD VALUE IF NOT EXISTS 'IN_REVIEW';

CREATE TABLE "RestaurantWasteReason" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantWasteReason_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestaurantWasteReason_tenantId_code_key" ON "RestaurantWasteReason"("tenantId", "code");
CREATE INDEX "RestaurantWasteReason_tenantId_status_name_idx" ON "RestaurantWasteReason"("tenantId", "status", "name");

ALTER TABLE "RestaurantWasteRecord" ADD COLUMN "reasonId" TEXT;
ALTER TABLE "RestaurantWasteRecordItem" ADD COLUMN "lotId" TEXT;
ALTER TABLE "RestaurantWasteRecord" ADD CONSTRAINT "RestaurantWasteRecord_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "RestaurantWasteReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "RestaurantStockCountHistory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "stockCountId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "statusBefore" "RestaurantStockCountStatus",
  "statusAfter" "RestaurantStockCountStatus",
  "actorId" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantStockCountHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantStockCountHistory_tenantId_stockCountId_createdAt_idx" ON "RestaurantStockCountHistory"("tenantId", "stockCountId", "createdAt");
ALTER TABLE "RestaurantStockCountHistory" ADD CONSTRAINT "RestaurantStockCountHistory_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "RestaurantStockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
