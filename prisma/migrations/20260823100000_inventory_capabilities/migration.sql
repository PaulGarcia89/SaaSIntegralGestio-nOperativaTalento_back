CREATE TYPE "InventoryCapabilityCode" AS ENUM ('ASSET_INVENTORY', 'RESTAURANT_INVENTORY');

CREATE TABLE "TenantInventoryCapability" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "tenantId" TEXT NOT NULL,
  "code" "InventoryCapabilityCode" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMP(3),
  "deactivatedAt" TIMESTAMP(3),
  "activatedById" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TenantInventoryCapability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantInventoryCapability_tenantId_code_key"
  ON "TenantInventoryCapability"("tenantId", "code");
CREATE INDEX "TenantInventoryCapability_tenantId_enabled_idx"
  ON "TenantInventoryCapability"("tenantId", "enabled");
CREATE INDEX "TenantInventoryCapability_code_enabled_idx"
  ON "TenantInventoryCapability"("code", "enabled");

ALTER TABLE "TenantInventoryCapability"
  ADD CONSTRAINT "TenantInventoryCapability_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "TenantInventoryCapability_activatedById_fkey"
    FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing tenants retain access to the physical inventory when they already
-- had the parent module or persisted physical-inventory data. Restaurant
-- inventory is deliberately seeded disabled for every existing tenant.
INSERT INTO "TenantInventoryCapability" ("tenantId", "code", "enabled", "activatedAt", "createdAt", "updatedAt")
SELECT t."id", 'ASSET_INVENTORY', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
WHERE EXISTS (
  SELECT 1
  FROM "Subscription" s
  JOIN "PlanModule" pm ON pm."planId" = s."planId"
  JOIN "FeatureModule" fm ON fm."id" = pm."moduleId"
  WHERE s."tenantId" = t."id" AND fm."code" = 'INVENTORY'
)
OR EXISTS (SELECT 1 FROM "InventoryItem" i WHERE i."tenantId" = t."id")
OR EXISTS (SELECT 1 FROM "InventoryAsset" a WHERE a."tenantId" = t."id")
OR EXISTS (SELECT 1 FROM "InventoryStock" st WHERE st."tenantId" = t."id")
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "TenantInventoryCapability" ("tenantId", "code", "enabled", "createdAt", "updatedAt")
SELECT t."id", 'RESTAURANT_INVENTORY', false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Tenant" t
ON CONFLICT ("tenantId", "code") DO NOTHING;

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'asset_inventory.read', 'asset_inventory.read', 'Read physical asset inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'asset_inventory.manage', 'asset_inventory.manage', 'Manage physical asset inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.read', 'restaurant_inventory.read', 'Read restaurant inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.manage', 'restaurant_inventory.manage', 'Manage restaurant inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
