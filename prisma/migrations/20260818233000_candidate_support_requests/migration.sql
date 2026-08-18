CREATE TABLE "CandidateSupportRequest" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "response" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CandidateSupportRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CandidateSupportRequest_accountId_status_requestedAt_idx" ON "CandidateSupportRequest"("accountId", "status", "requestedAt");
ALTER TABLE "CandidateSupportRequest" ADD CONSTRAINT "CandidateSupportRequest_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CandidateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
