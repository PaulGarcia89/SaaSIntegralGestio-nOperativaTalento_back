#!/usr/bin/env bash
set -euo pipefail

backup_dir="${1:-}"
if [[ -z "${backup_dir}" || ! -d "${backup_dir}" ]]; then
  echo "Usage: npm run restore:verify -- /path/to/backup" >&2
  exit 1
fi

(
  cd "${backup_dir}"
  shasum -a 256 -c SHA256SUMS
  pg_restore --list database.dump >/dev/null
  if [[ -f scorm-storage.tar.gz ]]; then
    tar -tzf scorm-storage.tar.gz >/dev/null
  fi
)

echo "Backup is internally consistent: ${backup_dir}"
