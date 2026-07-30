CREATE TABLE "TrainingCompliancePolicy" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "dueDays" INTEGER NOT NULL DEFAULT 30,
  "renewalDays" INTEGER,
  "reminderDays" INTEGER[] NOT NULL DEFAULT ARRAY[7, 2]::INTEGER[],
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingCompliancePolicy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TrainingCompliancePolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TrainingCompliancePolicy_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TrainingCompliancePolicy_tenantId_courseId_key"
  ON "TrainingCompliancePolicy"("tenantId", "courseId");
CREATE INDEX "TrainingCompliancePolicy_tenantId_isActive_idx"
  ON "TrainingCompliancePolicy"("tenantId", "isActive");

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'training.analytics.read', 'Consultar analítica formativa', 'Consultar métricas y reportes de formación', NOW(), NOW()),
  (gen_random_uuid()::text, 'training.compliance.manage', 'Administrar cumplimiento formativo', 'Configurar vencimientos, renovaciones y recordatorios', NOW(), NOW()),
  (gen_random_uuid()::text, 'training.reports.export', 'Exportar reportes formativos', 'Exportar información operativa de formación', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" IN (
  'training.analytics.read',
  'training.compliance.manage',
  'training.reports.export'
)
WHERE r."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN', 'HR_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p ON p."code" = 'training.analytics.read'
WHERE r."code" IN ('INSTRUCTOR', 'SUPERVISOR')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
