CREATE TYPE "RestaurantStockCountRecurrence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "RestaurantStockCountScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

ALTER TABLE "RestaurantStockCount"
  ADD COLUMN "scope" JSONB,
  ADD COLUMN "scheduleId" TEXT;
CREATE INDEX "RestaurantStockCount_tenantId_scheduleId_idx"
  ON "RestaurantStockCount"("tenantId", "scheduleId");

CREATE TABLE "RestaurantStockCountSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "recurrence" "RestaurantStockCountRecurrence" NOT NULL,
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastRunAt" TIMESTAMP(3),
  "status" "RestaurantStockCountScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
  "scope" JSONB NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantStockCountSchedule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantStockCountSchedule_tenantId_branchId_warehouseId_status_nextRunAt_idx"
  ON "RestaurantStockCountSchedule"("tenantId", "branchId", "warehouseId", "status", "nextRunAt");
