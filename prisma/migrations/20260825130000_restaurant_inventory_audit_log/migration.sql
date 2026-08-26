CREATE TABLE "RestaurantInventoryAuditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT,
  "warehouseId" TEXT,
  "actorId" TEXT,
  "actorName" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "before" JSONB,
  "after" JSONB,
  "reason" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "requestId" TEXT,
  "idempotencyKey" TEXT,
  "hash" TEXT NOT NULL,
  "previousHash" TEXT,
  CONSTRAINT "RestaurantInventoryAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RestaurantInventoryAuditLog_tenantId_createdAt_idx" ON "RestaurantInventoryAuditLog"("tenantId", "createdAt");
CREATE INDEX "RestaurantInventoryAuditLog_tenantId_actorId_createdAt_idx" ON "RestaurantInventoryAuditLog"("tenantId", "actorId", "createdAt");
CREATE INDEX "RestaurantInventoryAuditLog_tenantId_action_createdAt_idx" ON "RestaurantInventoryAuditLog"("tenantId", "action", "createdAt");
CREATE INDEX "RestaurantInventoryAuditLog_tenantId_entityType_entityId_createdAt_idx" ON "RestaurantInventoryAuditLog"("tenantId", "entityType", "entityId", "createdAt");
CREATE UNIQUE INDEX "RestaurantInventoryAuditLog_tenantId_requestId_action_key" ON "RestaurantInventoryAuditLog"("tenantId", "requestId", "action");
CREATE TRIGGER restaurant_inventory_audit_immutable
  BEFORE UPDATE OR DELETE ON "RestaurantInventoryAuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
