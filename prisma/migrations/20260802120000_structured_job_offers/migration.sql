CREATE TYPE "JobOfferStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "JobOfferVersionSource" AS ENUM ('EMPLOYER', 'CANDIDATE');
CREATE TYPE "JobOfferApprovalType" AS ENUM ('FINANCIAL', 'MANAGERIAL');
CREATE TYPE "JobOfferApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CompensationPeriodicity" AS ENUM ('HOURLY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'ANNUAL');

ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_CREATED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_APPROVED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_SENT';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_COUNTERED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_ACCEPTED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_REJECTED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'OFFER_EXPIRED';

ALTER TABLE "SignaturePackage" ALTER COLUMN "workflowId" DROP NOT NULL;
ALTER TABLE "SignaturePackage" ADD COLUMN "offerVersionId" TEXT;

CREATE TABLE "JobOffer" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "JobOfferStatus" NOT NULL DEFAULT 'DRAFT',
  "currentVersion" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "financialApproverId" TEXT,
  "managerialApproverId" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "expiredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "conversionWorkflowId" TEXT,
  "conversionError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobOfferVersion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "source" "JobOfferVersionSource" NOT NULL DEFAULT 'EMPLOYER',
  "salaryAmount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "periodicity" "CompensationPeriodicity" NOT NULL,
  "benefits" JSONB,
  "jobTitle" TEXT NOT NULL,
  "employmentStartDate" TIMESTAMP(3) NOT NULL,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "message" TEXT,
  "counterproposalReason" TEXT,
  "pdfSha256" TEXT,
  "pdfGeneratedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobOfferVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobOfferApproval" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "type" "JobOfferApprovalType" NOT NULL,
  "status" "JobOfferApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "approverId" TEXT,
  "decidedById" TEXT,
  "notes" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobOfferApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SignaturePackage_offerVersionId_key" ON "SignaturePackage"("offerVersionId");
CREATE INDEX "JobOffer_tenantId_branchId_status_idx" ON "JobOffer"("tenantId", "branchId", "status");
CREATE INDEX "JobOffer_applicationId_createdAt_idx" ON "JobOffer"("applicationId", "createdAt");
CREATE INDEX "JobOffer_tenantId_createdById_idx" ON "JobOffer"("tenantId", "createdById");
CREATE UNIQUE INDEX "JobOfferVersion_offerId_version_key" ON "JobOfferVersion"("offerId", "version");
CREATE INDEX "JobOfferVersion_tenantId_validUntil_idx" ON "JobOfferVersion"("tenantId", "validUntil");
CREATE UNIQUE INDEX "JobOfferApproval_offerId_version_type_key" ON "JobOfferApproval"("offerId", "version", "type");
CREATE INDEX "JobOfferApproval_tenantId_status_createdAt_idx" ON "JobOfferApproval"("tenantId", "status", "createdAt");
CREATE INDEX "JobOfferApproval_approverId_status_idx" ON "JobOfferApproval"("approverId", "status");

ALTER TABLE "JobOffer" ADD CONSTRAINT "JobOffer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobOfferVersion" ADD CONSTRAINT "JobOfferVersion_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "JobOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobOfferApproval" ADD CONSTRAINT "JobOfferApproval_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "JobOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SignaturePackage" ADD CONSTRAINT "SignaturePackage_offerVersionId_fkey" FOREIGN KEY ("offerVersionId") REFERENCES "JobOfferVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
