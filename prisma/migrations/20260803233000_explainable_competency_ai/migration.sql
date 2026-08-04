CREATE TYPE "AiCompetencyAssessmentStatus" AS ENUM ('READY_FOR_REVIEW', 'SIGNED');
CREATE TYPE "AiEvidenceSufficiency" AS ENUM ('SUFFICIENT', 'PARTIAL', 'INSUFFICIENT');

CREATE TABLE "AiCompetencyAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AiCompetencyAssessmentStatus" NOT NULL DEFAULT 'READY_FOR_REVIEW',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "generatedByUserId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewerNotes" TEXT,
    "signedByUserId" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiCompetencyAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiCompetencyAssessmentItem" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "criterionId" TEXT,
    "competencyCode" TEXT NOT NULL,
    "competencyName" TEXT NOT NULL,
    "competencyDefinition" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "aiScore" DECIMAL(3,2) NOT NULL,
    "confidence" DECIMAL(4,3) NOT NULL,
    "sufficiency" "AiEvidenceSufficiency" NOT NULL,
    "explanation" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "missingInformation" JSONB NOT NULL,
    "suggestedQuestions" JSONB NOT NULL,
    "humanScore" DECIMAL(3,2),
    "reviewerNotes" TEXT,
    "reviewerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiCompetencyAssessmentItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiCompetencyAssessment_applicationId_version_key" ON "AiCompetencyAssessment"("applicationId", "version");
CREATE INDEX "AiCompetencyAssessment_tenantId_branchId_status_idx" ON "AiCompetencyAssessment"("tenantId", "branchId", "status");
CREATE INDEX "AiCompetencyAssessment_tenantId_applicationId_createdAt_idx" ON "AiCompetencyAssessment"("tenantId", "applicationId", "createdAt");
CREATE UNIQUE INDEX "AiCompetencyAssessmentItem_assessmentId_competencyCode_key" ON "AiCompetencyAssessmentItem"("assessmentId", "competencyCode");
CREATE INDEX "AiCompetencyAssessmentItem_assessmentId_idx" ON "AiCompetencyAssessmentItem"("assessmentId");

ALTER TABLE "AiCompetencyAssessment" ADD CONSTRAINT "AiCompetencyAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCompetencyAssessment" ADD CONSTRAINT "AiCompetencyAssessment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiCompetencyAssessment" ADD CONSTRAINT "AiCompetencyAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiCompetencyAssessment" ADD CONSTRAINT "AiCompetencyAssessment_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiCompetencyAssessment" ADD CONSTRAINT "AiCompetencyAssessment_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiCompetencyAssessment" ADD CONSTRAINT "AiCompetencyAssessment_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AiCompetencyAssessmentItem" ADD CONSTRAINT "AiCompetencyAssessmentItem_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "AiCompetencyAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
