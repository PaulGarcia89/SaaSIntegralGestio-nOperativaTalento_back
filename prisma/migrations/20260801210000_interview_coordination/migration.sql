CREATE TYPE "InterviewParticipantRole" AS ENUM ('LEAD', 'PANELIST', 'SHADOW');
CREATE TYPE "InterviewParticipantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'SUBSTITUTED');
CREATE TYPE "InterviewSequenceStatus" AS ENUM ('DRAFT', 'SCHEDULING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InterviewerTrainingStatus" AS ENUM ('NOT_STARTED', 'IN_TRAINING', 'SHADOWING', 'CERTIFIED', 'SUSPENDED');
CREATE TYPE "InterviewResourceType" AS ENUM ('ROOM', 'VIDEO_ROOM', 'EQUIPMENT', 'ACCESSIBILITY');
CREATE TYPE "InterviewSchedulingRequestStatus" AS ENUM ('OPEN', 'BOOKED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "ApplicationInterview"
  ADD COLUMN "sequenceId" TEXT,
  ADD COLUMN "sequenceOrder" INTEGER,
  ADD COLUMN "schedulingRequestId" TEXT;

CREATE TABLE "InterviewerProfile" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "trainingStatus" "InterviewerTrainingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "trainedAt" TIMESTAMP(3), "shadowSessionsRequired" INTEGER NOT NULL DEFAULT 2,
  "shadowSessionsCompleted" INTEGER NOT NULL DEFAULT 0,
  "maxInterviewsPerDay" INTEGER NOT NULL DEFAULT 4,
  "maxInterviewsPerWeek" INTEGER NOT NULL DEFAULT 12,
  "autoSubstitutionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewerProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewPool" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT,
  "name" TEXT NOT NULL, "description" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewPoolMember" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "poolId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "defaultRole" "InterviewParticipantRole" NOT NULL DEFAULT 'PANELIST',
  "priority" INTEGER NOT NULL DEFAULT 100, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewPoolMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewSequence" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "applicationId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "status" "InterviewSequenceStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApplicationInterviewParticipant" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "interviewId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "role" "InterviewParticipantRole" NOT NULL, "status" "InterviewParticipantStatus" NOT NULL DEFAULT 'PENDING',
  "poolId" TEXT, "substitutedForUserId" TEXT, "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicationInterviewParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewResource" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "branchId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "type" "InterviewResourceType" NOT NULL, "capacity" INTEGER NOT NULL DEFAULT 1,
  "location" TEXT, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewResource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewResourceBooking" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "interviewId" TEXT NOT NULL, "resourceId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterviewResourceBooking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewSchedulingRequest" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "applicationId" TEXT NOT NULL, "poolId" TEXT,
  "createdByUserId" TEXT NOT NULL, "tokenHash" TEXT NOT NULL, "title" TEXT NOT NULL,
  "type" "InterviewType" NOT NULL, "timezone" TEXT NOT NULL, "durationMinutes" INTEGER NOT NULL,
  "windowStartsAt" TIMESTAMP(3) NOT NULL, "windowEndsAt" TIMESTAMP(3) NOT NULL,
  "requestedInterviewerIds" TEXT[] DEFAULT ARRAY[]::TEXT[], "shadowInterviewerIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "resourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "InterviewSchedulingRequestStatus" NOT NULL DEFAULT 'OPEN', "expiresAt" TIMESTAMP(3) NOT NULL,
  "bookedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewSchedulingRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationInterview_schedulingRequestId_key" ON "ApplicationInterview"("schedulingRequestId");
CREATE INDEX "ApplicationInterview_tenantId_sequenceId_sequenceOrder_idx" ON "ApplicationInterview"("tenantId", "sequenceId", "sequenceOrder");
CREATE UNIQUE INDEX "InterviewerProfile_userId_key" ON "InterviewerProfile"("userId");
CREATE INDEX "InterviewerProfile_tenantId_trainingStatus_idx" ON "InterviewerProfile"("tenantId", "trainingStatus");
CREATE UNIQUE INDEX "InterviewPool_tenantId_name_key" ON "InterviewPool"("tenantId", "name");
CREATE INDEX "InterviewPool_tenantId_branchId_active_idx" ON "InterviewPool"("tenantId", "branchId", "active");
CREATE UNIQUE INDEX "InterviewPoolMember_poolId_userId_key" ON "InterviewPoolMember"("poolId", "userId");
CREATE INDEX "InterviewPoolMember_tenantId_userId_active_idx" ON "InterviewPoolMember"("tenantId", "userId", "active");
CREATE INDEX "InterviewSequence_tenantId_applicationId_status_idx" ON "InterviewSequence"("tenantId", "applicationId", "status");
CREATE UNIQUE INDEX "ApplicationInterviewParticipant_interviewId_userId_key" ON "ApplicationInterviewParticipant"("interviewId", "userId");
CREATE INDEX "ApplicationInterviewParticipant_tenantId_userId_status_idx" ON "ApplicationInterviewParticipant"("tenantId", "userId", "status");
CREATE INDEX "ApplicationInterviewParticipant_poolId_status_idx" ON "ApplicationInterviewParticipant"("poolId", "status");
CREATE UNIQUE INDEX "InterviewResource_tenantId_branchId_name_key" ON "InterviewResource"("tenantId", "branchId", "name");
CREATE INDEX "InterviewResource_tenantId_branchId_active_idx" ON "InterviewResource"("tenantId", "branchId", "active");
CREATE UNIQUE INDEX "InterviewResourceBooking_interviewId_resourceId_key" ON "InterviewResourceBooking"("interviewId", "resourceId");
CREATE INDEX "InterviewResourceBooking_tenantId_resourceId_startsAt_endsAt_idx" ON "InterviewResourceBooking"("tenantId", "resourceId", "startsAt", "endsAt");
CREATE UNIQUE INDEX "InterviewSchedulingRequest_tokenHash_key" ON "InterviewSchedulingRequest"("tokenHash");
CREATE INDEX "InterviewSchedulingRequest_tenantId_status_expiresAt_idx" ON "InterviewSchedulingRequest"("tenantId", "status", "expiresAt");
CREATE INDEX "InterviewSchedulingRequest_tenantId_applicationId_createdAt_idx" ON "InterviewSchedulingRequest"("tenantId", "applicationId", "createdAt");

ALTER TABLE "InterviewerProfile" ADD CONSTRAINT "InterviewerProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewerProfile" ADD CONSTRAINT "InterviewerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewPool" ADD CONSTRAINT "InterviewPool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewPool" ADD CONSTRAINT "InterviewPool_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewPoolMember" ADD CONSTRAINT "InterviewPoolMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewPoolMember" ADD CONSTRAINT "InterviewPoolMember_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "InterviewPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewPoolMember" ADD CONSTRAINT "InterviewPoolMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSequence" ADD CONSTRAINT "InterviewSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSequence" ADD CONSTRAINT "InterviewSequence_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterviewParticipant" ADD CONSTRAINT "ApplicationInterviewParticipant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterviewParticipant" ADD CONSTRAINT "ApplicationInterviewParticipant_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "ApplicationInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterviewParticipant" ADD CONSTRAINT "ApplicationInterviewParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewResource" ADD CONSTRAINT "InterviewResource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewResource" ADD CONSTRAINT "InterviewResource_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewResourceBooking" ADD CONSTRAINT "InterviewResourceBooking_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewResourceBooking" ADD CONSTRAINT "InterviewResourceBooking_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "ApplicationInterview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewResourceBooking" ADD CONSTRAINT "InterviewResourceBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "InterviewResource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterviewSchedulingRequest" ADD CONSTRAINT "InterviewSchedulingRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSchedulingRequest" ADD CONSTRAINT "InterviewSchedulingRequest_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSchedulingRequest" ADD CONSTRAINT "InterviewSchedulingRequest_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "InterviewPool"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InterviewSchedulingRequest" ADD CONSTRAINT "InterviewSchedulingRequest_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "InterviewSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationInterview" ADD CONSTRAINT "ApplicationInterview_schedulingRequestId_fkey" FOREIGN KEY ("schedulingRequestId") REFERENCES "InterviewSchedulingRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "InterviewerProfile" ("id", "tenantId", "userId", "trainingStatus", "trainedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."tenantId", u."id", 'CERTIFIED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" u
WHERE EXISTS (
  SELECT 1 FROM "UserRole" ur JOIN "Role" r ON r."id" = ur."roleId"
  WHERE ur."userId" = u."id" AND r."code" IN ('INTERVIEWER', 'RECRUITER', 'TENANT_ADMIN', 'ADMIN')
)
ON CONFLICT ("userId") DO NOTHING;

INSERT INTO "ApplicationInterviewParticipant" ("id", "tenantId", "interviewId", "userId", "role", "status", "respondedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, i."tenantId", i."id", i."interviewerUserId", 'LEAD', 'ACCEPTED', i."createdAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "ApplicationInterview" i
ON CONFLICT ("interviewId", "userId") DO NOTHING;
