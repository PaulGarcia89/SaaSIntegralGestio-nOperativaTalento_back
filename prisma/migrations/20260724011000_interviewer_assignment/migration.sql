ALTER TABLE "VacancyApplication"
ADD COLUMN "interviewerUserId" TEXT;

ALTER TABLE "VacancyApplication"
ADD CONSTRAINT "VacancyApplication_interviewerUserId_fkey"
FOREIGN KEY ("interviewerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VacancyApplication_tenantId_interviewerUserId_interviewScheduledAt_idx"
ON "VacancyApplication"("tenantId", "interviewerUserId", "interviewScheduledAt");
