CREATE TABLE "RestaurantGoodsReceiptHistory" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "statusBefore" "RestaurantDocumentStatus",
  "statusAfter" "RestaurantDocumentStatus",
  "actorId" TEXT NOT NULL,
  "reason" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantGoodsReceiptHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestaurantGoodsReceiptHistory_tenantId_receiptId_createdAt_idx"
  ON "RestaurantGoodsReceiptHistory"("tenantId", "receiptId", "createdAt");

ALTER TABLE "RestaurantGoodsReceiptHistory"
  ADD CONSTRAINT "RestaurantGoodsReceiptHistory_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "RestaurantGoodsReceipt"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
