ALTER TYPE "VacancyStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

CREATE TYPE "PersonnelRequisitionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PersonnelRequisitionApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "VacancyChangeType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'CLONED', 'REQUISITION_LINKED', 'LOCATION_CHANGED');

CREATE TABLE "PersonnelRequisition" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "department" TEXT,
  "justification" TEXT NOT NULL,
  "openings" INTEGER NOT NULL DEFAULT 1,
  "budgetMin" INTEGER,
  "budgetMax" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "targetStartDate" TIMESTAMP(3),
  "status" "PersonnelRequisitionStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonnelRequisition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonnelRequisitionLocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "PersonnelRequisitionLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonnelRequisitionApproval" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "requisitionId" TEXT NOT NULL,
  "approverUserId" TEXT NOT NULL,
  "status" "PersonnelRequisitionApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonnelRequisitionApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VacancyLocation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "city" TEXT,
  "country" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VacancyLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VacancyChangeEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "vacancyId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "type" "VacancyChangeType" NOT NULL,
  "reason" TEXT,
  "previousValue" JSONB,
  "newValue" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VacancyChangeEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Vacancy" ADD COLUMN "requisitionId" TEXT;
ALTER TABLE "Vacancy" ADD COLUMN "clonedFromVacancyId" TEXT;

CREATE UNIQUE INDEX "PersonnelRequisitionLocation_requisitionId_branchId_key" ON "PersonnelRequisitionLocation"("requisitionId", "branchId");
CREATE UNIQUE INDEX "PersonnelRequisitionApproval_requisitionId_approverUserId_key" ON "PersonnelRequisitionApproval"("requisitionId", "approverUserId");
CREATE UNIQUE INDEX "VacancyLocation_vacancyId_branchId_key" ON "VacancyLocation"("vacancyId", "branchId");
CREATE INDEX "PersonnelRequisition_tenantId_status_createdAt_idx" ON "PersonnelRequisition"("tenantId", "status", "createdAt");
CREATE INDEX "PersonnelRequisition_requestedByUserId_idx" ON "PersonnelRequisition"("requestedByUserId");
CREATE INDEX "PersonnelRequisitionLocation_tenantId_branchId_idx" ON "PersonnelRequisitionLocation"("tenantId", "branchId");
CREATE INDEX "PersonnelRequisitionApproval_tenantId_approverUserId_status_idx" ON "PersonnelRequisitionApproval"("tenantId", "approverUserId", "status");
CREATE INDEX "VacancyLocation_tenantId_branchId_idx" ON "VacancyLocation"("tenantId", "branchId");
CREATE INDEX "VacancyChangeEvent_tenantId_vacancyId_createdAt_idx" ON "VacancyChangeEvent"("tenantId", "vacancyId", "createdAt");
CREATE INDEX "Vacancy_tenantId_requisitionId_idx" ON "Vacancy"("tenantId", "requisitionId");
CREATE INDEX "Vacancy_clonedFromVacancyId_idx" ON "Vacancy"("clonedFromVacancyId");

ALTER TABLE "PersonnelRequisition" ADD CONSTRAINT "PersonnelRequisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisition" ADD CONSTRAINT "PersonnelRequisition_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionLocation" ADD CONSTRAINT "PersonnelRequisitionLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionLocation" ADD CONSTRAINT "PersonnelRequisitionLocation_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PersonnelRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionLocation" ADD CONSTRAINT "PersonnelRequisitionLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionApproval" ADD CONSTRAINT "PersonnelRequisitionApproval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionApproval" ADD CONSTRAINT "PersonnelRequisitionApproval_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PersonnelRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionApproval" ADD CONSTRAINT "PersonnelRequisitionApproval_approverUserId_fkey" FOREIGN KEY ("approverUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonnelRequisitionApproval" ADD CONSTRAINT "PersonnelRequisitionApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VacancyLocation" ADD CONSTRAINT "VacancyLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyLocation" ADD CONSTRAINT "VacancyLocation_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyLocation" ADD CONSTRAINT "VacancyLocation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VacancyChangeEvent" ADD CONSTRAINT "VacancyChangeEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyChangeEvent" ADD CONSTRAINT "VacancyChangeEvent_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyChangeEvent" ADD CONSTRAINT "VacancyChangeEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "PersonnelRequisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_clonedFromVacancyId_fkey" FOREIGN KEY ("clonedFromVacancyId") REFERENCES "Vacancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "VacancyLocation" ("id", "tenantId", "vacancyId", "branchId", "city", "country", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, "tenantId", "id", "branchId", "city", "country", true, CURRENT_TIMESTAMP
FROM "Vacancy"
ON CONFLICT ("vacancyId", "branchId") DO NOTHING;

CREATE OR REPLACE FUNCTION prevent_vacancy_change_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Vacancy change history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "VacancyChangeEvent_immutable_update"
BEFORE UPDATE ON "VacancyChangeEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_vacancy_change_event_mutation();

CREATE TRIGGER "VacancyChangeEvent_immutable_delete"
BEFORE DELETE ON "VacancyChangeEvent"
FOR EACH ROW EXECUTE FUNCTION prevent_vacancy_change_event_mutation();
