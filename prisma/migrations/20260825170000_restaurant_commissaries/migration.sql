CREATE TYPE "RestaurantCommissaryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "RestaurantCommissary" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "centralBranchId" TEXT,
  "centralWarehouseId" TEXT,
  "productionCapacity" DECIMAL(18,6) NOT NULL,
  "productionCalendar" JSONB,
  "status" "RestaurantCommissaryStatus" NOT NULL DEFAULT 'INACTIVE',
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantCommissary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestaurantCommissary_tenantId_code_key" ON "RestaurantCommissary"("tenantId", "code");
CREATE INDEX "RestaurantCommissary_tenantId_status_name_idx" ON "RestaurantCommissary"("tenantId", "status", "name");
CREATE INDEX "RestaurantCommissary_tenantId_centralBranchId_centralWarehouseId_idx" ON "RestaurantCommissary"("tenantId", "centralBranchId", "centralWarehouseId");

CREATE TABLE "RestaurantCommissaryBranch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commissaryId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantCommissaryBranch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantCommissaryBranch_commissaryId_fkey" FOREIGN KEY ("commissaryId") REFERENCES "RestaurantCommissary"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantCommissaryBranch_tenantId_commissaryId_branchId_key" ON "RestaurantCommissaryBranch"("tenantId", "commissaryId", "branchId");
CREATE INDEX "RestaurantCommissaryBranch_tenantId_branchId_idx" ON "RestaurantCommissaryBranch"("tenantId", "branchId");

CREATE TABLE "RestaurantCommissaryIngredient" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commissaryId" TEXT NOT NULL,
  "ingredientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantCommissaryIngredient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantCommissaryIngredient_commissaryId_fkey" FOREIGN KEY ("commissaryId") REFERENCES "RestaurantCommissary"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantCommissaryIngredient_tenantId_commissaryId_ingredientId_key" ON "RestaurantCommissaryIngredient"("tenantId", "commissaryId", "ingredientId");
CREATE INDEX "RestaurantCommissaryIngredient_tenantId_ingredientId_idx" ON "RestaurantCommissaryIngredient"("tenantId", "ingredientId");

CREATE TABLE "RestaurantCommissaryRecipe" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "commissaryId" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantCommissaryRecipe_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RestaurantCommissaryRecipe_commissaryId_fkey" FOREIGN KEY ("commissaryId") REFERENCES "RestaurantCommissary"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RestaurantCommissaryRecipe_tenantId_commissaryId_recipeId_key" ON "RestaurantCommissaryRecipe"("tenantId", "commissaryId", "recipeId");
CREATE INDEX "RestaurantCommissaryRecipe_tenantId_recipeId_idx" ON "RestaurantCommissaryRecipe"("tenantId", "recipeId");
