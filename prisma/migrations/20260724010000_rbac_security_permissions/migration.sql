INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, code, code, 'Granular security permission', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('audit.read'),
    ('notifications.read_own'),
    ('notifications.update_own'),
    ('notifications.send'),
    ('metrics.operations.read'),
    ('applications.export'),
    ('applications.bulk_update'),
    ('applications.files.read')
) AS requested(code)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON (
  role."code" IN ('SUPERADMIN', 'TENANT_ADMIN')
  AND permission."code" IN (
    'audit.read',
    'notifications.read_own',
    'notifications.update_own',
    'notifications.send',
    'metrics.operations.read',
    'applications.export',
    'applications.bulk_update',
    'applications.files.read'
  )
) OR (
  role."code" IN ('HR_MANAGER', 'RECRUITER')
  AND permission."code" IN (
    'notifications.read_own',
    'notifications.update_own',
    'applications.export',
    'applications.bulk_update',
    'applications.files.read'
  )
) OR (
  role."code" IN ('BRANCH_ADMIN', 'BRANCH_USER', 'INTERVIEWER', 'INSTRUCTOR', 'SUPERVISOR', 'INVENTORY_MANAGER')
  AND permission."code" IN ('notifications.read_own', 'notifications.update_own')
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
