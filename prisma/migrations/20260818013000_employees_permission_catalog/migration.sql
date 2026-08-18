-- Ensure employee permissions exist before assigning them to roles.
-- Some production databases were created before these catalog entries were
-- added to the seed, so a RolePermission-only backfill could not assign them.

INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  permission."code",
  permission."name",
  permission."description",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('employees.read', 'Consultar empleados', 'Consultar el directorio de empleados'),
    ('employees.create', 'Crear empleados', 'Crear empleados dentro del tenant y sucursal autorizados'),
    ('employees.update', 'Actualizar empleados', 'Actualizar empleados dentro del tenant y sucursal autorizados'),
    ('employees.delete', 'Eliminar empleados', 'Eliminar empleados dentro del tenant y sucursal autorizados')
) AS permission("code", "name", "description")
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission
  ON permission."code" IN (
    'employees.read',
    'employees.create',
    'employees.update',
    'employees.delete'
  )
WHERE role."code" IN (
  'SUPERADMIN',
  'PLATFORM_ADMIN',
  'TENANT_ADMIN',
  'BRANCH_ADMIN',
  'ADMIN'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
