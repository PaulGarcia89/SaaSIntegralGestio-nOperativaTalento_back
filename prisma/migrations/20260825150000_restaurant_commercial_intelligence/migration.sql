CREATE TYPE "RestaurantCommercialBudgetStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');
CREATE TABLE "RestaurantCommercialBudget" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "warehouseId" TEXT,
  "code" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "budgetAmount" DECIMAL(18,6) NOT NULL,
  "committedAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "status" "RestaurantCommercialBudgetStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "closedBy" TEXT,
  "closedAt" TIMESTAMP(3),
  "cancelledBy" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RestaurantCommercialBudget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RestaurantCommercialBudget_tenantId_code_key" ON "RestaurantCommercialBudget"("tenantId", "code");
CREATE INDEX "RestaurantCommercialBudget_tenantId_branchId_warehouseId_periodStart_periodEnd_status_idx" ON "RestaurantCommercialBudget"("tenantId", "branchId", "warehouseId", "periodStart", "periodEnd", "status");

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'restaurant_inventory.commercial.view', 'restaurant_inventory.commercial.view', 'View commercial intelligence reports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.commissary.manage', 'restaurant_inventory.commissary.manage', 'Manage commissary operations', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.budgets.manage', 'restaurant_inventory.budgets.manage', 'Manage inventory purchasing budgets', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN (
  'restaurant_inventory.commercial.view',
  'restaurant_inventory.commissary.manage',
  'restaurant_inventory.budgets.manage'
)
WHERE role."code" IN ('TENANT_ADMIN', 'INVENTORY_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" = 'restaurant_inventory.commercial.view'
WHERE role."code" IN ('SUPERVISOR', 'BRANCH_ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
