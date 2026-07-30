#!/usr/bin/env bash
set -euo pipefail

backup_root="${BACKUP_ROOT:-./backups}"
database_url="${DATABASE_URL:-}"
scorm_root="${SCORM_STORAGE_ROOT:-./storage/scorm}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${backup_root}/${timestamp}"

if [[ -z "${database_url}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

# Prisma accepts ?schema=public, but PostgreSQL client tools do not.
database_url="${database_url%%\?schema=*}"

mkdir -p "${target}"
umask 077

pg_dump --format=custom --no-owner --no-acl \
  --file="${target}/database.dump" "${database_url}"

if [[ -d "${scorm_root}" ]]; then
  tar -C "${scorm_root}" -czf "${target}/scorm-storage.tar.gz" .
fi

(
  cd "${target}"
  shasum -a 256 database.dump > SHA256SUMS
  if [[ -f scorm-storage.tar.gz ]]; then
    shasum -a 256 scorm-storage.tar.gz >> SHA256SUMS
  fi
)

cat > "${target}/metadata.json" <<EOF
{"createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","databaseFormat":"postgres-custom","includesScorm":$([[ -f "${target}/scorm-storage.tar.gz" ]] && echo true || echo false)}
EOF

echo "Backup created at ${target}"
