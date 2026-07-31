CREATE TYPE "TrainingOperationKind" AS ENUM ('PROCESS_DUE_COURSES', 'PROCESS_DUE_LAUNCHES', 'RECOVER_WEBHOOKS', 'RETRY_FAILED_WEBHOOKS', 'CLEAR_STALE_LAUNCH_LOCKS');
CREATE TYPE "TrainingOperationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "TrainingOperationRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" "TrainingOperationKind" NOT NULL,
    "status" "TrainingOperationStatus" NOT NULL DEFAULT 'RUNNING',
    "result" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrainingOperationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrainingOperationRun_tenantId_createdAt_idx" ON "TrainingOperationRun"("tenantId", "createdAt");
CREATE INDEX "TrainingOperationRun_tenantId_kind_status_idx" ON "TrainingOperationRun"("tenantId", "kind", "status");

ALTER TABLE "TrainingOperationRun" ADD CONSTRAINT "TrainingOperationRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrainingOperationRun" ADD CONSTRAINT "TrainingOperationRun_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
