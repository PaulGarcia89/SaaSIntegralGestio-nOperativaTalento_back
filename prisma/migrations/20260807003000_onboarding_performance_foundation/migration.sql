CREATE TABLE "PerformanceObjective" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "targetValue" INTEGER NOT NULL DEFAULT 100,
  "currentValue" INTEGER NOT NULL DEFAULT 0,
  "weight" INTEGER NOT NULL DEFAULT 1,
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceObjective_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PerformanceEvaluation" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "evaluatorUserId" TEXT,
  "periodDays" INTEGER NOT NULL,
  "score" INTEGER NOT NULL,
  "notes" TEXT,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PerformanceEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PerformanceEvaluation_workflowId_periodDays_key" ON "PerformanceEvaluation"("workflowId", "periodDays");
CREATE INDEX "PerformanceObjective_tenantId_branchId_employeeId_idx" ON "PerformanceObjective"("tenantId", "branchId", "employeeId");
CREATE INDEX "PerformanceObjective_workflowId_dueDate_idx" ON "PerformanceObjective"("workflowId", "dueDate");
CREATE INDEX "PerformanceEvaluation_tenantId_branchId_employeeId_idx" ON "PerformanceEvaluation"("tenantId", "branchId", "employeeId");
ALTER TABLE "PerformanceObjective" ADD CONSTRAINT "PerformanceObjective_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceObjective" ADD CONSTRAINT "PerformanceObjective_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceObjective" ADD CONSTRAINT "PerformanceObjective_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceObjective" ADD CONSTRAINT "PerformanceObjective_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceObjective" ADD CONSTRAINT "PerformanceObjective_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "MasterWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PerformanceEvaluation" ADD CONSTRAINT "PerformanceEvaluation_evaluatorUserId_fkey" FOREIGN KEY ("evaluatorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
