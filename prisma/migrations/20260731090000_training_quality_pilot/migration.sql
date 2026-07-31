CREATE TYPE "TrainingQualityReviewType" AS ENUM ('CONTENT', 'PEDAGOGY', 'ACCESSIBILITY', 'COMPLIANCE');
CREATE TYPE "TrainingQualityReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED');
CREATE TYPE "TrainingPilotStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TABLE "TrainingCourseQualityReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "courseId" TEXT NOT NULL,
  "courseVersion" INTEGER NOT NULL,
  "reviewType" "TrainingQualityReviewType" NOT NULL,
  "status" "TrainingQualityReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewerId" TEXT,
  "requestedById" TEXT,
  "checklist" JSONB NOT NULL,
  "summary" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCourseQualityReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCoursePilot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "courseVersion" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "status" "TrainingPilotStatus" NOT NULL DEFAULT 'DRAFT',
  "participantIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "successCriteria" JSONB NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCoursePilot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingPilotFeedback" (
  "id" TEXT NOT NULL,
  "pilotId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "clarityRating" INTEGER NOT NULL,
  "relevanceRating" INTEGER NOT NULL,
  "comment" TEXT,
  "blockingIssue" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingPilotFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingCourseQualityReview_courseId_courseVersion_reviewType_key" ON "TrainingCourseQualityReview"("courseId", "courseVersion", "reviewType");
CREATE INDEX "TrainingCourseQualityReview_tenantId_status_updatedAt_idx" ON "TrainingCourseQualityReview"("tenantId", "status", "updatedAt");
CREATE INDEX "TrainingCourseQualityReview_reviewerId_status_idx" ON "TrainingCourseQualityReview"("reviewerId", "status");
CREATE INDEX "TrainingCoursePilot_tenantId_status_updatedAt_idx" ON "TrainingCoursePilot"("tenantId", "status", "updatedAt");
CREATE INDEX "TrainingCoursePilot_courseId_courseVersion_idx" ON "TrainingCoursePilot"("courseId", "courseVersion");
CREATE UNIQUE INDEX "TrainingPilotFeedback_pilotId_userId_key" ON "TrainingPilotFeedback"("pilotId", "userId");
CREATE INDEX "TrainingPilotFeedback_pilotId_blockingIssue_idx" ON "TrainingPilotFeedback"("pilotId", "blockingIssue");

ALTER TABLE "TrainingCourseQualityReview" ADD CONSTRAINT "TrainingCourseQualityReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCourseQualityReview" ADD CONSTRAINT "TrainingCourseQualityReview_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCoursePilot" ADD CONSTRAINT "TrainingCoursePilot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCoursePilot" ADD CONSTRAINT "TrainingCoursePilot_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPilotFeedback" ADD CONSTRAINT "TrainingPilotFeedback_pilotId_fkey" FOREIGN KEY ("pilotId") REFERENCES "TrainingCoursePilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
