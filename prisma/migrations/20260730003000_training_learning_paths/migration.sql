CREATE TABLE "TrainingPathCourse" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "curriculumId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "prerequisiteCourseId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "unlockAfterDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingPathCourse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingOnboardingRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "onboardingTemplateId" TEXT,
  "branchId" TEXT,
  "curriculumId" TEXT,
  "courseId" TEXT,
  "name" TEXT NOT NULL,
  "jobTitlePattern" TEXT,
  "roleCode" TEXT,
  "dueDays" INTEGER NOT NULL DEFAULT 30,
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingOnboardingRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingOnboardingRule_target_check"
    CHECK (
      ("curriculumId" IS NOT NULL AND "courseId" IS NULL)
      OR ("curriculumId" IS NULL AND "courseId" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "TrainingPathCourse_curriculumId_courseId_key"
  ON "TrainingPathCourse"("curriculumId", "courseId");
CREATE INDEX "TrainingPathCourse_tenantId_curriculumId_sortOrder_idx"
  ON "TrainingPathCourse"("tenantId", "curriculumId", "sortOrder");
CREATE INDEX "TrainingPathCourse_prerequisiteCourseId_idx"
  ON "TrainingPathCourse"("prerequisiteCourseId");
CREATE INDEX "TrainingOnboardingRule_tenantId_isActive_idx"
  ON "TrainingOnboardingRule"("tenantId", "isActive");
CREATE INDEX "TrainingOnboardingRule_onboardingTemplateId_idx"
  ON "TrainingOnboardingRule"("onboardingTemplateId");
CREATE INDEX "TrainingOnboardingRule_branchId_idx"
  ON "TrainingOnboardingRule"("branchId");

ALTER TABLE "TrainingPathCourse"
  ADD CONSTRAINT "TrainingPathCourse_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPathCourse"
  ADD CONSTRAINT "TrainingPathCourse_curriculumId_fkey"
  FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPathCourse"
  ADD CONSTRAINT "TrainingPathCourse_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingPathCourse"
  ADD CONSTRAINT "TrainingPathCourse_prerequisiteCourseId_fkey"
  FOREIGN KEY ("prerequisiteCourseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingOnboardingRule"
  ADD CONSTRAINT "TrainingOnboardingRule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingOnboardingRule"
  ADD CONSTRAINT "TrainingOnboardingRule_onboardingTemplateId_fkey"
  FOREIGN KEY ("onboardingTemplateId") REFERENCES "OnboardingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingOnboardingRule"
  ADD CONSTRAINT "TrainingOnboardingRule_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingOnboardingRule"
  ADD CONSTRAINT "TrainingOnboardingRule_curriculumId_fkey"
  FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingOnboardingRule"
  ADD CONSTRAINT "TrainingOnboardingRule_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
