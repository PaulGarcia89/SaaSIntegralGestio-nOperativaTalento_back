CREATE TYPE "ScorecardCriterionType" AS ENUM ('RATING', 'TEXT', 'BOOLEAN');
CREATE TYPE "ScorecardStatus" AS ENUM ('DRAFT', 'SIGNED');
CREATE TYPE "DecisionCommitteeStatus" AS ENUM ('OPEN', 'DECIDED', 'CANCELLED');
CREATE TYPE "DecisionCommitteeRole" AS ENUM ('CHAIR', 'MEMBER', 'OBSERVER');

ALTER TABLE "InterviewScorecard"
ADD COLUMN "templateId" TEXT,
ADD COLUMN "templateVersion" INTEGER,
ADD COLUMN "weightedScore" DECIMAL(5,2),
ADD COLUMN "status" "ScorecardStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedByUserId" TEXT,
ADD COLUMN "signatureHash" TEXT;

ALTER TABLE "ApplicationInterview"
ADD COLUMN "scorecardTemplateId" TEXT;

CREATE TABLE "ScorecardTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "stageId" TEXT,
  "name" TEXT NOT NULL,
  "instructions" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScorecardTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScorecardCriterion" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "competencyCode" TEXT,
  "competencyName" TEXT,
  "type" "ScorecardCriterionType" NOT NULL DEFAULT 'RATING',
  "weight" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "requiresEvidence" BOOLEAN NOT NULL DEFAULT false,
  "ratingAnchors" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "ScorecardCriterion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewScorecardResponse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "scorecardId" TEXT NOT NULL,
  "criterionId" TEXT NOT NULL,
  "criterionKey" TEXT NOT NULL,
  "criterionLabel" TEXT NOT NULL,
  "competencyCode" TEXT,
  "competencyName" TEXT,
  "criterionType" "ScorecardCriterionType" NOT NULL,
  "weight" INTEGER NOT NULL,
  "rating" INTEGER,
  "textValue" TEXT,
  "booleanValue" BOOLEAN,
  "evidence" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewScorecardResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HiringDecisionCommittee" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "DecisionCommitteeStatus" NOT NULL DEFAULT 'OPEN',
  "quorum" INTEGER NOT NULL DEFAULT 2,
  "finalDecision" "InterviewRecommendation",
  "rationale" TEXT,
  "decidedByUserId" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiringDecisionCommittee_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HiringDecisionCommitteeMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "committeeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "DecisionCommitteeRole" NOT NULL DEFAULT 'MEMBER',
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "vote" "InterviewRecommendation",
  "voteRationale" TEXT,
  "conflictOfInterestDeclared" BOOLEAN,
  "recusedAt" TIMESTAMP(3),
  "votedAt" TIMESTAMP(3),
  CONSTRAINT "HiringDecisionCommitteeMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScorecardTemplate_vacancyId_stageId_version_key"
ON "ScorecardTemplate"("vacancyId", "stageId", "version");
CREATE INDEX "ScorecardTemplate_tenantId_vacancyId_stageId_isActive_idx"
ON "ScorecardTemplate"("tenantId", "vacancyId", "stageId", "isActive");
CREATE UNIQUE INDEX "ScorecardCriterion_templateId_key_key"
ON "ScorecardCriterion"("templateId", "key");
CREATE INDEX "ScorecardCriterion_tenantId_templateId_sortOrder_idx"
ON "ScorecardCriterion"("tenantId", "templateId", "sortOrder");
CREATE UNIQUE INDEX "InterviewScorecardResponse_scorecardId_criterionId_key"
ON "InterviewScorecardResponse"("scorecardId", "criterionId");
CREATE INDEX "InterviewScorecardResponse_tenantId_scorecardId_idx"
ON "InterviewScorecardResponse"("tenantId", "scorecardId");
CREATE INDEX "InterviewScorecardResponse_criterionId_idx"
ON "InterviewScorecardResponse"("criterionId");
CREATE UNIQUE INDEX "HiringDecisionCommittee_applicationId_key"
ON "HiringDecisionCommittee"("applicationId");
CREATE INDEX "HiringDecisionCommittee_tenantId_status_createdAt_idx"
ON "HiringDecisionCommittee"("tenantId", "status", "createdAt");
CREATE INDEX "HiringDecisionCommittee_vacancyId_status_idx"
ON "HiringDecisionCommittee"("vacancyId", "status");
CREATE UNIQUE INDEX "HiringDecisionCommitteeMember_committeeId_userId_key"
ON "HiringDecisionCommitteeMember"("committeeId", "userId");
CREATE INDEX "HiringDecisionCommitteeMember_tenantId_userId_votedAt_idx"
ON "HiringDecisionCommitteeMember"("tenantId", "userId", "votedAt");
CREATE INDEX "InterviewScorecard_tenantId_status_signedAt_idx"
ON "InterviewScorecard"("tenantId", "status", "signedAt");

