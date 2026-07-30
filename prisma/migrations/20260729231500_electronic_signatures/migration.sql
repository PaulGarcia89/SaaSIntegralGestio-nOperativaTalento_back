ALTER TABLE "SignaturePackage"
  ADD COLUMN "onboardingFlowId" TEXT,
  ADD COLUMN "templateId" TEXT,
  ADD COLUMN "dueDate" TIMESTAMP(3),
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "lastReminderAt" TIMESTAMP(3);

ALTER TABLE "SignatureParticipant"
  ADD COLUMN "consentedAt" TIMESTAMP(3),
  ADD COLUMN "signingTokenHash" TEXT,
  ADD COLUMN "tokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "consentVersion" TEXT,
  ADD COLUMN "ipHash" TEXT,
  ADD COLUMN "userAgentHash" TEXT,
  ADD COLUMN "evidence" JSONB,
  ADD COLUMN "lastReminderAt" TIMESTAMP(3);

CREATE TABLE "SignatureTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "provider" TEXT NOT NULL DEFAULT 'INTERNAL',
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "consentText" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SignatureTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SignatureAuditEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "packageId" TEXT NOT NULL,
  "participantId" TEXT,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "requestId" TEXT,
  "ipHash" TEXT,
  "userAgentHash" TEXT,
  "evidence" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SignatureAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignatureParticipant_signingTokenHash_key" ON "SignatureParticipant"("signingTokenHash");
CREATE UNIQUE INDEX "SignatureTemplate_tenantId_name_version_key" ON "SignatureTemplate"("tenantId", "name", "version");
CREATE INDEX "SignatureTemplate_tenantId_isActive_isDefault_idx" ON "SignatureTemplate"("tenantId", "isActive", "isDefault");
CREATE INDEX "SignatureAuditEvent_tenantId_packageId_occurredAt_idx" ON "SignatureAuditEvent"("tenantId", "packageId", "occurredAt");
CREATE INDEX "SignatureAuditEvent_participantId_occurredAt_idx" ON "SignatureAuditEvent"("participantId", "occurredAt");

ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_onboardingFlowId_fkey" FOREIGN KEY ("onboardingFlowId") REFERENCES "OnboardingFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "SignatureTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SignatureTemplate" ADD CONSTRAINT "SignatureTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignatureAuditEvent" ADD CONSTRAINT "SignatureAuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignatureAuditEvent" ADD CONSTRAINT "SignatureAuditEvent_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "SignaturePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
