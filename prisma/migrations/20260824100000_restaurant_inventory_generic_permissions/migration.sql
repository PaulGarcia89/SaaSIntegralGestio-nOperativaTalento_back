-- Generic restaurant inventory permissions are additive and keep existing codes.
INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'inventory.view', 'inventory.view', 'View restaurant inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.read', 'inventory.read', 'Read restaurant inventory', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.create', 'inventory.create', 'Create restaurant inventory records', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.update', 'inventory.update', 'Update restaurant inventory records', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.confirm', 'inventory.confirm', 'Confirm restaurant inventory workflows', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.cancel', 'inventory.cancel', 'Cancel restaurant inventory workflows', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.report.view', 'inventory.report.view', 'View restaurant inventory reports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'inventory.override', 'inventory.override', 'Override restaurant inventory controls', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
