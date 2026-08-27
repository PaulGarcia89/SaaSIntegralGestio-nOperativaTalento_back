# Restaurant inventory migrations and backups

## Migration policy

Inventory migrations are additive and are applied with `prisma migrate deploy`. Prisma migrations in this repository are forward-only: a destructive `down` script is intentionally not run in production because it could remove movements, audit records, or historical cost snapshots.

Rollback is therefore operational and safe:

1. Stop or isolate the application deployment.
2. Restore the last verified database backup to the approved target database.
3. Deploy the previous application revision.
4. If data must be preserved instead, create a compensating forward migration. Never delete inventory movements to correct a failed report or document.

Every schema change must keep old nullable fields and enum values compatible with existing records. New indexes and tables may be added independently of the application rollout.

## Backup procedure

The repository provides a PostgreSQL custom-format backup and integrity verification:

```bash
DATABASE_URL="$DATABASE_URL" npm run backup
npm run restore:verify -- ./backups/<UTC_TIMESTAMP>
```

`backup` creates `database.dump`, checksums, metadata, and optionally `scorm-storage.tar.gz` when `SCORM_STORAGE_ROOT` exists. Backups are written with restrictive permissions. In Railway, run the command from an approved maintenance shell or scheduled job with the production `DATABASE_URL`; do not commit the resulting backup directory.

## Restore procedure

Restores require an explicit maintenance approval and must be tested against a staging database first. The PostgreSQL custom dump can be restored with:

```bash
pg_restore --clean --if-exists --no-owner --no-acl \
  --dbname="$DATABASE_URL" ./backups/<UTC_TIMESTAMP>/database.dump
```

Restore the SCORM archive separately only when the storage volume is part of the incident. Run `npx prisma migrate deploy` after the restore only when the target database is intentionally being moved forward; do not use `prisma migrate resolve` to hide an incomplete migration.

## Deployment checklist

- Run `npm run build` and the inventory Jest suites.
- Create and verify a backup before applying production migrations.
- Apply migrations with `npx prisma migrate deploy`.
- Check the deployment health endpoint and inventory read-only endpoints.
- Confirm that audit and movement counts are unchanged after deploy.
- Keep the backup for the configured retention period and record its checksum in the change ticket.

## Recovery guarantees

Receipt, consumption, production, waste, count, and transfer confirmations run in transactions and use state claims for idempotency. A failed transaction is rolled back by PostgreSQL; a previously committed movement is never edited or removed. Corrections are represented by compensating movements and audit entries.
