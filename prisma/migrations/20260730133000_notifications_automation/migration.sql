CREATE TYPE "NotificationCategory" AS ENUM ('GENERAL', 'ATS', 'ONBOARDING', 'TRAINING', 'INVENTORY', 'AUTOMATION', 'SECURITY', 'BILLING');
CREATE TYPE "NotificationChannel" AS ENUM ('INTERNAL', 'EMAIL');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'SKIPPED');
CREATE TYPE "NotificationDigestFrequency" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY', 'DISABLED');

ALTER TABLE "Notification"
  ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'GENERAL',
  ADD COLUMN "sourceModule" TEXT,
  ADD COLUMN "actionUrl" TEXT,
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "deduplicationKey" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "category" "NotificationCategory" NOT NULL,
  "internalEnabled" BOOLEAN NOT NULL DEFAULT true,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "frequency" "NotificationDigestFrequency" NOT NULL DEFAULT 'IMMEDIATE',
  "quietHoursStart" TEXT,
  "quietHoursEnd" TEXT,
  "timeZone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "notificationId" TEXT NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_tenantId_userId_deduplicationKey_key" ON "Notification"("tenantId", "userId", "deduplicationKey");
CREATE INDEX "Notification_tenantId_userId_category_createdAt_idx" ON "Notification"("tenantId", "userId", "category", "createdAt");
CREATE INDEX "Notification_correlationId_idx" ON "Notification"("correlationId");
CREATE UNIQUE INDEX "NotificationPreference_tenantId_userId_category_key" ON "NotificationPreference"("tenantId", "userId", "category");
CREATE INDEX "NotificationPreference_tenantId_userId_idx" ON "NotificationPreference"("tenantId", "userId");
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_channel_key" ON "NotificationDelivery"("notificationId", "channel");
CREATE INDEX "NotificationDelivery_tenantId_status_nextAttemptAt_idx" ON "NotificationDelivery"("tenantId", "status", "nextAttemptAt");
CREATE INDEX "NotificationDelivery_tenantId_userId_createdAt_idx" ON "NotificationDelivery"("tenantId", "userId", "createdAt");
CREATE INDEX "NotificationDelivery_correlationId_idx" ON "NotificationDelivery"("correlationId");

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
