CREATE TABLE "RecruitmentSourceCost" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruitmentSourceCost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HiringQualityReview" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "checkpointDays" INTEGER NOT NULL,
  "performanceScore" INTEGER NOT NULL,
  "retained" BOOLEAN NOT NULL,
  "managerComment" TEXT,
  "reviewedById" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HiringQualityReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruitmentSourceCost_tenantId_source_periodStart_periodEnd_key" ON "RecruitmentSourceCost"("tenantId", "source", "periodStart", "periodEnd");
CREATE INDEX "RecruitmentSourceCost_tenantId_periodStart_periodEnd_idx" ON "RecruitmentSourceCost"("tenantId", "periodStart", "periodEnd");
CREATE UNIQUE INDEX "HiringQualityReview_employeeId_checkpointDays_key" ON "HiringQualityReview"("employeeId", "checkpointDays");
CREATE INDEX "HiringQualityReview_tenantId_checkpointDays_reviewedAt_idx" ON "HiringQualityReview"("tenantId", "checkpointDays", "reviewedAt");

ALTER TABLE "RecruitmentSourceCost" ADD CONSTRAINT "RecruitmentSourceCost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringQualityReview" ADD CONSTRAINT "HiringQualityReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HiringQualityReview" ADD CONSTRAINT "HiringQualityReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
