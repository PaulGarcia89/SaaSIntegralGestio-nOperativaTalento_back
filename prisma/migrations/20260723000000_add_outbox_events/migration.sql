CREATE TYPE "OutboxEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "userId" TEXT,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" TEXT,
  "eventName" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "status" "OutboxEventStatus" NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 10,
  "nextRetryAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "processingNode" TEXT,
  "lastError" TEXT,
  "deadLetterReason" TEXT,
  "correlationId" TEXT,
  "causationId" TEXT,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_tenantId_idempotencyKey_key"
  ON "OutboxEvent"("tenantId", "idempotencyKey");

CREATE INDEX "OutboxEvent_status_nextRetryAt_createdAt_idx"
  ON "OutboxEvent"("status", "nextRetryAt", "createdAt");

CREATE INDEX "OutboxEvent_tenantId_eventName_eventVersion_createdAt_idx"
  ON "OutboxEvent"("tenantId", "eventName", "eventVersion", "createdAt");

CREATE INDEX "OutboxEvent_aggregateType_aggregateId_createdAt_idx"
  ON "OutboxEvent"("aggregateType", "aggregateId", "createdAt");

CREATE INDEX "OutboxEvent_correlationId_createdAt_idx"
  ON "OutboxEvent"("correlationId", "createdAt");

CREATE INDEX "OutboxEvent_causationId_createdAt_idx"
  ON "OutboxEvent"("causationId", "createdAt");

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OutboxEvent"
ADD CONSTRAINT "OutboxEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
