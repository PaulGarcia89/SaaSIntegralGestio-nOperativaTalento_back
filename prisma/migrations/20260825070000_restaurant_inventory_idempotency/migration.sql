CREATE TABLE "RestaurantInventoryIdempotencyRecord" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL DEFAULT 200,
  "responseJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantInventoryIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantInventoryIdempotencyRecord_scope_key"
  ON "RestaurantInventoryIdempotencyRecord"("tenantId", "userId", "method", "endpoint", "idempotencyKey");
CREATE INDEX "RestaurantInventoryIdempotencyRecord_tenantId_createdAt_idx"
  ON "RestaurantInventoryIdempotencyRecord"("tenantId", "createdAt");

ALTER TABLE "RestaurantSalesImport"
  ADD COLUMN "columnMap" JSONB;
