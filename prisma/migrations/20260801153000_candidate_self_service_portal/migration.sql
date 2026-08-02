ALTER TYPE "ApplicationStatus" ADD VALUE IF NOT EXISTS 'WITHDRAWN';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'APPLICATION_WITHDRAWN';

CREATE TYPE "CandidatePrivacyRequestType" AS ENUM ('EXPORT', 'ANONYMIZE', 'DELETE');
CREATE TYPE "CandidatePrivacyRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');

ALTER TABLE "CandidateAccount"
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "phone" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "linkedinUrl" TEXT,
  ADD COLUMN "portfolioUrl" TEXT,
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'es',
  ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN "statusUpdates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "interviewReminders" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "offerNotifications" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "profileSource" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "anonymizedAt" TIMESTAMP(3);

UPDATE "CandidateAccount" account
SET
  "fullName" = source."fullName",
  "phone" = source."phone",
  "city" = source."city",
  "linkedinUrl" = source."linkedinUrl",
  "portfolioUrl" = source."portfolioUrl"
FROM (
  SELECT DISTINCT ON ("accountId") "accountId", "fullName", "phone", "city", "linkedinUrl", "portfolioUrl"
  FROM "Candidate"
  WHERE "accountId" IS NOT NULL
  ORDER BY "accountId", "updatedAt" DESC
) source
WHERE account."id" = source."accountId";

ALTER TABLE "VacancyApplication"
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "withdrawalReason" TEXT;

CREATE TABLE "CandidateAccountToken" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateAccountToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidatePrivacyRequest" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "type" "CandidatePrivacyRequestType" NOT NULL,
  "status" "CandidatePrivacyRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "response" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidatePrivacyRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateExternalIdentity" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "email" TEXT,
  "profileData" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateOAuthState" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "stateHash" TEXT NOT NULL,
  "returnUrl" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateAccountToken_tokenHash_key" ON "CandidateAccountToken"("tokenHash");
CREATE INDEX "CandidateAccountToken_accountId_purpose_expiresAt_idx" ON "CandidateAccountToken"("accountId", "purpose", "expiresAt");
CREATE INDEX "CandidatePrivacyRequest_accountId_status_requestedAt_idx" ON "CandidatePrivacyRequest"("accountId", "status", "requestedAt");
CREATE UNIQUE INDEX "CandidateExternalIdentity_provider_subject_key" ON "CandidateExternalIdentity"("provider", "subject");
CREATE INDEX "CandidateExternalIdentity_accountId_provider_idx" ON "CandidateExternalIdentity"("accountId", "provider");
CREATE UNIQUE INDEX "CandidateOAuthState_stateHash_key" ON "CandidateOAuthState"("stateHash");
CREATE INDEX "CandidateOAuthState_provider_expiresAt_idx" ON "CandidateOAuthState"("provider", "expiresAt");
CREATE INDEX "VacancyApplication_candidateId_withdrawnAt_idx" ON "VacancyApplication"("candidateId", "withdrawnAt");

ALTER TABLE "CandidateAccountToken" ADD CONSTRAINT "CandidateAccountToken_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CandidateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidatePrivacyRequest" ADD CONSTRAINT "CandidatePrivacyRequest_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CandidateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateExternalIdentity" ADD CONSTRAINT "CandidateExternalIdentity_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "CandidateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
