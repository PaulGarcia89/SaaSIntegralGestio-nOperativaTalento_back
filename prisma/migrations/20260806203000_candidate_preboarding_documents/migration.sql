ALTER TABLE "EmployeeDocument" ALTER COLUMN "uploadedById" DROP NOT NULL;
ALTER TABLE "EmployeeDocument" ADD COLUMN "uploadedByCandidateAccountId" TEXT;
CREATE INDEX "EmployeeDocument_uploadedByCandidateAccountId_idx" ON "EmployeeDocument"("uploadedByCandidateAccountId");
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedByCandidateAccountId_fkey" FOREIGN KEY ("uploadedByCandidateAccountId") REFERENCES "CandidateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
