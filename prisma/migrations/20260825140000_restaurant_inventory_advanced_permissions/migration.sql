INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'restaurant_inventory.expiry_alerts.view', 'restaurant_inventory.expiry_alerts.view', 'View inventory expiry alerts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.counts.schedule', 'restaurant_inventory.counts.schedule', 'Create and manage scheduled inventory counts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.variance.view', 'restaurant_inventory.variance.view', 'View theoretical versus actual inventory variance', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.shrinkage.view', 'restaurant_inventory.shrinkage.view', 'View inventory shrinkage alerts', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'restaurant_inventory.audit.read', 'restaurant_inventory.audit.read', 'Read immutable inventory audit events', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Controlled compatibility migration: privileged inventory roles receive the
-- new explicit permissions. General permissions remain supported by the guard
-- only while INVENTORY_LEGACY_PERMISSION_FALLBACK is enabled.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN (
  'restaurant_inventory.expiry_alerts.view',
  'restaurant_inventory.counts.schedule',
  'restaurant_inventory.variance.view',
  'restaurant_inventory.shrinkage.view',
  'restaurant_inventory.audit.read'
)
WHERE role."code" IN ('TENANT_ADMIN', 'INVENTORY_MANAGER')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON permission."code" IN (
  'restaurant_inventory.expiry_alerts.view',
  'restaurant_inventory.variance.view',
  'restaurant_inventory.shrinkage.view',
  'restaurant_inventory.audit.read'
)
WHERE role."code" IN ('SUPERVISOR', 'BRANCH_ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
