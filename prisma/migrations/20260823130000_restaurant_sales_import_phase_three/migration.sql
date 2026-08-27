-- CreateEnum
CREATE TYPE "SalesImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'REQUIRES_MAPPING', 'READY', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SalesImportRowStatus" AS ENUM ('VALID', 'INVALID', 'DUPLICATE', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExternalMappingStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "RestaurantConsumptionRecord" ADD COLUMN     "salesImportId" TEXT;

-- AlterTable
ALTER TABLE "RestaurantConsumptionRecordItem" ADD COLUMN     "salesImportRowId" TEXT;

-- CreateTable
CREATE TABLE "RestaurantSalesImport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "fileStorageKey" TEXT NOT NULL,
    "importDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesDateFrom" TIMESTAMP(3),
    "salesDateTo" TIMESTAMP(3),
    "status" "SalesImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "processedBy" TEXT,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "RestaurantSalesImport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantSalesImportRow" (
    "id" TEXT NOT NULL,
    "salesImportId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "externalSaleId" TEXT NOT NULL,
    "externalProductCode" TEXT NOT NULL,
    "externalProductName" TEXT,
    "quantity" DECIMAL(18,6) NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "recipeId" TEXT,
    "validationStatus" "SalesImportRowStatus" NOT NULL DEFAULT 'INVALID',
    "validationErrors" JSONB,
    "rawData" JSONB,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "RestaurantSalesImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestaurantExternalProductMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT,
    "externalSystem" TEXT NOT NULL,
    "externalProductCode" TEXT NOT NULL,
    "externalProductName" TEXT,
    "recipeId" TEXT NOT NULL,
    "status" "ExternalMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantExternalProductMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RestaurantSalesImport_tenantId_branchId_status_importDate_idx" ON "RestaurantSalesImport"("tenantId", "branchId", "status", "importDate");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesImport_tenantId_fileHash_key" ON "RestaurantSalesImport"("tenantId", "fileHash");

-- CreateIndex
CREATE INDEX "RestaurantSalesImportRow_salesImportId_validationStatus_idx" ON "RestaurantSalesImportRow"("salesImportId", "validationStatus");

-- CreateIndex
CREATE INDEX "RestaurantSalesImportRow_externalSaleId_externalProductCode_idx" ON "RestaurantSalesImportRow"("externalSaleId", "externalProductCode");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantSalesImportRow_salesImportId_rowNumber_key" ON "RestaurantSalesImportRow"("salesImportId", "rowNumber");

-- CreateIndex
CREATE INDEX "RestaurantExternalProductMapping_tenantId_externalSystem_st_idx" ON "RestaurantExternalProductMapping"("tenantId", "externalSystem", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantExternalProductMapping_tenantId_branchId_external_key" ON "RestaurantExternalProductMapping"("tenantId", "branchId", "externalSystem", "externalProductCode");

-- AddForeignKey
ALTER TABLE "RestaurantSalesImportRow" ADD CONSTRAINT "RestaurantSalesImportRow_salesImportId_fkey" FOREIGN KEY ("salesImportId") REFERENCES "RestaurantSalesImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

