ALTER TABLE "RestaurantInventorySupplier" ADD COLUMN "leadTimeDays" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "RestaurantIngredient" ADD COLUMN "parLevel" DECIMAL(18,6) NOT NULL DEFAULT 0;
ALTER TABLE "RestaurantIngredient" ADD COLUMN "targetCoverageDays" DECIMAL(10,2) NOT NULL DEFAULT 7;
ALTER TABLE "RestaurantGoodsReceipt" ADD COLUMN "purchaseOrderId" TEXT;
ALTER TABLE "RestaurantGoodsReceiptItem" ADD COLUMN "purchaseOrderLineId" TEXT;

CREATE TYPE "RestaurantPurchaseOrderStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','SENT','PARTIALLY_RECEIVED','RECEIVED','REJECTED','CANCELLED');
CREATE TYPE "RestaurantPurchaseDifferenceType" AS ENUM ('QUANTITY_SHORTAGE','QUANTITY_EXCESS','PRICE_INCREASE','PRICE_DECREASE','UNIT_MISMATCH','UNEXPECTED_ITEM','INVOICE_QTY_MISMATCH','INVOICE_PRICE_MISMATCH','INVOICE_TOTAL_MISMATCH','SUPPLIER_MISMATCH','PURCHASE_ORDER_MISMATCH','UNMATCHED_LINE');
CREATE TYPE "RestaurantPurchaseDifferenceStatus" AS ENUM ('WITHIN_TOLERANCE','REVIEW_REQUIRED','APPROVED','REJECTED');
CREATE TYPE "RestaurantInvoiceStatus" AS ENUM ('UPLOADED','PROCESSING','REVIEW_REQUIRED','MATCHED','APPROVED','REJECTED','FAILED');

CREATE TABLE "RestaurantPurchaseOrder" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "supplierId" TEXT NOT NULL,
  "code" TEXT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'USD', "expectedAt" TIMESTAMP(3), "notes" TEXT,
  "totalAmount" DECIMAL(18,6) NOT NULL DEFAULT 0, "status" "RestaurantPurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "createdBy" TEXT NOT NULL, "submittedBy" TEXT, "submittedAt" TIMESTAMP(3), "approvedBy" TEXT, "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT, "rejectedAt" TIMESTAMP(3), "cancelledBy" TEXT, "cancelledAt" TIMESTAMP(3), "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantPurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestaurantPurchaseOrder_tenantId_code_key" ON "RestaurantPurchaseOrder"("tenantId","code");
CREATE INDEX "RestaurantPurchaseOrder_scope_status_idx" ON "RestaurantPurchaseOrder"("tenantId","branchId","warehouseId","status");

