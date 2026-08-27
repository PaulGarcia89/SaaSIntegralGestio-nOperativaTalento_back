ALTER TYPE "RestaurantCommercialBudgetStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';
ALTER TYPE "RestaurantCommercialBudgetStatus" ADD VALUE IF NOT EXISTS 'APPROVED';

CREATE TYPE "RestaurantCommercialBudgetOveragePolicy" AS ENUM ('BLOCK', 'WARN', 'REQUIRE_APPROVAL');

ALTER TABLE "RestaurantCommercialBudget"
  ADD COLUMN "categoryId" TEXT,
  ADD COLUMN "supplierId" TEXT,
  ADD COLUMN "receivedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "overagePolicy" "RestaurantCommercialBudgetOveragePolicy" NOT NULL DEFAULT 'BLOCK',
  ADD COLUMN "reason" TEXT;

CREATE UNIQUE INDEX "RestaurantCommercialBudget_tenantId_branchId_warehouseId_categoryId_supplierId_periodStart_periodEnd_key"
  ON "RestaurantCommercialBudget"("tenantId", "branchId", "warehouseId", "categoryId", "supplierId", "periodStart", "periodEnd");

CREATE INDEX "RestaurantCommercialBudget_category_supplier_period_idx"
  ON "RestaurantCommercialBudget"("tenantId", "categoryId", "supplierId", "periodStart", "periodEnd");
