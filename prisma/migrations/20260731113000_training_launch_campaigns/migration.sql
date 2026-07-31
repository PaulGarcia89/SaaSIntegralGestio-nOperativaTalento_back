CREATE TYPE "TrainingLaunchStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "TrainingLaunchAudience" AS ENUM ('USERS', 'ROLES', 'BRANCHES', 'TENANT');

ALTER TYPE "TrainingAssignmentSourceType" ADD VALUE 'CAMPAIGN';

CREATE TABLE "TrainingLaunch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdById" TEXT,
    "name" TEXT NOT NULL,
    "status" "TrainingLaunchStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" "TrainingLaunchAudience" NOT NULL,
    "targetIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "resolvedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "nextAudienceIndex" INTEGER NOT NULL DEFAULT 0,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "rolloutIntervalHours" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "nextBatchAt" TIMESTAMP(3),
    "processingAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingLaunch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TrainingAssignment" ADD COLUMN "launchId" TEXT;

CREATE INDEX "TrainingLaunch_tenantId_status_createdAt_idx" ON "TrainingLaunch"("tenantId", "status", "createdAt");
CREATE INDEX "TrainingLaunch_status_nextBatchAt_idx" ON "TrainingLaunch"("status", "nextBatchAt");
CREATE INDEX "TrainingLaunch_courseId_idx" ON "TrainingLaunch"("courseId");
CREATE INDEX "TrainingAssignment_launchId_idx" ON "TrainingAssignment"("launchId");

ALTER TABLE "TrainingLaunch" ADD CONSTRAINT "TrainingLaunch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingLaunch" ADD CONSTRAINT "TrainingLaunch_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingLaunch" ADD CONSTRAINT "TrainingLaunch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "TrainingLaunch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