ALTER TABLE "ScorecardTemplate" ADD CONSTRAINT "ScorecardTemplate_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScorecardTemplate" ADD CONSTRAINT "ScorecardTemplate_vacancyId_fkey"
FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScorecardTemplate" ADD CONSTRAINT "ScorecardTemplate_stageId_fkey"
FOREIGN KEY ("stageId") REFERENCES "VacancyStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScorecardTemplate" ADD CONSTRAINT "ScorecardTemplate_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScorecardCriterion" ADD CONSTRAINT "ScorecardCriterion_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScorecardCriterion" ADD CONSTRAINT "ScorecardCriterion_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "ScorecardTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecardResponse" ADD CONSTRAINT "InterviewScorecardResponse_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecardResponse" ADD CONSTRAINT "InterviewScorecardResponse_scorecardId_fkey"
FOREIGN KEY ("scorecardId") REFERENCES "InterviewScorecard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecardResponse" ADD CONSTRAINT "InterviewScorecardResponse_criterionId_fkey"
FOREIGN KEY ("criterionId") REFERENCES "ScorecardCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommittee" ADD CONSTRAINT "HiringDecisionCommittee_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommittee" ADD CONSTRAINT "HiringDecisionCommittee_vacancyId_fkey"
FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommittee" ADD CONSTRAINT "HiringDecisionCommittee_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommittee" ADD CONSTRAINT "HiringDecisionCommittee_decidedByUserId_fkey"
FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommitteeMember" ADD CONSTRAINT "HiringDecisionCommitteeMember_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommitteeMember" ADD CONSTRAINT "HiringDecisionCommitteeMember_committeeId_fkey"
FOREIGN KEY ("committeeId") REFERENCES "HiringDecisionCommittee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringDecisionCommitteeMember" ADD CONSTRAINT "HiringDecisionCommitteeMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_scorecardTemplateId_fkey"
FOREIGN KEY ("scorecardTemplateId") REFERENCES "ScorecardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "ScorecardTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_signedByUserId_fkey"
FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_signed_scorecard_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'SIGNED' THEN
    RAISE EXCEPTION 'Signed scorecards are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InterviewScorecard_signed_immutable"
BEFORE UPDATE OR DELETE ON "InterviewScorecard"
FOR EACH ROW EXECUTE FUNCTION prevent_signed_scorecard_mutation();

CREATE OR REPLACE FUNCTION prevent_signed_scorecard_response_mutation()
RETURNS trigger AS $$
DECLARE
  target_scorecard_id TEXT;
  target_status "ScorecardStatus";
BEGIN
  target_scorecard_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."scorecardId" ELSE NEW."scorecardId" END;
  SELECT "status" INTO target_status FROM "InterviewScorecard" WHERE "id" = target_scorecard_id;
  IF target_status = 'SIGNED' THEN
    RAISE EXCEPTION 'Responses of signed scorecards are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "InterviewScorecardResponse_signed_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "InterviewScorecardResponse"
FOR EACH ROW EXECUTE FUNCTION prevent_signed_scorecard_response_mutation();
