CREATE TYPE "AtsConversationStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
CREATE TYPE "AtsInboundMatchStatus" AS ENUM ('UNMATCHED', 'LINKED', 'IGNORED');

ALTER TABLE "AtsMessage"
  ADD COLUMN "conversationId" TEXT,
  ADD COLUMN "internetMessageId" TEXT,
  ADD COLUMN "referencesHeader" TEXT;

CREATE TABLE "AtsConversation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "AtsConversationStatus" NOT NULL DEFAULT 'OPEN',
  "assignedUserId" TEXT,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "snoozedUntil" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AtsConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AtsMessageAttachment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "providerAttachmentId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER,
  "disposition" TEXT,
  "contentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AtsMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AtsUnmatchedInboundEmail" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "senderEmail" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "AtsInboundMatchStatus" NOT NULL DEFAULT 'UNMATCHED',
  "linkedApplicationId" TEXT,
  "resolvedByUserId" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "reason" TEXT,
  "attachments" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AtsUnmatchedInboundEmail_pkey" PRIMARY KEY ("id")
);

INSERT INTO "AtsConversation" (
  "id", "tenantId", "applicationId", "status", "unreadCount",
  "lastMessageAt", "lastInboundAt", "lastOutboundAt", "createdAt", "updatedAt"
)
SELECT
  m."applicationId",
  m."tenantId",
  m."applicationId",
  'OPEN'::"AtsConversationStatus",
  COUNT(*) FILTER (WHERE m."direction" = 'INBOUND' AND m."readAt" IS NULL)::INTEGER,
  MAX(m."createdAt"),
  MAX(m."createdAt") FILTER (WHERE m."direction" = 'INBOUND'),
  MAX(m."createdAt") FILTER (WHERE m."direction" = 'OUTBOUND'),
  MIN(m."createdAt"),
  MAX(m."updatedAt")
FROM "AtsMessage" m
GROUP BY m."applicationId", m."tenantId";

UPDATE "AtsMessage" SET "conversationId" = "applicationId";

CREATE UNIQUE INDEX "AtsConversation_applicationId_key" ON "AtsConversation"("applicationId");
CREATE INDEX "AtsConversation_tenantId_status_lastMessageAt_idx" ON "AtsConversation"("tenantId", "status", "lastMessageAt");
CREATE INDEX "AtsConversation_tenantId_assignedUserId_lastMessageAt_idx" ON "AtsConversation"("tenantId", "assignedUserId", "lastMessageAt");
CREATE INDEX "AtsConversation_tenantId_unreadCount_lastMessageAt_idx" ON "AtsConversation"("tenantId", "unreadCount", "lastMessageAt");
CREATE INDEX "AtsMessage_tenantId_conversationId_createdAt_idx" ON "AtsMessage"("tenantId", "conversationId", "createdAt");
CREATE UNIQUE INDEX "AtsMessageAttachment_messageId_providerAttachmentId_key" ON "AtsMessageAttachment"("messageId", "providerAttachmentId");
CREATE INDEX "AtsMessageAttachment_tenantId_messageId_idx" ON "AtsMessageAttachment"("tenantId", "messageId");
CREATE UNIQUE INDEX "AtsUnmatchedInboundEmail_tenantId_providerMessageId_key" ON "AtsUnmatchedInboundEmail"("tenantId", "providerMessageId");
CREATE INDEX "AtsUnmatchedInboundEmail_tenantId_status_occurredAt_idx" ON "AtsUnmatchedInboundEmail"("tenantId", "status", "occurredAt");

ALTER TABLE "AtsConversation" ADD CONSTRAINT "AtsConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsConversation" ADD CONSTRAINT "AtsConversation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsMessage" ADD CONSTRAINT "AtsMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AtsConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AtsMessageAttachment" ADD CONSTRAINT "AtsMessageAttachment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsMessageAttachment" ADD CONSTRAINT "AtsMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AtsMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsUnmatchedInboundEmail" ADD CONSTRAINT "AtsUnmatchedInboundEmail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