CREATE TABLE "RestaurantPurchaseOrderLine" (
  "id" TEXT NOT NULL, "purchaseOrderId" TEXT NOT NULL, "ingredientId" TEXT NOT NULL, "unitId" TEXT NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL, "unitCost" DECIMAL(18,6) NOT NULL, "receivedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(18,6) NOT NULL, CONSTRAINT "RestaurantPurchaseOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantPurchaseOrderLine_order_idx" ON "RestaurantPurchaseOrderLine"("purchaseOrderId");
CREATE INDEX "RestaurantPurchaseOrderLine_ingredient_idx" ON "RestaurantPurchaseOrderLine"("ingredientId");
ALTER TABLE "RestaurantPurchaseOrderLine" ADD CONSTRAINT "RestaurantPurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "RestaurantPurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "RestaurantPurchaseOrderDifference" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "purchaseOrderId" TEXT NOT NULL, "purchaseOrderLineId" TEXT,
  "receiptId" TEXT, "differenceType" "RestaurantPurchaseDifferenceType" NOT NULL, "orderedQuantity" DECIMAL(18,6) NOT NULL,
  "receivedQuantity" DECIMAL(18,6) NOT NULL, "orderedUnitCost" DECIMAL(18,6) NOT NULL, "receivedUnitCost" DECIMAL(18,6) NOT NULL,
  "quantityDifference" DECIMAL(18,6) NOT NULL, "priceDifference" DECIMAL(18,6) NOT NULL, "quantityDifferencePercent" DECIMAL(10,4) NOT NULL,
  "priceDifferencePercent" DECIMAL(10,4) NOT NULL, "tolerancePercent" DECIMAL(10,4) NOT NULL DEFAULT 0,
  "status" "RestaurantPurchaseDifferenceStatus" NOT NULL DEFAULT 'REVIEW_REQUIRED', "reason" TEXT, "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3), "rejectedBy" TEXT, "rejectedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantPurchaseOrderDifference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantPurchaseOrderDifference_scope_idx" ON "RestaurantPurchaseOrderDifference"("tenantId","purchaseOrderId","status");

CREATE TABLE "RestaurantPurchasePriceHistory" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT, "warehouseId" TEXT, "ingredientId" TEXT NOT NULL,
  "supplierId" TEXT, "unitId" TEXT NOT NULL, "purchaseUnitCost" DECIMAL(18,6) NOT NULL, "inventoryUnitCost" DECIMAL(18,6) NOT NULL,
  "quantity" DECIMAL(18,6) NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL, "purchasedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RestaurantPurchasePriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantPurchasePriceHistory_ingredient_idx" ON "RestaurantPurchasePriceHistory"("tenantId","ingredientId","purchasedAt");
CREATE INDEX "RestaurantPurchasePriceHistory_supplier_idx" ON "RestaurantPurchasePriceHistory"("tenantId","supplierId","purchasedAt");

CREATE TABLE "RestaurantInvoice" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL, "warehouseId" TEXT NOT NULL, "supplierId" TEXT,
  "supplierName" TEXT, "invoiceNumber" TEXT, "invoiceDate" TIMESTAMP(3), "currency" TEXT NOT NULL DEFAULT 'USD',
  "subtotal" DECIMAL(18,6), "taxAmount" DECIMAL(18,6), "totalAmount" DECIMAL(18,6), "confidence" DECIMAL(10,6),
  "fileName" TEXT NOT NULL, "fileHash" TEXT NOT NULL, "fileStorageKey" TEXT NOT NULL, "status" "RestaurantInvoiceStatus" NOT NULL DEFAULT 'UPLOADED',
  "purchaseOrderId" TEXT, "receiptId" TEXT, "ocrPayload" JSONB, "createdBy" TEXT NOT NULL, "processedBy" TEXT, "approvedBy" TEXT,
  "rejectedBy" TEXT, "processedAt" TIMESTAMP(3), "approvedAt" TIMESTAMP(3), "rejectedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "RestaurantInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestaurantInvoice_tenant_supplier_invoice_key" ON "RestaurantInvoice"("tenantId","supplierId","invoiceNumber");
CREATE INDEX "RestaurantInvoice_scope_status_idx" ON "RestaurantInvoice"("tenantId","branchId","warehouseId","status");
CREATE INDEX "RestaurantInvoice_hash_idx" ON "RestaurantInvoice"("tenantId","fileHash");

CREATE TABLE "RestaurantInvoiceLine" (
  "id" TEXT NOT NULL, "invoiceId" TEXT NOT NULL, "externalSku" TEXT, "description" TEXT, "quantity" DECIMAL(18,6) NOT NULL,
  "unit" TEXT, "unitCost" DECIMAL(18,6) NOT NULL, "totalCost" DECIMAL(18,6) NOT NULL, "ingredientId" TEXT, "purchaseOrderLineId" TEXT,
  CONSTRAINT "RestaurantInvoiceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantInvoiceLine_invoice_idx" ON "RestaurantInvoiceLine"("invoiceId");
ALTER TABLE "RestaurantInvoiceLine" ADD CONSTRAINT "RestaurantInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "RestaurantInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
