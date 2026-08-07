ALTER TABLE "OnboardingTemplate"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "supersedesId" TEXT;

CREATE INDEX "OnboardingTemplate_tenantId_name_status_effectiveFrom_idx" ON "OnboardingTemplate"("tenantId", "name", "status", "effectiveFrom");
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "OnboardingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "OnboardingLibraryItem" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "type" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "content" JSONB NOT NULL, "countryCode" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingLibraryItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingLibraryItem_tenantId_type_name_key" ON "OnboardingLibraryItem"("tenantId", "type", "name");
CREATE INDEX "OnboardingLibraryItem_tenantId_type_isActive_idx" ON "OnboardingLibraryItem"("tenantId", "type", "isActive");
ALTER TABLE "OnboardingLibraryItem" ADD CONSTRAINT "OnboardingLibraryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnboardingRetentionPolicy" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "countryCode" TEXT NOT NULL, "documentCategory" TEXT NOT NULL, "retentionDays" INTEGER NOT NULL, "legalBasis" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingRetentionPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingRetentionPolicy_tenantId_countryCode_documentCategory_key" ON "OnboardingRetentionPolicy"("tenantId", "countryCode", "documentCategory");
CREATE INDEX "OnboardingRetentionPolicy_tenantId_countryCode_isActive_idx" ON "OnboardingRetentionPolicy"("tenantId", "countryCode", "isActive");
ALTER TABLE "OnboardingRetentionPolicy" ADD CONSTRAINT "OnboardingRetentionPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnboardingLegalHold" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "onboardingFlowId" TEXT NOT NULL, "reason" TEXT NOT NULL, "reference" TEXT, "status" TEXT NOT NULL DEFAULT 'ACTIVE', "placedById" TEXT NOT NULL, "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "releasedById" TEXT, "releasedAt" TIMESTAMP(3),
  CONSTRAINT "OnboardingLegalHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OnboardingLegalHold_tenantId_status_idx" ON "OnboardingLegalHold"("tenantId", "status");
CREATE INDEX "OnboardingLegalHold_onboardingFlowId_status_idx" ON "OnboardingLegalHold"("onboardingFlowId", "status");
ALTER TABLE "OnboardingLegalHold" ADD CONSTRAINT "OnboardingLegalHold_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingLegalHold" ADD CONSTRAINT "OnboardingLegalHold_onboardingFlowId_fkey" FOREIGN KEY ("onboardingFlowId") REFERENCES "OnboardingFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
