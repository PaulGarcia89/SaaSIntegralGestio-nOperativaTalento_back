CREATE TABLE "CandidateAccount" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CandidateAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateAccount_email_key" ON "CandidateAccount"("email");
ALTER TABLE "Candidate" ADD COLUMN "accountId" TEXT;
CREATE INDEX "Candidate_accountId_idx" ON "Candidate"("accountId");
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CandidateAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
