ALTER TABLE "HiringContractStateEvent" ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX "HiringContractStateEvent_tenantId_requestId_action_key"
ON "HiringContractStateEvent"("tenantId", "requestId", "action");
