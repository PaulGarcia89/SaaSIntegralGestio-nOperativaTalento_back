CREATE TYPE "HiringContractPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

ALTER TABLE "HiringContract"
  ADD COLUMN "priority" "HiringContractPriority" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN "deadlineAt" TIMESTAMP(3);

CREATE INDEX "HiringContract_tenantId_priority_deadlineAt_idx"
  ON "HiringContract"("tenantId", "priority", "deadlineAt");
