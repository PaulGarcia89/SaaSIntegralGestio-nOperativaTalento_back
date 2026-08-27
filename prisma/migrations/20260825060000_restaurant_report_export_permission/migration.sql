INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'inventory.report.export', 'inventory.report.export', 'Export restaurant inventory reports', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
