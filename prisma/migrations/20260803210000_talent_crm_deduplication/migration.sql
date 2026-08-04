CREATE TYPE "CandidateCrmStatus" AS ENUM ('ACTIVE', 'MERGED', 'ARCHIVED');
CREATE TYPE "TalentActivityType" AS ENUM ('NOTE', 'EMAIL', 'CALL', 'MEETING', 'TASK', 'STATUS_CHANGE', 'POOL_CHANGE', 'TAG_CHANGE', 'MERGE');

ALTER TABLE "Candidate"
  ADD COLUMN "crmStatus" "CandidateCrmStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "source" TEXT,
  ADD COLUMN "doNotContact" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mergedIntoId" TEXT,
  ADD COLUMN "mergedAt" TIMESTAMP(3);

CREATE TABLE "TalentPool" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentPool_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TalentPoolMember" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "poolId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentPoolMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TalentTag" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TalentTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateTalentTag" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "addedById" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateTalentTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TalentActivity" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "type" "TalentActivityType" NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "actorId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TalentActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CandidateMergeAudit" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceCandidateId" TEXT NOT NULL,
  "targetCandidateId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceSnapshot" JSONB NOT NULL,
  "targetSnapshot" JSONB NOT NULL,
  "movedApplications" INTEGER NOT NULL DEFAULT 0,
  "movedFiles" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateMergeAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TalentPool_tenantId_name_key" ON "TalentPool"("tenantId", "name");
CREATE INDEX "TalentPool_tenantId_branchId_isActive_idx" ON "TalentPool"("tenantId", "branchId", "isActive");
CREATE UNIQUE INDEX "TalentPoolMember_poolId_candidateId_key" ON "TalentPoolMember"("poolId", "candidateId");
CREATE INDEX "TalentPoolMember_tenantId_candidateId_idx" ON "TalentPoolMember"("tenantId", "candidateId");
CREATE UNIQUE INDEX "TalentTag_tenantId_name_key" ON "TalentTag"("tenantId", "name");
CREATE INDEX "TalentTag_tenantId_isActive_idx" ON "TalentTag"("tenantId", "isActive");
CREATE UNIQUE INDEX "CandidateTalentTag_candidateId_tagId_key" ON "CandidateTalentTag"("candidateId", "tagId");
CREATE INDEX "CandidateTalentTag_tenantId_tagId_idx" ON "CandidateTalentTag"("tenantId", "tagId");
CREATE INDEX "TalentActivity_tenantId_candidateId_createdAt_idx" ON "TalentActivity"("tenantId", "candidateId", "createdAt");
CREATE INDEX "TalentActivity_tenantId_type_dueAt_idx" ON "TalentActivity"("tenantId", "type", "dueAt");
CREATE INDEX "CandidateMergeAudit_tenantId_sourceCandidateId_idx" ON "CandidateMergeAudit"("tenantId", "sourceCandidateId");
CREATE INDEX "CandidateMergeAudit_tenantId_targetCandidateId_idx" ON "CandidateMergeAudit"("tenantId", "targetCandidateId");
CREATE INDEX "CandidateMergeAudit_tenantId_createdAt_idx" ON "CandidateMergeAudit"("tenantId", "createdAt");
CREATE INDEX "Candidate_tenantId_crmStatus_updatedAt_idx" ON "Candidate"("tenantId", "crmStatus", "updatedAt");
CREATE INDEX "Candidate_tenantId_phone_idx" ON "Candidate"("tenantId", "phone");
CREATE INDEX "Candidate_tenantId_linkedinUrl_idx" ON "Candidate"("tenantId", "linkedinUrl");
CREATE INDEX "Candidate_mergedIntoId_idx" ON "Candidate"("mergedIntoId");
CREATE INDEX "Candidate_tenant_normalized_email_idx" ON "Candidate"("tenantId", lower("email"));

ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Candidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentPool" ADD CONSTRAINT "TalentPool_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TalentPoolMember" ADD CONSTRAINT "TalentPoolMember_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "TalentPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentPoolMember" ADD CONSTRAINT "TalentPoolMember_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentTag" ADD CONSTRAINT "TalentTag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateTalentTag" ADD CONSTRAINT "CandidateTalentTag_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateTalentTag" ADD CONSTRAINT "CandidateTalentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TalentTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentActivity" ADD CONSTRAINT "TalentActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TalentActivity" ADD CONSTRAINT "TalentActivity_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateMergeAudit" ADD CONSTRAINT "CandidateMergeAudit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CandidateMergeAudit" ADD CONSTRAINT "CandidateMergeAudit_sourceCandidateId_fkey" FOREIGN KEY ("sourceCandidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CandidateMergeAudit" ADD CONSTRAINT "CandidateMergeAudit_targetCandidateId_fkey" FOREIGN KEY ("targetCandidateId") REFERENCES "Candidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
