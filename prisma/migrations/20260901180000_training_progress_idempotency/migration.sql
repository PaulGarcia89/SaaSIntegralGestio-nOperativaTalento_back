ALTER TABLE "TrainingProgress" ADD COLUMN "lastRequestId" TEXT;
ALTER TABLE "TrainingQuizAttempt" ADD COLUMN "submissionRequestId" TEXT;

CREATE INDEX "TrainingProgress_tenantId_userId_lastRequestId_idx"
ON "TrainingProgress"("tenantId", "userId", "lastRequestId");

CREATE UNIQUE INDEX "TrainingQuizAttempt_tenantId_submissionRequestId_key"
ON "TrainingQuizAttempt"("tenantId", "submissionRequestId");
