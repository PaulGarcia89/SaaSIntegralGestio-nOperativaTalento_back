CREATE TYPE "OutboxDispatchStatus" AS ENUM ('PENDING', 'QUEUED', 'ACKNOWLEDGED', 'FAILED');
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PUBLISHED', 'DISPATCH_PENDING', 'DISPATCHED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER');

CREATE TABLE "OutboxEventDispatch" (
  "id" TEXT NOT NULL,
  "outboxEventId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "queueName" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "jobId" TEXT,
  "dispatchAttempt" INTEGER NOT NULL,
  "status" "OutboxDispatchStatus" NOT NULL DEFAULT 'PENDING',
  "dispatchedAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OutboxEventDispatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationEventLog" (
  "id" TEXT NOT NULL,
  "outboxEventId" TEXT NOT NULL,
  "dispatchId" TEXT,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "eventName" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL,
  "status" "IntegrationEventStatus" NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB,
  "correlationId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "IntegrationEventLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeadLetterEvent" (
  "id" TEXT NOT NULL,
  "outboxEventId" TEXT NOT NULL,
  "dispatchId" TEXT,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "queueName" TEXT,
  "eventName" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "retryCount" INTEGER NOT NULL,
  "firstFailedAt" TIMESTAMP(3) NOT NULL,
  "lastFailedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DeadLetterEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConsumerCheckpoint" (
  "id" TEXT NOT NULL,
  "consumerName" TEXT NOT NULL,
  "queueName" TEXT NOT NULL,
  "lastOutboxEventId" TEXT,
  "lastDispatchId" TEXT,
  "lastJobId" TEXT,
  "lastCorrelationId" TEXT,
  "lastProcessedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConsumerCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEventDispatch_outboxEventId_dispatchAttempt_key"
  ON "OutboxEventDispatch"("outboxEventId", "dispatchAttempt");

CREATE INDEX "OutboxEventDispatch_status_createdAt_idx"
  ON "OutboxEventDispatch"("status", "createdAt");

CREATE INDEX "OutboxEventDispatch_queueName_status_createdAt_idx"
  ON "OutboxEventDispatch"("queueName", "status", "createdAt");

CREATE INDEX "OutboxEventDispatch_tenantId_createdAt_idx"
  ON "OutboxEventDispatch"("tenantId", "createdAt");

CREATE INDEX "IntegrationEventLog_outboxEventId_createdAt_idx"
  ON "IntegrationEventLog"("outboxEventId", "createdAt");

CREATE INDEX "IntegrationEventLog_dispatchId_createdAt_idx"
  ON "IntegrationEventLog"("dispatchId", "createdAt");

CREATE INDEX "IntegrationEventLog_tenantId_eventName_createdAt_idx"
  ON "IntegrationEventLog"("tenantId", "eventName", "createdAt");

CREATE INDEX "IntegrationEventLog_status_createdAt_idx"
  ON "IntegrationEventLog"("status", "createdAt");

CREATE UNIQUE INDEX "DeadLetterEvent_outboxEventId_key"
  ON "DeadLetterEvent"("outboxEventId");

CREATE INDEX "DeadLetterEvent_tenantId_createdAt_idx"
  ON "DeadLetterEvent"("tenantId", "createdAt");

CREATE INDEX "DeadLetterEvent_queueName_createdAt_idx"
  ON "DeadLetterEvent"("queueName", "createdAt");

CREATE INDEX "DeadLetterEvent_resolvedAt_createdAt_idx"
  ON "DeadLetterEvent"("resolvedAt", "createdAt");

CREATE UNIQUE INDEX "ConsumerCheckpoint_consumerName_queueName_key"
  ON "ConsumerCheckpoint"("consumerName", "queueName");

CREATE INDEX "ConsumerCheckpoint_lastProcessedAt_idx"
  ON "ConsumerCheckpoint"("lastProcessedAt");

ALTER TABLE "OutboxEventDispatch"
ADD CONSTRAINT "OutboxEventDispatch_outboxEventId_fkey"
FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxEventDispatch"
ADD CONSTRAINT "OutboxEventDispatch_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OutboxEventDispatch"
ADD CONSTRAINT "OutboxEventDispatch_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationEventLog"
ADD CONSTRAINT "IntegrationEventLog_outboxEventId_fkey"
FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationEventLog"
ADD CONSTRAINT "IntegrationEventLog_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "OutboxEventDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IntegrationEventLog"
ADD CONSTRAINT "IntegrationEventLog_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationEventLog"
ADD CONSTRAINT "IntegrationEventLog_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeadLetterEvent"
ADD CONSTRAINT "DeadLetterEvent_outboxEventId_fkey"
FOREIGN KEY ("outboxEventId") REFERENCES "OutboxEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeadLetterEvent"
ADD CONSTRAINT "DeadLetterEvent_dispatchId_fkey"
FOREIGN KEY ("dispatchId") REFERENCES "OutboxEventDispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeadLetterEvent"
ADD CONSTRAINT "DeadLetterEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeadLetterEvent"
ADD CONSTRAINT "DeadLetterEvent_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
