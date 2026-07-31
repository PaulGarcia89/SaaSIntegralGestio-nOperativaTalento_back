ALTER TABLE "OnboardingTask" ADD COLUMN "required" BOOLEAN NOT NULL DEFAULT true, ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeDocument" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "replacesDocumentId" TEXT, ADD COLUMN "rejectionReason" TEXT, ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "EmployeeDocument_replacesDocumentId_idx" ON "EmployeeDocument"("replacesDocumentId");
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_replacesDocumentId_fkey" FOREIGN KEY ("replacesDocumentId") REFERENCES "EmployeeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
