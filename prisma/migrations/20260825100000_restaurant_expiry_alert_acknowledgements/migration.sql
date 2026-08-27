CREATE TABLE "RestaurantExpiryAlertAcknowledgement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "lotId" TEXT NOT NULL,
  "acknowledgedBy" TEXT NOT NULL,
  "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RestaurantExpiryAlertAcknowledgement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestaurantExpiryAlertAcknowledgement_tenantId_lotId_key"
  ON "RestaurantExpiryAlertAcknowledgement"("tenantId", "lotId");
CREATE INDEX "RestaurantExpiryAlertAcknowledgement_tenantId_acknowledgedAt_idx"
  ON "RestaurantExpiryAlertAcknowledgement"("tenantId", "acknowledgedAt");
