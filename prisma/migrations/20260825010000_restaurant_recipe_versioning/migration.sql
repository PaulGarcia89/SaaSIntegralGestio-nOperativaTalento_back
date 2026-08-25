CREATE TYPE "RestaurantRecipeType" AS ENUM ('MENU_ITEM', 'PREPARATION', 'YIELD');
CREATE TYPE "RestaurantRecipeVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TYPE "RestaurantRecipeComponentType" AS ENUM ('INGREDIENT', 'SUB_RECIPE');
CREATE TYPE "RestaurantRecipeQuantityMode" AS ENUM ('GROSS', 'USABLE');

ALTER TABLE "RestaurantRecipe"
  ADD COLUMN "type" "RestaurantRecipeType" NOT NULL DEFAULT 'MENU_ITEM',
  ADD COLUMN "portions" DECIMAL(18,6),
  ADD COLUMN "portionQuantity" DECIMAL(18,6),
  ADD COLUMN "portionUnitId" TEXT,
  ADD COLUMN "currentVersionId" TEXT,
  ADD COLUMN "currentFoodCostPercentage" DECIMAL(18,6),
  ADD COLUMN "currentGrossMargin" DECIMAL(18,6),
  ADD COLUMN "currentCostCalculatedAt" TIMESTAMP(3);

CREATE TABLE "RestaurantRecipeVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "yieldQuantity" DECIMAL(18,6) NOT NULL,
  "yieldUnitId" TEXT NOT NULL,
  "portions" DECIMAL(18,6),
  "portionQuantity" DECIMAL(18,6),
  "portionUnitId" TEXT,
  "sellingPriceSnapshot" DECIMAL(18,6),
  "batchCostSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "portionCostSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "foodCostPercentageSnapshot" DECIMAL(18,6),
  "grossMarginSnapshot" DECIMAL(18,6),
  "changeReason" TEXT,
  "status" "RestaurantRecipeVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantRecipeVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantRecipeComponent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "recipeVersionId" TEXT NOT NULL,
  "componentType" "RestaurantRecipeComponentType" NOT NULL,
  "ingredientId" TEXT,
  "subRecipeId" TEXT,
  "quantity" DECIMAL(18,6) NOT NULL,
  "unitId" TEXT NOT NULL,
  "quantityMode" "RestaurantRecipeQuantityMode" NOT NULL DEFAULT 'GROSS',
  "yieldPercentage" DECIMAL(8,4),
  "wastePercentage" DECIMAL(8,4),
  "convertedGrossQuantity" DECIMAL(18,6) NOT NULL,
  "unitCostSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "totalCostSnapshot" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "preparationInstructions" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "RestaurantRecipeComponent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestaurantRecipeStep" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "recipeVersionId" TEXT NOT NULL,
  "stepNumber" INTEGER NOT NULL,
  "instruction" TEXT NOT NULL,
  "imageUrl" TEXT,
  "estimatedMinutes" INTEGER,
  CONSTRAINT "RestaurantRecipeStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RestaurantRecipeVersion_tenantId_recipeId_versionNumber_key" ON "RestaurantRecipeVersion"("tenantId", "recipeId", "versionNumber");
CREATE INDEX "RestaurantRecipeVersion_tenantId_recipeId_status_idx" ON "RestaurantRecipeVersion"("tenantId", "recipeId", "status");
CREATE INDEX "RestaurantRecipeComponent_tenantId_recipeVersionId_position_idx" ON "RestaurantRecipeComponent"("tenantId", "recipeVersionId", "position");
CREATE INDEX "RestaurantRecipeComponent_tenantId_ingredientId_idx" ON "RestaurantRecipeComponent"("tenantId", "ingredientId");
CREATE INDEX "RestaurantRecipeComponent_tenantId_subRecipeId_idx" ON "RestaurantRecipeComponent"("tenantId", "subRecipeId");
CREATE UNIQUE INDEX "RestaurantRecipeStep_recipeVersionId_stepNumber_key" ON "RestaurantRecipeStep"("recipeVersionId", "stepNumber");

ALTER TABLE "RestaurantRecipeVersion" ADD CONSTRAINT "RestaurantRecipeVersion_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "RestaurantRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantRecipeComponent" ADD CONSTRAINT "RestaurantRecipeComponent_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RestaurantRecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestaurantRecipeStep" ADD CONSTRAINT "RestaurantRecipeStep_recipeVersionId_fkey" FOREIGN KEY ("recipeVersionId") REFERENCES "RestaurantRecipeVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
