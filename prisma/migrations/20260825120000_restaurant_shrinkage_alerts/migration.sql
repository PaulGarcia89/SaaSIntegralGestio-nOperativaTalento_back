ALTER TYPE "RestaurantShrinkageAlertStatus" RENAME TO "RestaurantShrinkageAlertStatus_old";
CREATE TYPE "RestaurantShrinkageAlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');
ALTER TABLE "RestaurantShrinkageAlert" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "RestaurantShrinkageAlert" ALTER COLUMN "status" TYPE "RestaurantShrinkageAlertStatus" USING CASE WHEN "status"::text = 'DISMISSED' THEN 'FALSE_POSITIVE'::"RestaurantShrinkageAlertStatus" ELSE "status"::text::"RestaurantShrinkageAlertStatus" END;
ALTER TABLE "RestaurantShrinkageAlert" ALTER COLUMN "status" SET DEFAULT 'OPEN';
DROP TYPE "RestaurantShrinkageAlertStatus_old";
CREATE TYPE "RestaurantShrinkageAlertType" AS ENUM ('WASTE', 'COUNT_VARIANCE', 'UNEXPLAINED_LOSS', 'ADJUSTMENT');
ALTER TABLE "RestaurantShrinkageAlert"
  ADD COLUMN "sourceType" "RestaurantShrinkageAlertType" NOT NULL DEFAULT 'UNEXPLAINED_LOSS',
  ADD COLUMN "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "periodEnd" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "thresholdValue" DECIMAL(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN "resolutionReason" TEXT;
CREATE INDEX "RestaurantShrinkageAlert_tenantId_sourceType_periodStart_periodEnd_idx"
  ON "RestaurantShrinkageAlert"("tenantId", "sourceType", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "RestaurantShrinkageAlert_tenantId_stockCountId_ingredientId_sourceType_key"
  ON "RestaurantShrinkageAlert"("tenantId", "stockCountId", "ingredientId", "sourceType");
ALTER TABLE "RestaurantShrinkageAlert" ADD COLUMN "sourceReferenceId" TEXT;
DROP INDEX "RestaurantShrinkageAlert_tenantId_stockCountId_ingredientId_sourceType_key";
CREATE UNIQUE INDEX "RestaurantShrinkageAlert_tenantId_sourceReferenceId_ingredientId_sourceType_key"
  ON "RestaurantShrinkageAlert"("tenantId", "sourceReferenceId", "ingredientId", "sourceType");
