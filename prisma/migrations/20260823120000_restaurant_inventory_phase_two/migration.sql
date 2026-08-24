-- CreateEnum
CREATE TYPE "RestaurantLotStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "RestaurantProductionStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RestaurantStockCountStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'REVIEW', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RestaurantTransferStatus" AS ENUM ('DRAFT', 'SENT', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "RestaurantGoodsReceiptItem" ADD COLUMN     "expirationDate" TIMESTAMP(3),
ADD COLUMN     "lotNumber" TEXT;

-- AlterTable
ALTER TABLE "RestaurantRecipe" ADD COLUMN     "outputIngredientId" TEXT;

-- AlterTable
ALTER TABLE "RestaurantInventoryMovement" ADD COLUMN     "lotId" TEXT;

-- CreateTable
CREATE TABLE "RestaurantInventoryLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "initialQuantity" DECIMAL(18,6) NOT NULL,
    "remainingQuantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "status" "RestaurantLotStatus" NOT NULL DEFAULT 'ACTIVE',
    "sourceReceiptItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantInventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantProductionOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(18,6) NOT NULL,
    "actualYield" DECIMAL(18,6),
    "status" "RestaurantProductionStatus" NOT NULL DEFAULT 'DRAFT',
    "productionDate" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantProductionOrderItem" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "direction" "RestaurantMovementDirection" NOT NULL,

    CONSTRAINT "RestaurantProductionOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantStockCount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "countNumber" TEXT NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL,
    "status" "RestaurantStockCountStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantStockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantStockCountItem" (
    "id" TEXT NOT NULL,
    "stockCountId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "systemQuantity" DECIMAL(18,6) NOT NULL,
    "countedQuantity" DECIMAL(18,6) NOT NULL,
    "varianceQuantity" DECIMAL(18,6) NOT NULL,
    "averageCost" DECIMAL(18,6) NOT NULL,
    "varianceValue" DECIMAL(18,6) NOT NULL,
    "reason" TEXT,
    "notes" TEXT,

    CONSTRAINT "RestaurantStockCountItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantStockTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourceBranchId" TEXT NOT NULL,
    "sourceWarehouseId" TEXT NOT NULL,
    "destinationBranchId" TEXT NOT NULL,
    "destinationWarehouseId" TEXT NOT NULL,
    "status" "RestaurantTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "sentBy" TEXT,
    "receivedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantStockTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantStockTransferItem" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "unitCost" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "RestaurantStockTransferItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantInventoryLot_tenantId_warehouseId_ingredientId_st_idx" ON "RestaurantInventoryLot"("tenantId", "warehouseId", "ingredientId", "status", "expirationDate", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantInventoryLot_tenantId_warehouseId_ingredientId_lo_key" ON "RestaurantInventoryLot"("tenantId", "warehouseId", "ingredientId", "lotNumber");

-- CreateIndex
CREATE INDEX "RestaurantProductionOrder_tenantId_branchId_warehouseId_sta_idx" ON "RestaurantProductionOrder"("tenantId", "branchId", "warehouseId", "status", "productionDate");

-- CreateIndex
CREATE INDEX "RestaurantProductionOrderItem_productionOrderId_idx" ON "RestaurantProductionOrderItem"("productionOrderId");

-- CreateIndex
CREATE INDEX "RestaurantStockCount_tenantId_warehouseId_status_countedAt_idx" ON "RestaurantStockCount"("tenantId", "warehouseId", "status", "countedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantStockCount_tenantId_countNumber_key" ON "RestaurantStockCount"("tenantId", "countNumber");

-- CreateIndex
CREATE INDEX "RestaurantStockCountItem_stockCountId_idx" ON "RestaurantStockCountItem"("stockCountId");

-- CreateIndex
CREATE INDEX "RestaurantStockTransfer_tenantId_status_sourceWarehouseId_d_idx" ON "RestaurantStockTransfer"("tenantId", "status", "sourceWarehouseId", "destinationWarehouseId");

-- CreateIndex
CREATE INDEX "RestaurantStockTransferItem_transferId_idx" ON "RestaurantStockTransferItem"("transferId");

-- AddForeignKey
ALTER TABLE "RestaurantProductionOrderItem" ADD CONSTRAINT "RestaurantProductionOrderItem_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "RestaurantProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantStockCountItem" ADD CONSTRAINT "RestaurantStockCountItem_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "RestaurantStockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantStockTransferItem" ADD CONSTRAINT "RestaurantStockTransferItem_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "RestaurantStockTransfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

