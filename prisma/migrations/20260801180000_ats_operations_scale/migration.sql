ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'SLA_WARNING';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'SLA_ESCALATED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'SLA_REASSIGNED';
ALTER TYPE "ApplicationTimelineEventType" ADD VALUE IF NOT EXISTS 'RECRUITER_ASSIGNED';

CREATE TYPE "RejectionReasonCategory" AS ENUM (
  'QUALIFICATIONS',
  'EXPERIENCE',
  'COMPENSATION',
  'AVAILABILITY',
  'LOCATION',
  'CULTURE',
  'CANDIDATE_DECISION',
  'POSITION_CLOSED',
  'DUPLICATE',
  'OTHER'
);

ALTER TABLE "VacancyStage"
  ADD COLUMN "slaWarningHoursBefore" INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN "slaEscalationHours" INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN "autoReassignAfterHours" INTEGER;

ALTER TABLE "VacancyApplication"
  ADD COLUMN "rejectionReasonId" TEXT,
  ADD COLUMN "assignedRecruiterId" TEXT,
  ADD COLUMN "slaWarningSentAt" TIMESTAMP(3),
  ADD COLUMN "slaEscalatedAt" TIMESTAMP(3),
  ADD COLUMN "slaReassignedAt" TIMESTAMP(3);

ALTER TABLE "ApplicationStageTransitionRequest"
  ADD COLUMN "rejectionReasonId" TEXT;

CREATE TABLE "ApplicationSavedView" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "filters" JSONB NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApplicationSavedView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecruitmentRejectionReason" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "category" "RejectionReasonCategory" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecruitmentRejectionReason_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApplicationSavedView_tenantId_userId_name_key" ON "ApplicationSavedView"("tenantId", "userId", "name");
CREATE INDEX "ApplicationSavedView_tenantId_userId_updatedAt_idx" ON "ApplicationSavedView"("tenantId", "userId", "updatedAt");
CREATE UNIQUE INDEX "RecruitmentRejectionReason_tenantId_code_key" ON "RecruitmentRejectionReason"("tenantId", "code");
CREATE INDEX "RecruitmentRejectionReason_tenantId_active_position_idx" ON "RecruitmentRejectionReason"("tenantId", "active", "position");
CREATE INDEX "VacancyApplication_tenantId_assignedRecruiterId_stageEnteredAt_idx" ON "VacancyApplication"("tenantId", "assignedRecruiterId", "stageEnteredAt");
CREATE INDEX "VacancyApplication_tenantId_rejectionReasonId_status_idx" ON "VacancyApplication"("tenantId", "rejectionReasonId", "status");
CREATE INDEX "ApplicationStageTransitionRequest_tenantId_rejectionReasonId_idx" ON "ApplicationStageTransitionRequest"("tenantId", "rejectionReasonId");

ALTER TABLE "ApplicationSavedView" ADD CONSTRAINT "ApplicationSavedView_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApplicationSavedView" ADD CONSTRAINT "ApplicationSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecruitmentRejectionReason" ADD CONSTRAINT "RecruitmentRejectionReason_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VacancyApplication" ADD CONSTRAINT "VacancyApplication_rejectionReasonId_fkey" FOREIGN KEY ("rejectionReasonId") REFERENCES "RecruitmentRejectionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VacancyApplication" ADD CONSTRAINT "VacancyApplication_assignedRecruiterId_fkey" FOREIGN KEY ("assignedRecruiterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ApplicationStageTransitionRequest" ADD CONSTRAINT "ApplicationStageTransitionRequest_rejectionReasonId_fkey" FOREIGN KEY ("rejectionReasonId") REFERENCES "RecruitmentRejectionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "RecruitmentRejectionReason" ("id", "tenantId", "code", "label", "category", "position", "updatedAt")
SELECT gen_random_uuid()::text, tenant."id", defaults.code, defaults.label, defaults.category::"RejectionReasonCategory", defaults.position, CURRENT_TIMESTAMP
FROM "Tenant" tenant
CROSS JOIN (VALUES
  ('QUALIFICATIONS_MISMATCH', 'No cumple requisitos mínimos', 'QUALIFICATIONS', 10),
  ('INSUFFICIENT_EXPERIENCE', 'Experiencia insuficiente', 'EXPERIENCE', 20),
  ('COMPENSATION_MISMATCH', 'Expectativa salarial fuera de rango', 'COMPENSATION', 30),
  ('AVAILABILITY_MISMATCH', 'Disponibilidad incompatible', 'AVAILABILITY', 40),
  ('LOCATION_MISMATCH', 'Ubicación o modalidad incompatible', 'LOCATION', 50),
  ('CANDIDATE_WITHDREW', 'Candidato desistió del proceso', 'CANDIDATE_DECISION', 60),
  ('POSITION_CLOSED', 'Vacante cerrada o cancelada', 'POSITION_CLOSED', 70),
  ('DUPLICATE_APPLICATION', 'Postulación duplicada', 'DUPLICATE', 80),
  ('OTHER', 'Otro motivo', 'OTHER', 90)
) AS defaults(code, label, category, position)
ON CONFLICT ("tenantId", "code") DO NOTHING;
