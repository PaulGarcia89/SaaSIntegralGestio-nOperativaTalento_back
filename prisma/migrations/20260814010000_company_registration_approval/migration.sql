CREATE TYPE "CompanyRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "CompanyRegistrationRequest" (
  "id" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "branchName" TEXT NOT NULL,
  "branchLocation" TEXT NOT NULL,
  "adminName" TEXT NOT NULL,
  "adminEmail" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "plan" "PlanCode" NOT NULL,
  "status" "CompanyRegistrationStatus" NOT NULL DEFAULT 'PENDING',
  "termsVersion" TEXT NOT NULL,
  "privacyVersion" TEXT NOT NULL,
  "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
  "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
  "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  "requestIpHash" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "approvedTenantId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompanyRegistrationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyRegistrationRequest_idempotencyKey_key" ON "CompanyRegistrationRequest"("idempotencyKey");
CREATE UNIQUE INDEX "CompanyRegistrationRequest_approvedTenantId_key" ON "CompanyRegistrationRequest"("approvedTenantId");
CREATE INDEX "CompanyRegistrationRequest_status_createdAt_idx" ON "CompanyRegistrationRequest"("status", "createdAt");
CREATE INDEX "CompanyRegistrationRequest_adminEmail_status_idx" ON "CompanyRegistrationRequest"("adminEmail", "status");
