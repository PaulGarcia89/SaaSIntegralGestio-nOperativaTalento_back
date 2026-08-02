CREATE TYPE "ScorecardTemplateScope" AS ENUM ('VACANCY', 'TENANT');
CREATE TYPE "ScorecardFeedbackVisibility" AS ENUM ('IMMEDIATE', 'AFTER_OWN_SUBMISSION', 'AFTER_ALL_SUBMITTED', 'HIRING_MANAGER_ONLY');
CREATE TYPE "ExternalAssessmentStatus" AS ENUM ('DRAFT', 'INVITED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'ERROR');
CREATE TYPE "HiringManagerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
CREATE TYPE "BiasValidationStatus" AS ENUM ('INSUFFICIENT_DATA', 'EXPLORATORY', 'VALIDATED', 'REQUIRES_REVIEW');

DROP INDEX IF EXISTS "ScorecardTemplate_vacancyId_stageId_version_key";
ALTER TABLE "ScorecardTemplate" ALTER COLUMN "vacancyId" DROP NOT NULL;
ALTER TABLE "ScorecardTemplate" ADD COLUMN "scope" "ScorecardTemplateScope" NOT NULL DEFAULT 'VACANCY';
ALTER TABLE "ScorecardTemplate" ADD COLUMN "feedbackVisibility" "ScorecardFeedbackVisibility" NOT NULL DEFAULT 'AFTER_ALL_SUBMITTED';
CREATE UNIQUE INDEX "ScorecardTemplate_tenantId_vacancyId_stageId_name_version_key" ON "ScorecardTemplate"("tenantId", "vacancyId", "stageId", "name", "version");
CREATE INDEX "ScorecardTemplate_tenantId_scope_isActive_idx" ON "ScorecardTemplate"("tenantId", "scope", "isActive");

CREATE TABLE "ScorecardCompetency" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "code" TEXT NOT NULL, "name" TEXT NOT NULL,
  "description" TEXT, "category" TEXT, "behavioralAnchors" JSONB, "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScorecardCompetency_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScorecardCompetency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScorecardCompetency_tenantId_code_key" ON "ScorecardCompetency"("tenantId", "code");
CREATE INDEX "ScorecardCompetency_tenantId_isActive_name_idx" ON "ScorecardCompetency"("tenantId", "isActive", "name");
ALTER TABLE "ScorecardCriterion" ADD COLUMN "competencyId" TEXT;
ALTER TABLE "ScorecardCriterion" ADD CONSTRAINT "ScorecardCriterion_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "ScorecardCompetency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ScorecardCriterion_tenantId_competencyId_idx" ON "ScorecardCriterion"("tenantId", "competencyId");

CREATE TABLE "ScorecardEvaluatorAssignment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "interviewId" TEXT NOT NULL, "evaluatorUserId" TEXT NOT NULL,
  "criterionIds" JSONB NOT NULL, "anonymousReview" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScorecardEvaluatorAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ScorecardEvaluatorAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScorecardEvaluatorAssignment_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "ApplicationInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScorecardEvaluatorAssignment_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ScorecardEvaluatorAssignment_interviewId_evaluatorUserId_key" ON "ScorecardEvaluatorAssignment"("interviewId", "evaluatorUserId");
CREATE INDEX "ScorecardEvaluatorAssignment_tenantId_evaluatorUserId_createdAt_idx" ON "ScorecardEvaluatorAssignment"("tenantId", "evaluatorUserId", "createdAt");

CREATE TABLE "ExternalCandidateAssessment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "provider" TEXT NOT NULL, "assessmentType" TEXT NOT NULL,
  "externalAssessmentId" TEXT, "launchUrl" TEXT, "reportUrl" TEXT, "status" "ExternalAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "score" DECIMAL(7,2), "percentile" DECIMAL(5,2), "result" JSONB, "consentRecordedAt" TIMESTAMP(3), "invitedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalCandidateAssessment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExternalCandidateAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExternalCandidateAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExternalCandidateAssessment_tenantId_provider_externalAssessmentId_key" ON "ExternalCandidateAssessment"("tenantId", "provider", "externalAssessmentId");
CREATE INDEX "ExternalCandidateAssessment_tenantId_applicationId_status_idx" ON "ExternalCandidateAssessment"("tenantId", "applicationId", "status");

CREATE TABLE "HiringManagerApproval" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "managerUserId" TEXT NOT NULL,
  "status" "HiringManagerApprovalStatus" NOT NULL DEFAULT 'PENDING', "recommendation" "InterviewRecommendation", "rationale" TEXT, "decidedByUserId" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "decidedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiringManagerApproval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HiringManagerApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HiringManagerApproval_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HiringManagerApproval_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HiringManagerApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HiringManagerApproval_applicationId_key" ON "HiringManagerApproval"("applicationId");
CREATE INDEX "HiringManagerApproval_tenantId_managerUserId_status_idx" ON "HiringManagerApproval"("tenantId", "managerUserId", "status");

CREATE TABLE "EvaluatorCalibrationSnapshot" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "evaluatorUserId" TEXT NOT NULL, "sampleSize" INTEGER NOT NULL,
  "meanScore" DECIMAL(7,2) NOT NULL, "panelMeanScore" DECIMAL(7,2) NOT NULL, "meanDeviation" DECIMAL(7,2) NOT NULL, "strictnessIndex" DECIMAL(7,3) NOT NULL,
  "agreementRate" DECIMAL(5,2) NOT NULL, "evidenceRate" DECIMAL(5,2) NOT NULL, "periodStartsAt" TIMESTAMP(3) NOT NULL, "periodEndsAt" TIMESTAMP(3) NOT NULL, "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EvaluatorCalibrationSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EvaluatorCalibrationSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "EvaluatorCalibrationSnapshot_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "EvaluatorCalibrationSnapshot_tenantId_evaluatorUserId_calculatedAt_idx" ON "EvaluatorCalibrationSnapshot"("tenantId", "evaluatorUserId", "calculatedAt");

CREATE TABLE "BiasValidationRun" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text, "tenantId" TEXT NOT NULL, "createdByUserId" TEXT NOT NULL, "methodologyVersion" TEXT NOT NULL,
  "populationField" TEXT NOT NULL, "outcomeField" TEXT NOT NULL, "sampleSize" INTEGER NOT NULL, "referenceGroup" TEXT, "comparisonGroup" TEXT,
  "selectionRateRatio" DECIMAL(7,4), "effectSize" DECIMAL(7,4), "pValue" DECIMAL(7,5), "confidenceLevel" DECIMAL(4,3) NOT NULL DEFAULT 0.95,
  "status" "BiasValidationStatus" NOT NULL, "findings" JSONB NOT NULL, "limitations" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BiasValidationRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BiasValidationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BiasValidationRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "BiasValidationRun_tenantId_createdAt_idx" ON "BiasValidationRun"("tenantId", "createdAt");
