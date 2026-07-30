CREATE TYPE "InventoryAssetStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'ASSIGNED', 'IN_TRANSIT', 'RETURN_PENDING', 'MAINTENANCE', 'LOST', 'RETIRED');
CREATE TYPE "InventoryAssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED');
CREATE TYPE "InventoryMovementType" AS ENUM ('REGISTERED', 'ASSIGNED', 'DELIVERED', 'TRANSFERRED', 'RETURN_REQUESTED', 'RETURNED', 'RETURN_VALIDATED', 'SENT_TO_MAINTENANCE', 'MARKED_LOST', 'RETIRED');
CREATE TYPE "InventoryEvidenceType" AS ENUM ('DELIVERY', 'TRANSFER', 'RETURN', 'VALIDATION');
ALTER TYPE "OnboardingTaskType" ADD VALUE IF NOT EXISTS 'ASSET_DELIVERY';

CREATE TABLE "InventoryAsset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "employeeId" TEXT,
  "workflowAssignmentId" TEXT,
  "assetTag" TEXT NOT NULL,
  "serialNumber" TEXT,
  "status" "InventoryAssetStatus" NOT NULL DEFAULT 'AVAILABLE',
  "condition" "InventoryAssetCondition" NOT NULL DEFAULT 'GOOD',
  "notes" TEXT,
  "assignedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "returnRequestedAt" TIMESTAMP(3),
  "returnedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryMovement" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "type" "InventoryMovementType" NOT NULL,
  "fromBranchId" TEXT,
  "toBranchId" TEXT,
  "employeeId" TEXT,
  "actorUserId" TEXT NOT NULL,
  "condition" "InventoryAssetCondition",
  "notes" TEXT,
  "requestId" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InventoryEvidence" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "movementId" TEXT NOT NULL,
  "type" "InventoryEvidenceType" NOT NULL,
  "storageKey" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "uploadedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InventoryAsset_workflowAssignmentId_key" ON "InventoryAsset"("workflowAssignmentId");
CREATE UNIQUE INDEX "InventoryAsset_tenantId_assetTag_key" ON "InventoryAsset"("tenantId", "assetTag");
CREATE UNIQUE INDEX "InventoryAsset_tenantId_serialNumber_key" ON "InventoryAsset"("tenantId", "serialNumber");
CREATE INDEX "InventoryAsset_tenantId_branchId_status_idx" ON "InventoryAsset"("tenantId", "branchId", "status");
CREATE INDEX "InventoryAsset_tenantId_employeeId_status_idx" ON "InventoryAsset"("tenantId", "employeeId", "status");
CREATE INDEX "InventoryAsset_tenantId_itemId_idx" ON "InventoryAsset"("tenantId", "itemId");
CREATE INDEX "InventoryMovement_tenantId_assetId_occurredAt_idx" ON "InventoryMovement"("tenantId", "assetId", "occurredAt");
CREATE INDEX "InventoryMovement_tenantId_type_occurredAt_idx" ON "InventoryMovement"("tenantId", "type", "occurredAt");
CREATE INDEX "InventoryMovement_tenantId_employeeId_occurredAt_idx" ON "InventoryMovement"("tenantId", "employeeId", "occurredAt");
CREATE INDEX "InventoryEvidence_tenantId_assetId_createdAt_idx" ON "InventoryEvidence"("tenantId", "assetId", "createdAt");
CREATE INDEX "InventoryEvidence_movementId_idx" ON "InventoryEvidence"("movementId");

ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAsset" ADD CONSTRAINT "InventoryAsset_workflowAssignmentId_fkey" FOREIGN KEY ("workflowAssignmentId") REFERENCES "InventoryAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "InventoryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryEvidence" ADD CONSTRAINT "InventoryEvidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryEvidence" ADD CONSTRAINT "InventoryEvidence_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "InventoryAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryEvidence" ADD CONSTRAINT "InventoryEvidence_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "InventoryMovement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
