CREATE TABLE "PublicRequestRateLimit" (
  "id" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "hits" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublicRequestRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PublicRequestRateLimit_keyHash_key" ON "PublicRequestRateLimit"("keyHash");
CREATE INDEX "PublicRequestRateLimit_expiresAt_idx" ON "PublicRequestRateLimit"("expiresAt");

CREATE TABLE "CandidateConversionEvent" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateConversionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateConversionEvent_eventKey_key" ON "CandidateConversionEvent"("eventKey");
CREATE INDEX "CandidateConversionEvent_tenantId_createdAt_idx" ON "CandidateConversionEvent"("tenantId", "createdAt");
CREATE INDEX "CandidateConversionEvent_tenantId_vacancyId_kind_createdAt_idx" ON "CandidateConversionEvent"("tenantId", "vacancyId", "kind", "createdAt");
ALTER TABLE "CandidateConversionEvent" ADD CONSTRAINT "CandidateConversionEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateConversionEvent" ADD CONSTRAINT "CandidateConversionEvent_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
