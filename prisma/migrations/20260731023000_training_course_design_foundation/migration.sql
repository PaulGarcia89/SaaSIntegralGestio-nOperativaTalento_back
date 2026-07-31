CREATE TYPE "TrainingCompetencyLevel" AS ENUM ('AWARENESS', 'WORKING', 'PROFICIENT', 'EXPERT');
CREATE TYPE "TrainingAudienceRuleType" AS ENUM ('ROLE', 'JOB_TITLE', 'BRANCH', 'GROUP');
CREATE TYPE "TrainingAudienceOperator" AS ENUM ('EQUALS', 'CONTAINS');

CREATE TABLE "TrainingCourseBrief" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "businessNeed" TEXT NOT NULL,
  "targetOutcome" TEXT NOT NULL,
  "successKpi" TEXT NOT NULL,
  "audienceDescription" TEXT,
  "baselineMetric" TEXT,
  "targetMetric" TEXT,
  "riskIfNotCompleted" TEXT,
  "contentOwnerId" TEXT,
  "subjectMatterExpertId" TEXT,
  "targetDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCourseBrief_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCompetency" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "framework" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCompetency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingCourseCompetency" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "competencyId" TEXT NOT NULL,
  "targetLevel" "TrainingCompetencyLevel" NOT NULL DEFAULT 'WORKING',
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCourseCompetency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingLearningObjective" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "competencyId" TEXT,
  "statement" TEXT NOT NULL,
  "successCriteria" TEXT NOT NULL,
  "assessmentMethod" TEXT NOT NULL,
  "targetLevel" "TrainingCompetencyLevel" NOT NULL DEFAULT 'WORKING',
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingLearningObjective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrainingAudienceRule" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "ruleType" "TrainingAudienceRuleType" NOT NULL,
  "operator" "TrainingAudienceOperator" NOT NULL DEFAULT 'EQUALS',
  "value" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingAudienceRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrainingCourseBrief_courseId_key" ON "TrainingCourseBrief"("courseId");
CREATE INDEX "TrainingCourseBrief_contentOwnerId_idx" ON "TrainingCourseBrief"("contentOwnerId");
CREATE INDEX "TrainingCourseBrief_subjectMatterExpertId_idx" ON "TrainingCourseBrief"("subjectMatterExpertId");
CREATE UNIQUE INDEX "TrainingCompetency_tenantId_code_key" ON "TrainingCompetency"("tenantId", "code");
CREATE INDEX "TrainingCompetency_tenantId_isActive_idx" ON "TrainingCompetency"("tenantId", "isActive");
CREATE INDEX "TrainingCompetency_name_idx" ON "TrainingCompetency"("name");
CREATE UNIQUE INDEX "TrainingCourseCompetency_courseId_competencyId_key" ON "TrainingCourseCompetency"("courseId", "competencyId");
CREATE INDEX "TrainingCourseCompetency_courseId_sortOrder_idx" ON "TrainingCourseCompetency"("courseId", "sortOrder");
CREATE INDEX "TrainingCourseCompetency_competencyId_idx" ON "TrainingCourseCompetency"("competencyId");
CREATE INDEX "TrainingLearningObjective_courseId_sortOrder_idx" ON "TrainingLearningObjective"("courseId", "sortOrder");
CREATE INDEX "TrainingLearningObjective_competencyId_idx" ON "TrainingLearningObjective"("competencyId");
CREATE INDEX "TrainingAudienceRule_courseId_sortOrder_idx" ON "TrainingAudienceRule"("courseId", "sortOrder");
CREATE INDEX "TrainingAudienceRule_ruleType_value_idx" ON "TrainingAudienceRule"("ruleType", "value");

ALTER TABLE "TrainingCourseBrief" ADD CONSTRAINT "TrainingCourseBrief_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCourseCompetency" ADD CONSTRAINT "TrainingCourseCompetency_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingCourseCompetency" ADD CONSTRAINT "TrainingCourseCompetency_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "TrainingCompetency"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingLearningObjective" ADD CONSTRAINT "TrainingLearningObjective_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingLearningObjective" ADD CONSTRAINT "TrainingLearningObjective_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "TrainingCompetency"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrainingAudienceRule" ADD CONSTRAINT "TrainingAudienceRule_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
