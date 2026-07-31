ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGE_REQUESTED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGE_APPROVED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGE_REJECTED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'STAGE_CHANGED';

ALTER TABLE "ApplicationTimelineEvent"
ADD COLUMN "tenantId" TEXT,
ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN "actorId" TEXT,
ADD COLUMN "actorDisplayName" TEXT,
ADD COLUMN "previousValue" JSONB,
ADD COLUMN "newValue" JSONB,
ADD COLUMN "metadata" JSONB,
ADD COLUMN "reason" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ATS';

UPDATE "ApplicationTimelineEvent" AS event
SET "tenantId" = application."tenantId"
FROM "VacancyApplication" AS application
WHERE application."id" = event."applicationId";

ALTER TABLE "ApplicationTimelineEvent"
ALTER COLUMN "tenantId" SET NOT NULL;

CREATE INDEX "ApplicationTimelineEvent_tenantId_occurredAt_idx"
ON "ApplicationTimelineEvent"("tenantId", "occurredAt");

CREATE INDEX "ApplicationTimelineEvent_actorId_occurredAt_idx"
ON "ApplicationTimelineEvent"("actorId", "occurredAt");

ALTER TABLE "ApplicationTimelineEvent"
DROP CONSTRAINT "ApplicationTimelineEvent_applicationId_fkey";

ALTER TABLE "ApplicationTimelineEvent"
ADD CONSTRAINT "ApplicationTimelineEvent_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_application_timeline_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Application timeline events are immutable'
    USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ApplicationTimelineEvent_immutable"
BEFORE UPDATE OR DELETE ON "ApplicationTimelineEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_application_timeline_mutation();
