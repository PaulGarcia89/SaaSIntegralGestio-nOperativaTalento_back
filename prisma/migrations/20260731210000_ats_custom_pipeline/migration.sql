ALTER TABLE "VacancyStage"
ADD COLUMN "applicationStatus" "ApplicationStatus" NOT NULL DEFAULT 'REVIEWING';

ALTER TABLE "VacancyApplication"
ADD COLUMN "currentStageId" TEXT;

UPDATE "VacancyStage"
SET "applicationStatus" = CASE
  WHEN UPPER("code") IN ('APPLIED', 'SUBMITTED', 'APPLICATION') THEN 'SUBMITTED'::"ApplicationStatus"
  WHEN UPPER("code") LIKE '%INTERVIEW%' THEN 'INTERVIEW'::"ApplicationStatus"
  WHEN UPPER("code") LIKE '%REJECT%' OR UPPER("code") LIKE '%DECLIN%' THEN 'REJECTED'::"ApplicationStatus"
  WHEN UPPER("code") LIKE '%TRAIN%' THEN 'TRAINING'::"ApplicationStatus"
  WHEN UPPER("code") LIKE '%HIRED%' OR UPPER("code") LIKE '%CONTRAT%' THEN 'HIRED'::"ApplicationStatus"
  WHEN UPPER("code") LIKE '%APPROV%' OR UPPER("code") LIKE '%DECISION%' OR UPPER("code") LIKE '%OFFER%' THEN 'APPROVED'::"ApplicationStatus"
  ELSE 'REVIEWING'::"ApplicationStatus"
END;

UPDATE "VacancyStage" AS stage
SET "applicationStatus" = 'SUBMITTED'
WHERE stage."position" = (
  SELECT MIN(first_stage."position")
  FROM "VacancyStage" AS first_stage
  WHERE first_stage."vacancyId" = stage."vacancyId"
)
AND stage."applicationStatus" = 'REVIEWING';

UPDATE "VacancyApplication" AS application
SET "currentStageId" = (
  SELECT stage."id"
  FROM "VacancyStage" AS stage
  WHERE stage."vacancyId" = application."vacancyId"
    AND stage."applicationStatus" = application."status"
  ORDER BY stage."position" ASC
  LIMIT 1
);

CREATE INDEX "VacancyApplication_tenantId_currentStageId_idx"
ON "VacancyApplication"("tenantId", "currentStageId");

ALTER TABLE "VacancyApplication"
ADD CONSTRAINT "VacancyApplication_currentStageId_fkey"
FOREIGN KEY ("currentStageId") REFERENCES "VacancyStage"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
