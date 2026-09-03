CREATE TYPE "HiringContractStatus" AS ENUM ('DRAFT', 'DATA_REVIEW', 'OFFER_PREPARATION', 'OFFER_SENT', 'AWAITING_OFFER_RESPONSE', 'OFFER_ACCEPTED', 'DOCUMENTS_PENDING', 'SIGNATURES_PENDING', 'COMPLIANCE_REVIEW', 'READY_TO_HIRE', 'HIRED', 'CANCELLED');
CREATE TYPE "HiringContractDocumentStatus" AS ENUM ('REQUIRED', 'REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SIGNED', 'WAIVED');
CREATE TYPE "HiringContractDocumentSource" AS ENUM ('CANDIDATE', 'DOCUSEAL', 'INTERNAL', 'IMPORT');
CREATE TYPE "HiringContractDocumentType" AS ENUM ('IDENTIFICATION', 'TAX', 'ELIGIBILITY', 'AGREEMENT', 'POLICY', 'LICENSE', 'OTHER');

CREATE TABLE "HiringContract" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "companyId" TEXT,
  "branchId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "jobOfferId" TEXT,
  "jobOfferVersionId" TEXT,
  "employeeId" TEXT,
  "onboardingFlowId" TEXT,
  "hiringManagerUserId" TEXT,
  "hrResponsibleUserId" TEXT,
  "roleTitle" TEXT,
  "status" "HiringContractStatus" NOT NULL DEFAULT 'DRAFT',
  "currentStage" TEXT NOT NULL DEFAULT 'draft',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "currentActor" TEXT,
  "nextAction" TEXT,
  "nextActor" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "offerSnapshot" JSONB,
  "reviewSummary" JSONB,
  "complianceSummary" JSONB,
  "hiredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiringContract_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HiringContractDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "employeeId" TEXT,
  "employeeDocumentId" TEXT,
  "type" "HiringContractDocumentType" NOT NULL,
  "status" "HiringContractDocumentStatus" NOT NULL DEFAULT 'REQUIRED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "source" "HiringContractDocumentSource" NOT NULL DEFAULT 'INTERNAL',
  "title" TEXT NOT NULL,
  "originalName" TEXT,
  "storageKey" TEXT,
  "mimeType" TEXT,
  "sizeBytes" INTEGER,
  "checksum" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "requiredReason" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiringContractDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HiringContractSignatureRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "signaturePackageId" TEXT,
  "provider" TEXT NOT NULL DEFAULT 'DOCUSEAL',
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "externalReference" TEXT,
  "evidence" JSONB,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "HiringContractSignatureRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HiringContractStateEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "previousState" TEXT,
  "nextState" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "actorUserId" TEXT,
  "actorRole" TEXT,
  "changes" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HiringContractStateEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HiringContract_active_tenantId_applicationId_key" ON "HiringContract"("tenantId", "applicationId") WHERE "isActive" = true;
CREATE UNIQUE INDEX "HiringContract_tenantId_jobOfferId_key" ON "HiringContract"("tenantId", "jobOfferId");
CREATE UNIQUE INDEX "HiringContract_onboardingFlowId_key" ON "HiringContract"("onboardingFlowId");
CREATE INDEX "HiringContract_tenantId_branchId_status_idx" ON "HiringContract"("tenantId", "branchId", "status");
CREATE INDEX "HiringContract_tenantId_candidateId_idx" ON "HiringContract"("tenantId", "candidateId");
CREATE INDEX "HiringContract_tenantId_vacancyId_idx" ON "HiringContract"("tenantId", "vacancyId");
CREATE INDEX "HiringContract_tenantId_employeeId_idx" ON "HiringContract"("tenantId", "employeeId");
CREATE INDEX "HiringContract_tenantId_createdAt_idx" ON "HiringContract"("tenantId", "createdAt");

CREATE UNIQUE INDEX "HiringContractDocument_contractId_type_version_key" ON "HiringContractDocument"("contractId", "type", "version");
CREATE INDEX "HiringContractDocument_tenantId_contractId_status_idx" ON "HiringContractDocument"("tenantId", "contractId", "status");
CREATE INDEX "HiringContractDocument_tenantId_employeeId_idx" ON "HiringContractDocument"("tenantId", "employeeId");
CREATE INDEX "HiringContractDocument_employeeDocumentId_idx" ON "HiringContractDocument"("employeeDocumentId");

CREATE UNIQUE INDEX "HiringContractSignatureRequest_signaturePackageId_key" ON "HiringContractSignatureRequest"("signaturePackageId");
CREATE INDEX "HiringContractSignatureRequest_tenantId_contractId_status_idx" ON "HiringContractSignatureRequest"("tenantId", "contractId", "status");

CREATE INDEX "HiringContractStateEvent_tenantId_contractId_occurredAt_idx" ON "HiringContractStateEvent"("tenantId", "contractId", "occurredAt");
CREATE INDEX "HiringContractStateEvent_tenantId_action_occurredAt_idx" ON "HiringContractStateEvent"("tenantId", "action", "occurredAt");

ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_jobOfferId_fkey" FOREIGN KEY ("jobOfferId") REFERENCES "JobOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_onboardingFlowId_fkey" FOREIGN KEY ("onboardingFlowId") REFERENCES "OnboardingFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_hiringManagerUserId_fkey" FOREIGN KEY ("hiringManagerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContract" ADD CONSTRAINT "HiringContract_hrResponsibleUserId_fkey" FOREIGN KEY ("hrResponsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HiringContractDocument" ADD CONSTRAINT "HiringContractDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringContractDocument" ADD CONSTRAINT "HiringContractDocument_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "HiringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringContractDocument" ADD CONSTRAINT "HiringContractDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContractDocument" ADD CONSTRAINT "HiringContractDocument_employeeDocumentId_fkey" FOREIGN KEY ("employeeDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HiringContractDocument" ADD CONSTRAINT "HiringContractDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HiringContractSignatureRequest" ADD CONSTRAINT "HiringContractSignatureRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringContractSignatureRequest" ADD CONSTRAINT "HiringContractSignatureRequest_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "HiringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HiringContractStateEvent" ADD CONSTRAINT "HiringContractStateEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringContractStateEvent" ADD CONSTRAINT "HiringContractStateEvent_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "HiringContract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
