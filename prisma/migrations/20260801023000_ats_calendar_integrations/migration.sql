CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'MICROSOFT', 'ZOOM');
CREATE TYPE "VideoConferenceProvider" AS ENUM ('NONE', 'GOOGLE_MEET', 'MICROSOFT_TEAMS', 'ZOOM', 'MANUAL');
CREATE TYPE "CalendarConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('NOT_CONNECTED', 'PENDING', 'SYNCED', 'FAILED', 'CANCELLED');

ALTER TABLE "ApplicationInterview"
ADD COLUMN "calendarProvider" "CalendarProvider",
ADD COLUMN "videoProvider" "VideoConferenceProvider" NOT NULL DEFAULT 'NONE',
ADD COLUMN "externalEventId" TEXT,
ADD COLUMN "externalMeetingId" TEXT,
ADD COLUMN "externalICalUid" TEXT,
ADD COLUMN "calendarSyncStatus" "CalendarSyncStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
ADD COLUMN "calendarSyncError" TEXT,
ADD COLUMN "calendarSyncedAt" TIMESTAMP(3),
ADD COLUMN "icsSequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "ApplicationInterview_calendarProvider_externalEventId_key"
ON "ApplicationInterview"("calendarProvider", "externalEventId");
CREATE INDEX "ApplicationInterview_tenantId_calendarSyncStatus_updatedAt_idx"
ON "ApplicationInterview"("tenantId", "calendarSyncStatus", "updatedAt");

CREATE TABLE "AtsCalendarConnection" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
  "externalAccountId" TEXT,
  "externalEmail" TEXT,
  "accessTokenEncrypted" TEXT NOT NULL,
  "refreshTokenEncrypted" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "scopes" TEXT[],
  "lastSyncedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AtsCalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewerAvailability" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "weeklySchedule" JSONB NOT NULL,
  "bufferMinutes" INTEGER NOT NULL DEFAULT 15,
  "minNoticeHours" INTEGER NOT NULL DEFAULT 2,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewerAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AtsCalendarConnection_tenantId_userId_provider_key"
ON "AtsCalendarConnection"("tenantId", "userId", "provider");
CREATE INDEX "AtsCalendarConnection_tenantId_provider_status_idx"
ON "AtsCalendarConnection"("tenantId", "provider", "status");
CREATE UNIQUE INDEX "InterviewerAvailability_userId_key"
ON "InterviewerAvailability"("userId");
CREATE INDEX "InterviewerAvailability_tenantId_userId_idx"
ON "InterviewerAvailability"("tenantId", "userId");

ALTER TABLE "AtsCalendarConnection" ADD CONSTRAINT "AtsCalendarConnection_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AtsCalendarConnection" ADD CONSTRAINT "AtsCalendarConnection_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewerAvailability" ADD CONSTRAINT "InterviewerAvailability_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewerAvailability" ADD CONSTRAINT "InterviewerAvailability_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
