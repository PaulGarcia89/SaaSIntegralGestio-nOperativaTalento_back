ALTER TYPE "SalesImportRowStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "RestaurantSalesImport"
  ADD COLUMN "jobId" TEXT,
  ADD COLUMN "processedRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedRows" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "errorReportStorageKey" TEXT;

ALTER TABLE "RestaurantSalesImportRow"
  ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastError" TEXT,
  ADD COLUMN "consumptionId" TEXT;

UPDATE "RestaurantSalesImportRow"
SET "idempotencyKey" = md5("salesImportId" || ':' || "rowNumber")
WHERE "idempotencyKey" = '';

ALTER TABLE "RestaurantSalesImportRow"
  ALTER COLUMN "idempotencyKey" DROP DEFAULT;

CREATE UNIQUE INDEX "RestaurantSalesImportRow_salesImportId_idempotencyKey_key"
  ON "RestaurantSalesImportRow" ("salesImportId", "idempotencyKey");
CREATE INDEX "RestaurantSalesImport_tenantId_status_processedRows_idx"
  ON "RestaurantSalesImport" ("tenantId", "status", "processedRows");
CREATE INDEX "RestaurantSalesImportRow_salesImportId_validationStatus_attempts_idx"
  ON "RestaurantSalesImportRow" ("salesImportId", "validationStatus", "attempts");
