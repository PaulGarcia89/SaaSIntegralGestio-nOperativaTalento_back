-- Backfill employee permissions for existing privileged roles.
-- Existing Railway databases can miss these RolePermission rows even when the
-- permission catalog and seed data already define them.

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."code" IN ('employees.read', 'employees.create', 'employees.update')
WHERE r."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN', 'BRANCH_ADMIN')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
