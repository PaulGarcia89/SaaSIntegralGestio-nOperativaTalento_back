ALTER TYPE "TrainingQuizAttemptStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW';

ALTER TABLE "TrainingQuizQuestion"
  ADD COLUMN "points" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "requiresManualGrading" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TrainingQuizAttempt"
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "gradedAt" TIMESTAMP(3),
  ADD COLUMN "gradedById" TEXT,
  ADD COLUMN "feedback" TEXT;

ALTER TABLE "TrainingQuizAnswer"
  ADD COLUMN "selectedOptionIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "awardedPoints" INTEGER,
  ADD COLUMN "graderFeedback" TEXT;

ALTER TABLE "TrainingCertificate"
  ADD COLUMN "verificationCode" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revocationReason" TEXT;

UPDATE "TrainingCertificate"
SET "verificationCode" = UPPER(SUBSTRING(REPLACE("id", '-', '') FROM 1 FOR 12))
WHERE "verificationCode" IS NULL;

ALTER TABLE "TrainingCertificate" ALTER COLUMN "verificationCode" SET NOT NULL;
CREATE UNIQUE INDEX "TrainingCertificate_verificationCode_key"
  ON "TrainingCertificate"("verificationCode");

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'training.assessment.manage', 'Administrar evaluaciones', 'Crear y modificar evaluaciones formativas', NOW(), NOW()),
  (gen_random_uuid()::text, 'training.assessment.grade', 'Calificar evaluaciones', 'Revisar respuestas y publicar calificaciones', NOW(), NOW()),
  (gen_random_uuid()::text, 'training.certificate.issue', 'Emitir certificados', 'Emitir certificados de formación', NOW(), NOW()),
  (gen_random_uuid()::text, 'training.certificate.revoke', 'Revocar certificados', 'Revocar certificados emitidos', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'training.assessment.manage',
  'training.assessment.grade',
  'training.certificate.issue',
  'training.certificate.revoke'
)
WHERE r."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN', 'HR_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'training.assessment.manage',
  'training.assessment.grade',
  'training.certificate.issue'
)
WHERE r."code" = 'INSTRUCTOR'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
