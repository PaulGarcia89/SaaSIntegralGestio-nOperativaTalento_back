-- CreateEnum
CREATE TYPE "RestaurantInventoryUnitType" AS ENUM ('WEIGHT', 'VOLUME', 'UNIT');

-- CreateEnum
CREATE TYPE "RestaurantInventoryStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RestaurantDocumentStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RestaurantRecipeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RestaurantShift" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'NIGHT', 'OTHER');

-- CreateEnum
CREATE TYPE "RestaurantMovementType" AS ENUM ('GOODS_RECEIPT', 'CONSUMPTION', 'WASTE', 'REVERSAL', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RestaurantMovementDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "RestaurantStockPolicy" AS ENUM ('BLOCK', 'WARN', 'ALLOW_NEGATIVE');

-- CreateTable
CREATE TABLE "RestaurantInventoryCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantInventoryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantInventoryUnit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "type" "RestaurantInventoryUnitType" NOT NULL,
    "baseUnitId" TEXT,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "decimalPrecision" INTEGER NOT NULL DEFAULT 3,
    "status" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "RestaurantInventoryUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantInventoryWarehouse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantInventoryWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantInventorySupplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "taxId" TEXT,
    "status" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantInventorySupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantIngredient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "inventoryUnitId" TEXT NOT NULL,
    "purchaseUnitId" TEXT NOT NULL,
    "purchaseConversionFactor" DECIMAL(18,6) NOT NULL,
    "minimumStock" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "currentAverageCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "status" "RestaurantInventoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantGoodsReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "supplierInvoiceNumber" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "status" "RestaurantDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantGoodsReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantGoodsReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "purchaseQuantity" DECIMAL(18,6) NOT NULL,
    "purchaseUnitId" TEXT NOT NULL,
    "conversionFactor" DECIMAL(18,6) NOT NULL,
    "inventoryQuantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "RestaurantGoodsReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRecipe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT,
    "yieldQuantity" DECIMAL(18,6) NOT NULL,
    "yieldUnitId" TEXT NOT NULL,
    "sellingPrice" DECIMAL(18,6),
    "calculatedCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "requiredStockPolicy" "RestaurantStockPolicy" NOT NULL DEFAULT 'BLOCK',
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "RestaurantRecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantRecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "convertedInventoryQuantity" DECIMAL(18,6) NOT NULL,
    "wastePercentage" DECIMAL(8,4),
    "calculatedCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RestaurantRecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantConsumptionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "recordNumber" TEXT NOT NULL,
    "consumptionDate" TIMESTAMP(3) NOT NULL,
    "shift" "RestaurantShift" NOT NULL,
    "status" "RestaurantDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantConsumptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantConsumptionRecordItem" (
    "id" TEXT NOT NULL,
    "consumptionRecordId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipeVersion" INTEGER NOT NULL,
    "quantitySold" DECIMAL(18,6) NOT NULL,
    "unitCostSnapshot" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "RestaurantConsumptionRecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantWasteRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "wasteNumber" TEXT NOT NULL,
    "wasteDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RestaurantDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "RestaurantWasteRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantWasteRecordItem" (
    "id" TEXT NOT NULL,
    "wasteRecordId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitId" TEXT NOT NULL,
    "convertedInventoryQuantity" DECIMAL(18,6) NOT NULL,
    "unitCostSnapshot" DECIMAL(18,6) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RestaurantWasteRecordItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantInventoryMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "movementType" "RestaurantMovementType" NOT NULL,
    "direction" "RestaurantMovementDirection" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "totalCost" DECIMAL(18,6) NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "reversalOfMovementId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "RestaurantInventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantInventoryBalance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantityOnHand" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "averageCost" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantInventoryBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantInventoryCategory_tenantId_status_idx" ON "RestaurantInventoryCategory"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantInventoryCategory_tenantId_name_key" ON "RestaurantInventoryCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "RestaurantInventoryUnit_tenantId_type_idx" ON "RestaurantInventoryUnit"("tenantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantInventoryUnit_tenantId_abbreviation_key" ON "RestaurantInventoryUnit"("tenantId", "abbreviation");

-- CreateIndex
CREATE INDEX "RestaurantInventoryWarehouse_tenantId_branchId_status_idx" ON "RestaurantInventoryWarehouse"("tenantId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantInventoryWarehouse_tenantId_code_key" ON "RestaurantInventoryWarehouse"("tenantId", "code");

-- CreateIndex
CREATE INDEX "RestaurantInventorySupplier_tenantId_status_idx" ON "RestaurantInventorySupplier"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RestaurantIngredient_tenantId_status_name_idx" ON "RestaurantIngredient"("tenantId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantIngredient_tenantId_sku_key" ON "RestaurantIngredient"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "RestaurantGoodsReceipt_tenantId_branchId_warehouseId_status_idx" ON "RestaurantGoodsReceipt"("tenantId", "branchId", "warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantGoodsReceipt_tenantId_receiptNumber_key" ON "RestaurantGoodsReceipt"("tenantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "RestaurantGoodsReceiptItem_receiptId_idx" ON "RestaurantGoodsReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "RestaurantGoodsReceiptItem_ingredientId_idx" ON "RestaurantGoodsReceiptItem"("ingredientId");

-- CreateIndex
CREATE INDEX "RestaurantRecipe_tenantId_branchId_status_idx" ON "RestaurantRecipe"("tenantId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantRecipe_tenantId_code_version_key" ON "RestaurantRecipe"("tenantId", "code", "version");

-- CreateIndex
CREATE INDEX "RestaurantRecipeIngredient_recipeId_position_idx" ON "RestaurantRecipeIngredient"("recipeId", "position");

-- CreateIndex
CREATE INDEX "RestaurantRecipeIngredient_ingredientId_idx" ON "RestaurantRecipeIngredient"("ingredientId");

-- CreateIndex
CREATE INDEX "RestaurantConsumptionRecord_tenantId_branchId_warehouseId_c_idx" ON "RestaurantConsumptionRecord"("tenantId", "branchId", "warehouseId", "consumptionDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantConsumptionRecord_tenantId_recordNumber_key" ON "RestaurantConsumptionRecord"("tenantId", "recordNumber");

-- CreateIndex
CREATE INDEX "RestaurantConsumptionRecordItem_consumptionRecordId_idx" ON "RestaurantConsumptionRecordItem"("consumptionRecordId");

-- CreateIndex
CREATE INDEX "RestaurantWasteRecord_tenantId_branchId_warehouseId_wasteDa_idx" ON "RestaurantWasteRecord"("tenantId", "branchId", "warehouseId", "wasteDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantWasteRecord_tenantId_wasteNumber_key" ON "RestaurantWasteRecord"("tenantId", "wasteNumber");

-- CreateIndex
CREATE INDEX "RestaurantWasteRecordItem_wasteRecordId_idx" ON "RestaurantWasteRecordItem"("wasteRecordId");

-- CreateIndex
CREATE INDEX "RestaurantInventoryMovement_tenantId_branchId_warehouseId_i_idx" ON "RestaurantInventoryMovement"("tenantId", "branchId", "warehouseId", "ingredientId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantInventoryMovement_tenantId_referenceType_referenc_key" ON "RestaurantInventoryMovement"("tenantId", "referenceType", "referenceId", "ingredientId", "movementType");

-- CreateIndex
CREATE INDEX "RestaurantInventoryBalance_tenantId_warehouseId_quantityOnH_idx" ON "RestaurantInventoryBalance"("tenantId", "warehouseId", "quantityOnHand");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantInventoryBalance_tenantId_branchId_warehouseId_in_key" ON "RestaurantInventoryBalance"("tenantId", "branchId", "warehouseId", "ingredientId");

-- AddForeignKey
ALTER TABLE "RestaurantGoodsReceiptItem" ADD CONSTRAINT "RestaurantGoodsReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "RestaurantGoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantRecipeIngredient" ADD CONSTRAINT "RestaurantRecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "RestaurantRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantConsumptionRecordItem" ADD CONSTRAINT "RestaurantConsumptionRecordItem_consumptionRecordId_fkey" FOREIGN KEY ("consumptionRecordId") REFERENCES "RestaurantConsumptionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantWasteRecordItem" ADD CONSTRAINT "RestaurantWasteRecordItem_wasteRecordId_fkey" FOREIGN KEY ("wasteRecordId") REFERENCES "RestaurantWasteRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

