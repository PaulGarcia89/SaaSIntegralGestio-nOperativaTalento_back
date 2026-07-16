CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PRESENTIAL', 'VIRTUAL', 'PHONE');

-- CreateEnum
CREATE TYPE "ApplicationTimelineEventType" AS ENUM (
  'VACANCY_PUBLISHED',
  'APPLIED',
  'CONTACTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED'
);

-- AlterTable
ALTER TABLE "VacancyApplication"
ADD COLUMN "interviewType" "InterviewType",
ADD COLUMN "interviewScheduledAt" TIMESTAMP(3),
ADD COLUMN "interviewFollowUpAt" TIMESTAMP(3),
ADD COLUMN "interviewObservations" TEXT,
ADD COLUMN "contactedAt" TIMESTAMP(3),
ADD COLUMN "interviewCompletedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ApplicationTimelineEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" "ApplicationTimelineEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- Migrate legacy interview/tracking JSON data into relational columns
UPDATE "VacancyApplication"
SET
  "interviewType" = CASE
    WHEN "interview"->>'type' IN ('PRESENTIAL', 'VIRTUAL', 'PHONE')
      THEN ("interview"->>'type')::"InterviewType"
    ELSE NULL
  END,
  "interviewScheduledAt" = CASE
    WHEN NULLIF("interview"->>'scheduledAt', '') IS NOT NULL
      THEN ("interview"->>'scheduledAt')::timestamp
    ELSE NULL
  END,
  "interviewFollowUpAt" = CASE
    WHEN NULLIF("interview"->>'followUpAt', '') IS NOT NULL
      THEN ("interview"->>'followUpAt')::timestamp
    ELSE NULL
  END,
  "interviewObservations" = NULLIF("interview"->>'observations', ''),
  "contactedAt" = CASE
    WHEN NULLIF("tracking"->>'contactedAt', '') IS NOT NULL
      THEN ("tracking"->>'contactedAt')::timestamp
    ELSE NULL
  END,
  "interviewCompletedAt" = CASE
    WHEN NULLIF("tracking"->>'interviewCompletedAt', '') IS NOT NULL
      THEN ("tracking"->>'interviewCompletedAt')::timestamp
    ELSE NULL
  END
WHERE "interview" IS NOT NULL OR "tracking" IS NOT NULL;

-- Migrate custom timeline events from legacy tracking JSON
INSERT INTO "ApplicationTimelineEvent" (
  "id",
  "applicationId",
  "type",
  "occurredAt",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  va."id",
  event_type::"ApplicationTimelineEventType",
  CASE
    WHEN NULLIF(event_at, '') IS NOT NULL THEN event_at::timestamp
    ELSE NULL
  END,
  NULLIF(event_note, ''),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "VacancyApplication" va
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(va."tracking"->'timelineEvents', '[]'::jsonb)) event
CROSS JOIN LATERAL (
  SELECT
    event->>'type' AS event_type,
    event->>'at' AS event_at,
    event->>'note' AS event_note
) extracted
WHERE event_type IN (
  'VACANCY_PUBLISHED',
  'APPLIED',
  'CONTACTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEW_COMPLETED'
);

-- CreateIndex
CREATE INDEX "ApplicationTimelineEvent_applicationId_idx" ON "ApplicationTimelineEvent"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationTimelineEvent_type_idx" ON "ApplicationTimelineEvent"("type");

-- CreateIndex
CREATE INDEX "ApplicationTimelineEvent_occurredAt_idx" ON "ApplicationTimelineEvent"("occurredAt");

-- AddForeignKey
ALTER TABLE "ApplicationTimelineEvent"
ADD CONSTRAINT "ApplicationTimelineEvent_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop legacy JSON columns after migration
ALTER TABLE "VacancyApplication"
DROP COLUMN "interview",
DROP COLUMN "tracking";
