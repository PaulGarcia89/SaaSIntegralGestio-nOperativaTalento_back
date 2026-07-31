CREATE TYPE "AtsCommunicationType" AS ENUM (
  'APPLICATION_CONFIRMATION',
  'STAGE_UPDATE',
  'REJECTION',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_REMINDER',
  'INTERVIEW_RESCHEDULED',
  'INTERVIEW_CANCELLED',
  'OFFER',
  'APPROVAL_REQUEST',
  'MANUAL'
);

CREATE TYPE "AtsCommunicationAudience" AS ENUM ('CANDIDATE', 'RESPONSIBLE');
CREATE TYPE "AtsMessageStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');

ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'INTERVIEW_RESCHEDULED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'INTERVIEW_CANCELLED';

ALTER TABLE "NotificationDelivery" ADD COLUMN "recipientEmail" TEXT;

CREATE TABLE "AtsCommunicationTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT,
  "stageCode" TEXT,
  "type" "AtsCommunicationType" NOT NULL,
  "audience" "AtsCommunicationAudience" NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AtsCommunicationTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AtsMessage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "interviewId" TEXT,
  "notificationId" TEXT,
  "templateId" TEXT,
  "templateVersion" INTEGER,
  "type" "AtsCommunicationType" NOT NULL,
  "audience" "AtsCommunicationAudience" NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "recipientUserId" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "AtsMessageStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "providerMessageId" TEXT,
  "lastError" TEXT,
  "correlationId" TEXT,
  "deduplicationKey" TEXT NOT NULL,
  "createdByType" TEXT NOT NULL DEFAULT 'SYSTEM',
  "createdById" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AtsMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtsCommunicationTemplate_tenantId_vacancyId_stageCode_type_audience_version_key"
ON "AtsCommunicationTemplate"("tenantId", "vacancyId", "stageCode", "type", "audience", "version");
CREATE INDEX "AtsCommunicationTemplate_tenantId_type_audience_isActive_idx"
ON "AtsCommunicationTemplate"("tenantId", "type", "audience", "isActive");
CREATE INDEX "AtsCommunicationTemplate_tenantId_vacancyId_stageCode_idx"
ON "AtsCommunicationTemplate"("tenantId", "vacancyId", "stageCode");

CREATE UNIQUE INDEX "AtsMessage_tenantId_deduplicationKey_key"
ON "AtsMessage"("tenantId", "deduplicationKey");
CREATE UNIQUE INDEX "AtsMessage_notificationId_key" ON "AtsMessage"("notificationId");
CREATE INDEX "AtsMessage_tenantId_applicationId_createdAt_idx"
ON "AtsMessage"("tenantId", "applicationId", "createdAt");
CREATE INDEX "AtsMessage_tenantId_status_nextAttemptAt_idx"
ON "AtsMessage"("tenantId", "status", "nextAttemptAt");
CREATE INDEX "AtsMessage_tenantId_recipientEmail_createdAt_idx"
ON "AtsMessage"("tenantId", "recipientEmail", "createdAt");
CREATE INDEX "AtsMessage_interviewId_type_idx" ON "AtsMessage"("interviewId", "type");

ALTER TABLE "AtsCommunicationTemplate" ADD CONSTRAINT "AtsCommunicationTemplate_vacancyId_fkey"
FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsMessage" ADD CONSTRAINT "AtsMessage_vacancyId_fkey"
FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtsMessage" ADD CONSTRAINT "AtsMessage_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AtsMessage" ADD CONSTRAINT "AtsMessage_interviewId_fkey"
FOREIGN KEY ("interviewId") REFERENCES "ApplicationInterview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AtsMessage" ADD CONSTRAINT "AtsMessage_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "AtsCommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AtsMessage" ADD CONSTRAINT "AtsMessage_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
