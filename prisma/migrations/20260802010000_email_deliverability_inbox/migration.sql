CREATE TYPE "AtsMessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');
CREATE TYPE "CommunicationDomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');
CREATE TYPE "CommunicationEventType" AS ENUM ('SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'UNSUBSCRIBED', 'INBOUND');

ALTER TABLE "NotificationDelivery" ADD COLUMN "openedAt" TIMESTAMP(3);
ALTER TABLE "NotificationDelivery" ADD COLUMN "clickedAt" TIMESTAMP(3);
ALTER TABLE "NotificationDelivery" ADD COLUMN "bouncedAt" TIMESTAMP(3);
ALTER TABLE "NotificationDelivery" ADD COLUMN "complainedAt" TIMESTAMP(3);
ALTER TABLE "NotificationDelivery" ADD COLUMN "unsubscribedAt" TIMESTAMP(3);

ALTER TABLE "AtsMessage" ADD COLUMN "direction" "AtsMessageDirection" NOT NULL DEFAULT 'OUTBOUND';
ALTER TABLE "AtsMessage" ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL';
ALTER TABLE "AtsMessage" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "AtsMessage" ADD COLUMN "inReplyToMessageId" TEXT;
ALTER TABLE "AtsMessage" ADD COLUMN "readAt" TIMESTAMP(3);
CREATE INDEX "AtsMessage_tenantId_direction_channel_createdAt_idx" ON "AtsMessage"("tenantId", "direction", "channel", "createdAt");
CREATE INDEX "AtsMessage_tenantId_providerMessageId_idx" ON "AtsMessage"("tenantId", "providerMessageId");

CREATE TABLE "CommunicationDomain" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "domain" TEXT NOT NULL, "fromName" TEXT NOT NULL, "fromEmail" TEXT NOT NULL,
  "replyToEmail" TEXT, "dkimSelector" TEXT NOT NULL DEFAULT 'resend', "status" "CommunicationDomainStatus" NOT NULL DEFAULT 'PENDING',
  "spfVerified" BOOLEAN NOT NULL DEFAULT false, "dkimVerified" BOOLEAN NOT NULL DEFAULT false, "dmarcVerified" BOOLEAN NOT NULL DEFAULT false,
  "reputationScore" DECIMAL(5,2), "deliveryRate" DECIMAL(5,2), "bounceRate" DECIMAL(5,2), "complaintRate" DECIMAL(5,2), "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationDomain_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommunicationDomain_tenantId_key" ON "CommunicationDomain"("tenantId");
CREATE INDEX "CommunicationDomain_status_lastCheckedAt_idx" ON "CommunicationDomain"("status", "lastCheckedAt");

CREATE TABLE "CandidateChannelPreference" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "candidateId" TEXT NOT NULL, "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "preferredChannel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL', "marketingEnabled" BOOLEAN NOT NULL DEFAULT false, "unsubscribedAt" TIMESTAMP(3), "unsubscribeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateChannelPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateChannelPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CandidateChannelPreference_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CandidateChannelPreference_tenantId_candidateId_key" ON "CandidateChannelPreference"("tenantId", "candidateId");
CREATE INDEX "CandidateChannelPreference_tenantId_preferredChannel_idx" ON "CandidateChannelPreference"("tenantId", "preferredChannel");

CREATE TABLE "CommunicationEvent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "deliveryId" TEXT, "provider" TEXT NOT NULL, "providerEventId" TEXT NOT NULL,
  "providerMessageId" TEXT, "type" "CommunicationEventType" NOT NULL, "occurredAt" TIMESTAMP(3) NOT NULL, "payload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunicationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunicationEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunicationEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommunicationEvent_provider_providerEventId_key" ON "CommunicationEvent"("provider", "providerEventId");
CREATE INDEX "CommunicationEvent_tenantId_type_occurredAt_idx" ON "CommunicationEvent"("tenantId", "type", "occurredAt");
CREATE INDEX "CommunicationEvent_providerMessageId_idx" ON "CommunicationEvent"("providerMessageId");
