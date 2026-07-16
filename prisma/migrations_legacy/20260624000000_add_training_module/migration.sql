-- CreateEnum
CREATE TYPE "TrainingDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateEnum
CREATE TYPE "TrainingCourseType" AS ENUM ('COURSE', 'VIDEO', 'DOCUMENT', 'QUIZ', 'SCORM', 'LIVE_SESSION');

-- CreateEnum
CREATE TYPE "TrainingResourceType" AS ENUM ('VIDEO', 'PDF', 'LINK', 'IMAGE', 'AUDIO', 'SCORM', 'ARTICLE', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "TrainingCourseStepType" AS ENUM ('VIDEO', 'READING', 'QUIZ', 'FILE', 'TASK');

-- CreateEnum
CREATE TYPE "TrainingAssignmentType" AS ENUM ('CURRICULUM', 'COURSE');

-- CreateEnum
CREATE TYPE "TrainingAssignmentSourceType" AS ENUM ('MANUAL', 'RULE', 'SUBSCRIPTION', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "TrainingProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TrainingEventModality" AS ENUM ('IN_PERSON', 'VIRTUAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "TrainingEventAttendanceStatus" AS ENUM ('INVITED', 'REGISTERED', 'ATTENDED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrainingQuizQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'TEXT');

-- CreateEnum
CREATE TYPE "TrainingQuizAttemptStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'GRADED');

-- CreateEnum
CREATE TYPE "TrainingFavoriteEntityType" AS ENUM ('COURSE', 'CURRICULUM', 'RESOURCE');

-- CreateTable
CREATE TABLE "TenantTrainingModuleAccess" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantTrainingModuleAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCategory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "parentCategoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCurriculum" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "objective" TEXT,
    "targetAudience" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "TrainingDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCurriculum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "curriculumId" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "type" "TrainingCourseType" NOT NULL,
    "resourceType" "TrainingResourceType" NOT NULL,
    "resourceUrl" TEXT,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "TrainingDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "points" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourseStep" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "stepType" "TrainingCourseStepType" NOT NULL,
    "contentUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCourseStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "courseId" TEXT,
    "assignedById" TEXT,
    "assignmentType" "TrainingAssignmentType" NOT NULL,
    "sourceType" "TrainingAssignmentSourceType" NOT NULL,
    "dueAt" TIMESTAMP(3),
    "startAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" "TrainingProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "courseId" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "TrainingProgressStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingStepProgress" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseStepId" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "score" INTEGER,
    "timeSpentSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingStepProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "modality" "TrainingEventModality" NOT NULL,
    "relatedCourseId" TEXT,
    "relatedCurriculumId" TEXT,
    "capacity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingEventAttendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TrainingEventAttendanceStatus" NOT NULL DEFAULT 'INVITED',
    "registeredAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingEventAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLibraryResource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "resourceType" "TrainingResourceType" NOT NULL,
    "fileUrl" TEXT,
    "thumbnailUrl" TEXT,
    "externalUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationSeconds" INTEGER,
    "language" TEXT,
    "tags" TEXT[],
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingLibraryResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuiz" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "passingScore" INTEGER NOT NULL,
    "maxAttempts" INTEGER,
    "timeLimitMinutes" INTEGER,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizQuestion" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "questionType" "TrainingQuizQuestionType" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizAttempt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "passed" BOOLEAN,
    "status" "TrainingQuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingQuizAnswer" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "optionId" TEXT,
    "textAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingQuizAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCertificate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "curriculumId" TEXT,
    "courseId" TEXT,
    "certificateUrl" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingFavorite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "TrainingFavoriteEntityType" NOT NULL,
    "courseId" TEXT,
    "curriculumId" TEXT,
    "libraryResourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalCourses" INTEGER NOT NULL DEFAULT 0,
    "completedCourses" INTEGER NOT NULL DEFAULT 0,
    "completionRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "overdueCourses" INTEGER NOT NULL DEFAULT 0,
    "certificatesEarned" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrainingAnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TenantTrainingModuleAccess_tenantId_enabled_idx" ON "TenantTrainingModuleAccess"("tenantId", "enabled");

-- CreateIndex
CREATE INDEX "TenantTrainingModuleAccess_subscriptionId_idx" ON "TenantTrainingModuleAccess"("subscriptionId");

-- CreateIndex
CREATE INDEX "TenantTrainingModuleAccess_planId_idx" ON "TenantTrainingModuleAccess"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantTrainingModuleAccess_tenantId_key" ON "TenantTrainingModuleAccess"("tenantId");

-- CreateIndex
CREATE INDEX "TrainingCategory_tenantId_isActive_idx" ON "TrainingCategory"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "TrainingCategory_parentCategoryId_idx" ON "TrainingCategory"("parentCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCategory_tenantId_slug_key" ON "TrainingCategory"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingCurriculum_tenantId_isPublished_idx" ON "TrainingCurriculum"("tenantId", "isPublished");

-- CreateIndex
CREATE INDEX "TrainingCurriculum_categoryId_idx" ON "TrainingCurriculum"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCurriculum_tenantId_slug_key" ON "TrainingCurriculum"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingCourse_tenantId_isPublished_idx" ON "TrainingCourse"("tenantId", "isPublished");

-- CreateIndex
CREATE INDEX "TrainingCourse_curriculumId_idx" ON "TrainingCourse"("curriculumId");

-- CreateIndex
CREATE INDEX "TrainingCourse_categoryId_idx" ON "TrainingCourse"("categoryId");

-- CreateIndex
CREATE INDEX "TrainingCourse_type_idx" ON "TrainingCourse"("type");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourse_tenantId_slug_key" ON "TrainingCourse"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingCourseStep_courseId_sortOrder_idx" ON "TrainingCourseStep"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingAssignment_tenantId_userId_status_idx" ON "TrainingAssignment"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "TrainingAssignment_tenantId_dueAt_idx" ON "TrainingAssignment"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "TrainingAssignment_tenantId_startAt_idx" ON "TrainingAssignment"("tenantId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_tenantId_userId_curriculumId_key" ON "TrainingAssignment"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_tenantId_userId_courseId_key" ON "TrainingAssignment"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingProgress_tenantId_userId_status_idx" ON "TrainingProgress"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "TrainingProgress_tenantId_lastActivityAt_idx" ON "TrainingProgress"("tenantId", "lastActivityAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_tenantId_userId_curriculumId_key" ON "TrainingProgress"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgress_tenantId_userId_courseId_key" ON "TrainingProgress"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingStepProgress_tenantId_userId_idx" ON "TrainingStepProgress"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingStepProgress_userId_courseStepId_key" ON "TrainingStepProgress"("userId", "courseStepId");

-- CreateIndex
CREATE INDEX "TrainingEvent_tenantId_startsAt_idx" ON "TrainingEvent"("tenantId", "startsAt");

-- CreateIndex
CREATE INDEX "TrainingEvent_relatedCourseId_idx" ON "TrainingEvent"("relatedCourseId");

-- CreateIndex
CREATE INDEX "TrainingEvent_relatedCurriculumId_idx" ON "TrainingEvent"("relatedCurriculumId");

-- CreateIndex
CREATE INDEX "TrainingEventAttendance_eventId_status_idx" ON "TrainingEventAttendance"("eventId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingEventAttendance_eventId_userId_key" ON "TrainingEventAttendance"("eventId", "userId");

-- CreateIndex
CREATE INDEX "TrainingLibraryResource_tenantId_isPublished_idx" ON "TrainingLibraryResource"("tenantId", "isPublished");

-- CreateIndex
CREATE INDEX "TrainingLibraryResource_tenantId_isFeatured_idx" ON "TrainingLibraryResource"("tenantId", "isFeatured");

-- CreateIndex
CREATE INDEX "TrainingLibraryResource_categoryId_idx" ON "TrainingLibraryResource"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingLibraryResource_tenantId_slug_key" ON "TrainingLibraryResource"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "TrainingQuiz_courseId_idx" ON "TrainingQuiz"("courseId");

-- CreateIndex
CREATE INDEX "TrainingQuizQuestion_quizId_sortOrder_idx" ON "TrainingQuizQuestion"("quizId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingQuizOption_questionId_sortOrder_idx" ON "TrainingQuizOption"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "TrainingQuizAttempt_tenantId_userId_status_idx" ON "TrainingQuizAttempt"("tenantId", "userId", "status");

-- CreateIndex
CREATE INDEX "TrainingQuizAttempt_quizId_idx" ON "TrainingQuizAttempt"("quizId");

-- CreateIndex
CREATE INDEX "TrainingQuizAnswer_attemptId_idx" ON "TrainingQuizAnswer"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingQuizAnswer_attemptId_questionId_key" ON "TrainingQuizAnswer"("attemptId", "questionId");

-- CreateIndex
CREATE INDEX "TrainingCertificate_tenantId_userId_issuedAt_idx" ON "TrainingCertificate"("tenantId", "userId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCertificate_tenantId_userId_curriculumId_key" ON "TrainingCertificate"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCertificate_tenantId_userId_courseId_key" ON "TrainingCertificate"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE INDEX "TrainingFavorite_tenantId_userId_entityType_idx" ON "TrainingFavorite"("tenantId", "userId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFavorite_tenantId_userId_courseId_key" ON "TrainingFavorite"("tenantId", "userId", "courseId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFavorite_tenantId_userId_curriculumId_key" ON "TrainingFavorite"("tenantId", "userId", "curriculumId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingFavorite_tenantId_userId_libraryResourceId_key" ON "TrainingFavorite"("tenantId", "userId", "libraryResourceId");

-- CreateIndex
CREATE INDEX "TrainingAnalyticsSnapshot_tenantId_userId_generatedAt_idx" ON "TrainingAnalyticsSnapshot"("tenantId", "userId", "generatedAt");

-- AddForeignKey
ALTER TABLE "TenantTrainingModuleAccess" ADD CONSTRAINT "TenantTrainingModuleAccess_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTrainingModuleAccess" ADD CONSTRAINT "TenantTrainingModuleAccess_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantTrainingModuleAccess" ADD CONSTRAINT "TenantTrainingModuleAccess_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCategory" ADD CONSTRAINT "TrainingCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCategory" ADD CONSTRAINT "TrainingCategory_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCurriculum" ADD CONSTRAINT "TrainingCurriculum_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCurriculum" ADD CONSTRAINT "TrainingCurriculum_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourse" ADD CONSTRAINT "TrainingCourse_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCourseStep" ADD CONSTRAINT "TrainingCourseStep_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingProgress" ADD CONSTRAINT "TrainingProgress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStepProgress" ADD CONSTRAINT "TrainingStepProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStepProgress" ADD CONSTRAINT "TrainingStepProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingStepProgress" ADD CONSTRAINT "TrainingStepProgress_courseStepId_fkey" FOREIGN KEY ("courseStepId") REFERENCES "TrainingCourseStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_relatedCourseId_fkey" FOREIGN KEY ("relatedCourseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEvent" ADD CONSTRAINT "TrainingEvent_relatedCurriculumId_fkey" FOREIGN KEY ("relatedCurriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEventAttendance" ADD CONSTRAINT "TrainingEventAttendance_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TrainingEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingEventAttendance" ADD CONSTRAINT "TrainingEventAttendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLibraryResource" ADD CONSTRAINT "TrainingLibraryResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLibraryResource" ADD CONSTRAINT "TrainingLibraryResource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TrainingCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuiz" ADD CONSTRAINT "TrainingQuiz_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizQuestion" ADD CONSTRAINT "TrainingQuizQuestion_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TrainingQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizOption" ADD CONSTRAINT "TrainingQuizOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TrainingQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAttempt" ADD CONSTRAINT "TrainingQuizAttempt_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "TrainingQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAnswer" ADD CONSTRAINT "TrainingQuizAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TrainingQuizAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAnswer" ADD CONSTRAINT "TrainingQuizAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "TrainingQuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingQuizAnswer" ADD CONSTRAINT "TrainingQuizAnswer_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "TrainingQuizOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingCertificate" ADD CONSTRAINT "TrainingCertificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "TrainingCurriculum"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingFavorite" ADD CONSTRAINT "TrainingFavorite_libraryResourceId_fkey" FOREIGN KEY ("libraryResourceId") REFERENCES "TrainingLibraryResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnalyticsSnapshot" ADD CONSTRAINT "TrainingAnalyticsSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAnalyticsSnapshot" ADD CONSTRAINT "TrainingAnalyticsSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

