INSERT INTO "Permission" ("id", "code", "name", "description", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, code, code, 'Granular authorization permission', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  VALUES
    ('metrics.read'),
    ('domain_events.candidate_hired'),
    ('domain_events.branch_changed'),
    ('domain_events.offboarding_started'),
    ('domain_events.onboarding_completed'),
    ('domain_events.asset_assigned'),
    ('domain_events.training_completed'),
    ('domain_events.operation_handoff_completed'),
    ('domain_events.compliance_closed')
) AS requested(code)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "Role" role
JOIN "Permission" permission ON (
  role."code" IN ('SUPERADMIN', 'PLATFORM_ADMIN', 'TENANT_ADMIN')
  AND permission."code" IN (
    'metrics.read',
    'domain_events.candidate_hired',
    'domain_events.branch_changed',
    'domain_events.offboarding_started',
    'domain_events.onboarding_completed',
    'domain_events.asset_assigned',
    'domain_events.training_completed',
    'domain_events.operation_handoff_completed',
    'domain_events.compliance_closed'
  )
) OR (
  role."code" = 'HR_MANAGER'
  AND permission."code" = 'domain_events.candidate_hired'
)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
