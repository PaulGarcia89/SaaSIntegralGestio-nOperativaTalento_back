CREATE TYPE "TalentCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TalentRecipientStatus" AS ENUM ('PENDING', 'QUEUED', 'SKIPPED');
CREATE TYPE "TalentSequenceEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED', 'CANCELLED');

CREATE TABLE "TalentSegment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "filters" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentSegment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TalentSegment_tenantId_name_key" ON "TalentSegment"("tenantId", "name");
CREATE INDEX "TalentSegment_tenantId_isActive_idx" ON "TalentSegment"("tenantId", "isActive");
ALTER TABLE "TalentSegment" ADD CONSTRAINT "TalentSegment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TalentCampaign" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "segmentId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "TalentCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "launchedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TalentCampaign_tenantId_status_scheduledAt_idx" ON "TalentCampaign"("tenantId", "status", "scheduledAt");
CREATE INDEX "TalentCampaign_segmentId_createdAt_idx" ON "TalentCampaign"("segmentId", "createdAt");
ALTER TABLE "TalentCampaign" ADD CONSTRAINT "TalentCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentCampaign" ADD CONSTRAINT "TalentCampaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TalentSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TalentCampaignRecipient" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "messageId" TEXT,
  "status" "TalentRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "skipReason" TEXT,
  "queuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentCampaignRecipient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TalentCampaignRecipient_messageId_key" ON "TalentCampaignRecipient"("messageId");
CREATE UNIQUE INDEX "TalentCampaignRecipient_campaignId_candidateId_key" ON "TalentCampaignRecipient"("campaignId", "candidateId");
CREATE INDEX "TalentCampaignRecipient_tenantId_status_createdAt_idx" ON "TalentCampaignRecipient"("tenantId", "status", "createdAt");
ALTER TABLE "TalentCampaignRecipient" ADD CONSTRAINT "TalentCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "TalentCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentCampaignRecipient" ADD CONSTRAINT "TalentCampaignRecipient_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentCampaignRecipient" ADD CONSTRAINT "TalentCampaignRecipient_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "AtsMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TalentSequence" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "segmentId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentSequence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TalentSequence_tenantId_name_key" ON "TalentSequence"("tenantId", "name");
CREATE INDEX "TalentSequence_tenantId_isActive_idx" ON "TalentSequence"("tenantId", "isActive");
ALTER TABLE "TalentSequence" ADD CONSTRAINT "TalentSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentSequence" ADD CONSTRAINT "TalentSequence_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TalentSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TalentSequenceStep" (
  "id" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "delayHours" INTEGER NOT NULL DEFAULT 0,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentSequenceStep_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TalentSequenceStep_sequenceId_position_key" ON "TalentSequenceStep"("sequenceId", "position");
ALTER TABLE "TalentSequenceStep" ADD CONSTRAINT "TalentSequenceStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "TalentSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TalentSequenceEnrollment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sequenceId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "nextPosition" INTEGER NOT NULL DEFAULT 0,
  "status" "TalentSequenceEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "nextRunAt" TIMESTAMP(3) NOT NULL,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentSequenceEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TalentSequenceEnrollment_sequenceId_candidateId_key" ON "TalentSequenceEnrollment"("sequenceId", "candidateId");
CREATE INDEX "TalentSequenceEnrollment_tenantId_status_nextRunAt_idx" ON "TalentSequenceEnrollment"("tenantId", "status", "nextRunAt");
ALTER TABLE "TalentSequenceEnrollment" ADD CONSTRAINT "TalentSequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "TalentSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentSequenceEnrollment" ADD CONSTRAINT "TalentSequenceEnrollment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
