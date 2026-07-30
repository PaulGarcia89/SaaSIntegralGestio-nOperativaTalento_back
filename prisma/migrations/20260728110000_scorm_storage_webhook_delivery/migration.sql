ALTER TABLE "TrainingScormPackage" ADD COLUMN "storagePath" TEXT, ADD COLUMN "fileSize" INTEGER;
ALTER TABLE "TrainingWebhook" ADD COLUMN "secretEncrypted" TEXT;

CREATE TABLE "TrainingWebhookDelivery" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "webhookId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "responseStatus" INTEGER,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingWebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "TrainingWebhook"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "TrainingWebhookDelivery_webhookId_eventId_key" ON "TrainingWebhookDelivery"("webhookId","eventId");
CREATE INDEX "TrainingWebhookDelivery_tenantId_status_nextAttemptAt_idx" ON "TrainingWebhookDelivery"("tenantId","status","nextAttemptAt");
