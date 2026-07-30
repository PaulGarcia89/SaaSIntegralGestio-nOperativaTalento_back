CREATE TYPE "VacancyResponsibleRole" AS ENUM ('OWNER', 'RECRUITER', 'HIRING_MANAGER', 'INTERVIEWER');
CREATE TYPE "InterviewStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW');
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_YES', 'YES', 'MIXED', 'NO');

CREATE TABLE "VacancyStage" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "color" TEXT,
  "isTerminal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VacancyStage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VacancyResponsible" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "VacancyResponsibleRole" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VacancyResponsible_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationInterview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "stageId" TEXT,
  "interviewerUserId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "type" "InterviewType" NOT NULL,
  "timezone" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "location" TEXT,
  "meetingUrl" TEXT,
  "notes" TEXT,
  "status" "InterviewStatus" NOT NULL DEFAULT 'SCHEDULED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicationInterview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewScorecard" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "reviewerUserId" TEXT NOT NULL,
  "criteria" JSONB NOT NULL,
  "overallRating" INTEGER NOT NULL,
  "recommendation" "InterviewRecommendation" NOT NULL,
  "strengths" TEXT,
  "concerns" TEXT,
  "comments" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewScorecard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VacancyStage_vacancyId_code_key" ON "VacancyStage"("vacancyId", "code");
CREATE UNIQUE INDEX "VacancyStage_vacancyId_position_key" ON "VacancyStage"("vacancyId", "position");
CREATE INDEX "VacancyStage_tenantId_vacancyId_idx" ON "VacancyStage"("tenantId", "vacancyId");
CREATE UNIQUE INDEX "VacancyResponsible_vacancyId_userId_role_key" ON "VacancyResponsible"("vacancyId", "userId", "role");
CREATE INDEX "VacancyResponsible_tenantId_vacancyId_idx" ON "VacancyResponsible"("tenantId", "vacancyId");
CREATE INDEX "VacancyResponsible_tenantId_userId_idx" ON "VacancyResponsible"("tenantId", "userId");
CREATE INDEX "ApplicationInterview_tenantId_startsAt_idx" ON "ApplicationInterview"("tenantId", "startsAt");
CREATE INDEX "ApplicationInterview_applicationId_startsAt_idx" ON "ApplicationInterview"("applicationId", "startsAt");
CREATE INDEX "ApplicationInterview_interviewerUserId_startsAt_idx" ON "ApplicationInterview"("interviewerUserId", "startsAt");
CREATE UNIQUE INDEX "InterviewScorecard_interviewId_reviewerUserId_key" ON "InterviewScorecard"("interviewId", "reviewerUserId");
CREATE INDEX "InterviewScorecard_tenantId_interviewId_idx" ON "InterviewScorecard"("tenantId", "interviewId");
CREATE INDEX "InterviewScorecard_reviewerUserId_submittedAt_idx" ON "InterviewScorecard"("reviewerUserId", "submittedAt");

ALTER TABLE "VacancyStage" ADD CONSTRAINT "VacancyStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyStage" ADD CONSTRAINT "VacancyStage_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyResponsible" ADD CONSTRAINT "VacancyResponsible_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyResponsible" ADD CONSTRAINT "VacancyResponsible_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyResponsible" ADD CONSTRAINT "VacancyResponsible_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "VacancyStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_interviewerUserId_fkey" FOREIGN KEY ("interviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "ApplicationInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewScorecard" ADD CONSTRAINT "InterviewScorecard_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
