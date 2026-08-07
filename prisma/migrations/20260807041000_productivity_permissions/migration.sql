INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt") VALUES
  (gen_random_uuid()::text, 'productivity.view', 'Ver productividad', 'Consultar métricas operativas agregadas', NOW(), NOW()),
  (gen_random_uuid()::text, 'productivity.manage', 'Administrar productividad', 'Configurar cámaras, zonas, reglas y alertas operativas', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
CROSS JOIN "Permission" permission
WHERE role."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN')
  AND permission."code" IN ('productivity.view', 'productivity.manage')
ON CONFLICT DO NOTHING;
