CREATE TYPE "TrainingVideoEventType" AS ENUM ('PLAY', 'PAUSE', 'SEEK', 'HEARTBEAT', 'ENDED', 'COMPLETED');

ALTER TABLE "TrainingLesson"
  ADD COLUMN "type" "TrainingCourseStepType" NOT NULL DEFAULT 'READING',
  ADD COLUMN "videoStorageKey" TEXT,
  ADD COLUMN "videoUrl" TEXT,
  ADD COLUMN "thumbnailUrl" TEXT,
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "requiredCompletionPercentage" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "allowReplay" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE TABLE "TrainingVideoProgress" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0,
  "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
  "highestPositionSeconds" INTEGER NOT NULL DEFAULT 0,
  "completionPercentage" INTEGER NOT NULL DEFAULT 0,
  "playbackSessionId" TEXT,
  "startedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingVideoProgress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingVideoProgressEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assignmentId" TEXT NOT NULL,
  "lessonId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "playbackSessionId" TEXT NOT NULL,
  "eventType" "TrainingVideoEventType" NOT NULL,
  "currentTimeSeconds" INTEGER NOT NULL,
  "durationSeconds" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "progressId" TEXT,
  CONSTRAINT "TrainingVideoProgressEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingVideoProgress_assignmentId_lessonId_key" ON "TrainingVideoProgress"("assignmentId", "lessonId");
CREATE INDEX "TrainingLesson_type_isActive_idx" ON "TrainingLesson"("type", "isActive");
CREATE INDEX "TrainingVideoProgress_tenantId_userId_updatedAt_idx" ON "TrainingVideoProgress"("tenantId", "userId", "updatedAt");
CREATE INDEX "TrainingVideoProgress_tenantId_assignmentId_idx" ON "TrainingVideoProgress"("tenantId", "assignmentId");
CREATE INDEX "TrainingVideoProgress_lessonId_completedAt_idx" ON "TrainingVideoProgress"("lessonId", "completedAt");
CREATE INDEX "TrainingVideoProgressEvent_tenantId_assignmentId_occurredAt_idx" ON "TrainingVideoProgressEvent"("tenantId", "assignmentId", "occurredAt");
CREATE INDEX "TrainingVideoProgressEvent_tenantId_userId_occurredAt_idx" ON "TrainingVideoProgressEvent"("tenantId", "userId", "occurredAt");
CREATE INDEX "TrainingVideoProgressEvent_playbackSessionId_occurredAt_idx" ON "TrainingVideoProgressEvent"("playbackSessionId", "occurredAt");

ALTER TABLE "TrainingVideoProgress"
  ADD CONSTRAINT "TrainingVideoProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgress_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrainingVideoProgressEvent"
  ADD CONSTRAINT "TrainingVideoProgressEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgressEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "TrainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgressEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "TrainingLesson"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgressEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TrainingVideoProgressEvent_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "TrainingVideoProgress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
