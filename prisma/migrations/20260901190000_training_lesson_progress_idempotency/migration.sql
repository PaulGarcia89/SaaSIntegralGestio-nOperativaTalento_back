ALTER TABLE "TrainingLessonProgress" ADD COLUMN "lastRequestId" TEXT;

CREATE UNIQUE INDEX "TrainingLessonProgress_tenantId_lastRequestId_key"
ON "TrainingLessonProgress"("tenantId", "lastRequestId");
