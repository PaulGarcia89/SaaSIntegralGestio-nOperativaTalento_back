-- Phase 3 advanced inventory control. Additive and safe for existing records.
CREATE TYPE "RestaurantStockCountKind" AS ENUM ('FULL', 'PARTIAL', 'SCHEDULED');
CREATE TYPE "RestaurantShrinkageAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

ALTER TABLE "RestaurantStockCount"
  ADD COLUMN "kind" "RestaurantStockCountKind" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "scheduledFor" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3),
  ADD COLUMN "closedBy" TEXT;

CREATE INDEX "RestaurantStockCount_tenantId_branchId_warehouseId_kind_scheduledFor_idx"
  ON "RestaurantStockCount"("tenantId", "branchId", "warehouseId", "kind", "scheduledFor");

CREATE TABLE "RestaurantShrinkageAlert" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "stockCountId" TEXT,
  "thresholdPercent" DECIMAL(9,4) NOT NULL,
  "varianceQuantity" DECIMAL(18,6) NOT NULL,
  "varianceValue" DECIMAL(18,6) NOT NULL,
  "variancePercent" DECIMAL(9,4) NOT NULL,
  "status" "RestaurantShrinkageAlertStatus" NOT NULL DEFAULT 'OPEN',
  "reason" TEXT,
  "acknowledgedBy" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantShrinkageAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantShrinkageAlert_tenantId_branchId_warehouseId_status_createdAt_idx"
  ON "RestaurantShrinkageAlert"("tenantId", "branchId", "warehouseId", "status", "createdAt");
CREATE INDEX "RestaurantShrinkageAlert_tenantId_ingredientId_createdAt_idx"
  ON "RestaurantShrinkageAlert"("tenantId", "ingredientId", "createdAt");

-- Audit logs are append-only. Corrections must be new compensating events.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are immutable';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_immutable ON "audit_logs";
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Down migration (used only for local rollback).
-- DROP TRIGGER IF EXISTS audit_logs_immutable ON "audit_logs";
-- DROP FUNCTION IF EXISTS prevent_audit_log_mutation();
-- DROP TABLE IF EXISTS "RestaurantShrinkageAlert";
-- DROP INDEX IF EXISTS "RestaurantStockCount_tenantId_branchId_warehouseId_kind_scheduledFor_idx";
-- ALTER TABLE "RestaurantStockCount" DROP COLUMN IF EXISTS "kind", DROP COLUMN IF EXISTS "scheduledFor", DROP COLUMN IF EXISTS "closedAt", DROP COLUMN IF EXISTS "closedBy";
-- DROP TYPE IF EXISTS "RestaurantShrinkageAlertStatus";
-- DROP TYPE IF EXISTS "RestaurantStockCountKind";
