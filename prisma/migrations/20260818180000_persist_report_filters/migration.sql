CREATE TABLE "ReportSavedFilter" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportSavedFilter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportSavedFilter_tenantId_userId_name_key"
  ON "ReportSavedFilter"("tenantId", "userId", "name");

CREATE INDEX "ReportSavedFilter_tenantId_userId_updatedAt_idx"
  ON "ReportSavedFilter"("tenantId", "userId", "updatedAt");

ALTER TABLE "ReportSavedFilter"
  ADD CONSTRAINT "ReportSavedFilter_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportSavedFilter"
  ADD CONSTRAINT "ReportSavedFilter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
