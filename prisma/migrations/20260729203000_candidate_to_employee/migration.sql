ALTER TYPE "ApplicationTimelineEventType" ADD VALUE 'HIRED';

ALTER TABLE "Employee"
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "supervisorUserId" TEXT,
  ADD COLUMN "sourceCandidateId" TEXT;

CREATE UNIQUE INDEX "Employee_tenantId_sourceCandidateId_key"
  ON "Employee"("tenantId", "sourceCandidateId");

CREATE INDEX "Employee_tenantId_supervisorUserId_idx"
  ON "Employee"("tenantId", "supervisorUserId");

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_supervisorUserId_fkey"
  FOREIGN KEY ("supervisorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Employee"
  ADD CONSTRAINT "Employee_sourceCandidateId_fkey"
  FOREIGN KEY ("sourceCandidateId") REFERENCES "Candidate"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
