CREATE TYPE "AtsFileStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DELETED', 'EXPIRED', 'QUARANTINED');
CREATE TYPE "AtsFileScanStatus" AS ENUM ('CLEAN', 'SKIPPED', 'INFECTED');

CREATE TABLE "CandidateResumeFile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "applicationId" TEXT,
  "version" INTEGER NOT NULL,
  "status" "AtsFileStatus" NOT NULL DEFAULT 'ACTIVE',
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "scanStatus" "AtsFileScanStatus" NOT NULL,
  "scanEngine" TEXT,
  "uploadedByType" TEXT NOT NULL,
  "uploadedById" TEXT,
  "consentGrantedAt" TIMESTAMP(3) NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "consentIp" TEXT,
  "consentUserAgent" TEXT,
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "supersededAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  "deletionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CandidateResumeFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VacancyImageFile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "AtsFileStatus" NOT NULL DEFAULT 'ACTIVE',
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "scanStatus" "AtsFileScanStatus" NOT NULL,
  "scanEngine" TEXT,
  "uploadedByUserId" TEXT NOT NULL,
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "supersededAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  "deletionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VacancyImageFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateResumeFile_storageKey_key" ON "CandidateResumeFile"("storageKey");
CREATE UNIQUE INDEX "CandidateResumeFile_candidateId_version_key" ON "CandidateResumeFile"("candidateId", "version");
CREATE INDEX "CandidateResumeFile_tenantId_candidateId_status_idx" ON "CandidateResumeFile"("tenantId", "candidateId", "status");
CREATE INDEX "CandidateResumeFile_tenantId_retainUntil_status_idx" ON "CandidateResumeFile"("tenantId", "retainUntil", "status");
CREATE INDEX "CandidateResumeFile_applicationId_status_idx" ON "CandidateResumeFile"("applicationId", "status");

CREATE UNIQUE INDEX "VacancyImageFile_storageKey_key" ON "VacancyImageFile"("storageKey");
CREATE UNIQUE INDEX "VacancyImageFile_vacancyId_version_key" ON "VacancyImageFile"("vacancyId", "version");
CREATE INDEX "VacancyImageFile_tenantId_vacancyId_status_idx" ON "VacancyImageFile"("tenantId", "vacancyId", "status");
CREATE INDEX "VacancyImageFile_tenantId_retainUntil_status_idx" ON "VacancyImageFile"("tenantId", "retainUntil", "status");

ALTER TABLE "CandidateResumeFile" ADD CONSTRAINT "CandidateResumeFile_candidateId_fkey"
FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateResumeFile" ADD CONSTRAINT "CandidateResumeFile_applicationId_fkey"
FOREIGN KEY ("applicationId") REFERENCES "VacancyApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VacancyImageFile" ADD CONSTRAINT "VacancyImageFile_vacancyId_fkey"
FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
