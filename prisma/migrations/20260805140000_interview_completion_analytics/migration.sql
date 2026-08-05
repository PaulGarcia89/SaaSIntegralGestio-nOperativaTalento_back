ALTER TABLE "ApplicationInterview"
ADD COLUMN "completedAt" TIMESTAMP(3);

UPDATE "ApplicationInterview"
SET "completedAt" = "updatedAt"
WHERE "status" = 'COMPLETED';

CREATE INDEX "ApplicationInterview_tenantId_completedAt_idx"
ON "ApplicationInterview"("tenantId", "completedAt");
