CREATE TYPE "TrainingImprovementStatus" AS ENUM ('OPEN', 'PLANNED', 'IN_PROGRESS', 'VALIDATING', 'COMPLETED', 'DISMISSED');
CREATE TYPE "TrainingImprovementPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "TrainingImprovementSource" AS ENUM ('ANALYTICS', 'PILOT', 'QUALITY', 'MANUAL');

CREATE TABLE "TrainingCourseImprovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "ownerId" TEXT,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TrainingImprovementStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TrainingImprovementPriority" NOT NULL DEFAULT 'MEDIUM',
    "source" "TrainingImprovementSource" NOT NULL DEFAULT 'MANUAL',
    "signalCode" TEXT,
    "evidence" JSONB,
    "dueAt" TIMESTAMP(3),
    "outcomeNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrainingCourseImprovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingCourseImprovement_tenantId_status_priority_idx" ON "TrainingCourseImprovement"("tenantId", "status", "priority");
CREATE INDEX "TrainingCourseImprovement_courseId_status_idx" ON "TrainingCourseImprovement"("courseId", "status");
CREATE INDEX "TrainingCourseImprovement_ownerId_status_idx" ON "TrainingCourseImprovement"("ownerId", "status");

ALTER TABLE "TrainingCourseImprovement" ADD CONSTRAINT "TrainingCourseImprovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCourseImprovement" ADD CONSTRAINT "TrainingCourseImprovement_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCourseImprovement" ADD CONSTRAINT "TrainingCourseImprovement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingCourseImprovement" ADD CONSTRAINT "TrainingCourseImprovement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
