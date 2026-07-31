CREATE TYPE "ApplicationTransitionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "VacancyStage"
ADD COLUMN "allowedNextStageCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "requiredFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiredApprovals" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "allowReopen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "slaHours" INTEGER;

ALTER TABLE "VacancyApplication"
ADD COLUMN "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "rejectionReason" TEXT;

UPDATE "VacancyApplication"
SET "stageEnteredAt" = COALESCE("updatedAt", "appliedAt");

UPDATE "VacancyStage" AS source
SET "allowedNextStageCodes" = ARRAY(
  SELECT target."code"
  FROM "VacancyStage" AS target
  WHERE target."vacancyId" = source."vacancyId"
    AND (
      target."position" = source."position" + 1
      OR target."applicationStatus" = 'REJECTED'
    )
    AND target."id" <> source."id"
  ORDER BY target."position"
);

UPDATE "VacancyStage"
SET "allowReopen" = true
WHERE "applicationStatus" = 'REJECTED';

UPDATE "VacancyStage" AS source
SET "allowedNextStageCodes" = ARRAY(
  SELECT target."code"
  FROM "VacancyStage" AS target
  WHERE target."vacancyId" = source."vacancyId"
    AND target."applicationStatus" IN ('REVIEWING', 'INTERVIEW')
  ORDER BY target."position"
  LIMIT 1
)
WHERE source."applicationStatus" = 'REJECTED';

UPDATE "VacancyStage"
SET "allowedNextStageCodes" = ARRAY[]::TEXT[]
WHERE "applicationStatus" = 'HIRED';

CREATE TABLE "ApplicationStageTransitionRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fromStageId" TEXT,
  "toStageId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requiredApprovals" INTEGER NOT NULL DEFAULT 1,
  "reason" TEXT,
  "status" "ApplicationTransitionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "ApplicationStageTransitionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationStageTransitionApproval" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "approved" BOOLEAN NOT NULL,
  "note" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApplicationStageTransitionApproval_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationStageTransitionRequest_tenantId_status_requestedAt_idx" ON "ApplicationStageTransitionRequest"("tenantId", "status", "requestedAt");
CREATE INDEX "ApplicationStageTransitionRequest_applicationId_status_idx" ON "ApplicationStageTransitionRequest"("applicationId", "status");
CREATE UNIQUE INDEX "ApplicationStageTransitionApproval_requestId_reviewerUserId_key" ON "ApplicationStageTransitionApproval"("requestId", "reviewerUserId");
CREATE INDEX "ApplicationStageTransitionApproval_reviewerUserId_decidedAt_idx" ON "ApplicationStageTransitionApproval"("reviewerUserId", "decidedAt");

ALTER TABLE "ApplicationStageTransitionRequest" ADD CONSTRAINT "ApplicationStageTransitionRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationStageTransitionRequest" ADD CONSTRAINT "ApplicationStageTransitionRequest_fromStageId_fkey" FOREIGN KEY ("fromStageId") REFERENCES "VacancyStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationStageTransitionRequest" ADD CONSTRAINT "ApplicationStageTransitionRequest_toStageId_fkey" FOREIGN KEY ("toStageId") REFERENCES "VacancyStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationStageTransitionApproval" ADD CONSTRAINT "ApplicationStageTransitionApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ApplicationStageTransitionRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
