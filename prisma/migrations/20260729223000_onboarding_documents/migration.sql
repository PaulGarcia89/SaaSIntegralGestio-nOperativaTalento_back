ALTER TABLE "OnboardingFlow" ADD COLUMN "templateId" TEXT;
ALTER TABLE "OnboardingTask" ADD COLUMN "taskKey" TEXT;
ALTER TABLE "OnboardingTask" ADD COLUMN "description" TEXT;
ALTER TABLE "OnboardingTask" ADD COLUMN "dependsOnKeys" JSONB;

UPDATE "OnboardingTask"
SET "taskKey" = lower(replace("taskType"::text, '_', '-')) || '-' || substr("id", 1, 8)
WHERE "taskKey" IS NULL;

ALTER TABLE "OnboardingTask" ALTER COLUMN "taskKey" SET NOT NULL;

CREATE TABLE "OnboardingTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingTemplateTask" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "taskType" "OnboardingTaskType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "ownerType" "WorkflowOwnerType" NOT NULL DEFAULT 'SYSTEM',
  "ownerId" TEXT,
  "dueOffsetDays" INTEGER,
  "dependsOnKeys" JSONB,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OnboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "onboardingFlowId" TEXT,
  "taskId" TEXT,
  "category" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "scanStatus" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  "uploadedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OnboardingTask_onboardingFlowId_taskKey_key" ON "OnboardingTask"("onboardingFlowId", "taskKey");
CREATE UNIQUE INDEX "OnboardingTemplate_tenantId_name_version_key" ON "OnboardingTemplate"("tenantId", "name", "version");
CREATE INDEX "OnboardingTemplate_tenantId_isActive_isDefault_idx" ON "OnboardingTemplate"("tenantId", "isActive", "isDefault");
CREATE UNIQUE INDEX "OnboardingTemplateTask_templateId_taskKey_key" ON "OnboardingTemplateTask"("templateId", "taskKey");
CREATE INDEX "OnboardingTemplateTask_tenantId_templateId_sortOrder_idx" ON "OnboardingTemplateTask"("tenantId", "templateId", "sortOrder");
CREATE INDEX "EmployeeDocument_tenantId_employeeId_status_idx" ON "EmployeeDocument"("tenantId", "employeeId", "status");
CREATE INDEX "EmployeeDocument_onboardingFlowId_createdAt_idx" ON "EmployeeDocument"("onboardingFlowId", "createdAt");
CREATE UNIQUE INDEX "EmployeeDocument_tenantId_storageKey_key" ON "EmployeeDocument"("tenantId", "storageKey");

ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingFlow" ADD CONSTRAINT "OnboardingFlow_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_onboardingFlowId_fkey" FOREIGN KEY ("onboardingFlowId") REFERENCES "OnboardingFlow"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "OnboardingTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
