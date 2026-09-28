#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: PGHOST=... PGPORT=... PGUSER=... $0 <source-db> <betcco_restore_target-db> <backup-file.dump>" >&2
  echo "Credentials must come from PGPASSWORD or PGPASSFILE." >&2
}

if [[ $# -ne 3 || -z "${PGHOST:-}" || -z "${PGPORT:-}" || -z "${PGUSER:-}" ]]; then
  usage
  exit 2
fi
if [[ -z "${PGPASSWORD:-}" && -z "${PGPASSFILE:-}" ]]; then
  echo "Set PGPASSWORD or PGPASSFILE through an approved secret mechanism." >&2
  exit 2
fi

source_db=$1
target_db=$2
backup_file=$3
safe_db='^[a-zA-Z0-9_]+$'
if [[ ! "$source_db" =~ $safe_db || ! "$target_db" =~ ^betcco_restore_[a-z0-9_]+$ ]]; then
  echo "Database names must be simple identifiers; the disposable target must start with betcco_restore_." >&2
  exit 2
fi
if [[ "$source_db" == "$target_db" ]]; then
  echo "Source and restore target must be different databases." >&2
  exit 2
fi
if [[ "$source_db" =~ (^|_)(prod|production|stage|staging)(_|$) ]]; then
  echo "Restore drill refuses an obvious production or staging source database name." >&2
  exit 2
fi
if [[ ! -s "$backup_file" || ! -s "$backup_file.sha256" ]]; then
  echo "Backup archive and SHA-256 sidecar must both exist and be non-empty." >&2
  exit 1
fi

for tool in pg_restore psql sha256sum; do
  command -v "$tool" >/dev/null || { echo "Required tool not found: $tool" >&2; exit 2; }
done
restore_version=$(pg_restore --version)
if [[ ! "$restore_version" =~ ^pg_restore\ \(PostgreSQL\)\ 16\. ]]; then
  echo "PostgreSQL 16 pg_restore is required; found: $restore_version" >&2
  exit 2
fi

read -r expected_sha256 expected_name < "$backup_file.sha256"
if [[ ! "$expected_sha256" =~ ^[a-fA-F0-9]{64}$ ]]; then
  echo "SHA-256 sidecar has an invalid format." >&2
  exit 1
fi
if [[ "$expected_name" != "$(basename -- "$backup_file")" ]]; then
  echo "SHA-256 sidecar does not identify the selected backup file." >&2
  exit 1
fi
actual_sha256=$(sha256sum -- "$backup_file" | cut -d ' ' -f 1)
if [[ "${actual_sha256,,}" != "${expected_sha256,,}" ]]; then
  echo "Backup SHA-256 mismatch; restore was not started." >&2
  exit 1
fi
pg_restore --list "$backup_file" >/dev/null

export PGDATABASE=postgres
fingerprint_sql="$(dirname -- "$0")/postgres-recovery-fingerprint.sql"
if [[ ! -f "$fingerprint_sql" ]]; then
  echo "Required BETCCO restore verifier is missing: $fingerprint_sql" >&2
  exit 1
fi
source_fingerprint_before=$(PGDATABASE="$source_db" psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --file "$fingerprint_sql")
existing=$(psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command "SELECT 1 FROM pg_database WHERE datname = '$target_db'")
if [[ "$existing" == "1" ]]; then
  echo "Restore target already exists; refusing to drop or overwrite it." >&2
  exit 1
fi

target_created=0
cleanup() {
  status=$?
  trap - EXIT
  if [[ "$target_created" == 1 ]]; then
    PGDATABASE=postgres psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 \
      --command "DROP DATABASE IF EXISTS \"$target_db\" WITH (FORCE)" >/dev/null || status=1
  fi
  exit "$status"
}
trap cleanup EXIT

psql --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --command "CREATE DATABASE \"$target_db\""
target_created=1
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$target_db" "$backup_file"

source_fingerprint_after=$(PGDATABASE="$source_db" psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --file "$fingerprint_sql")
restored_fingerprint=$(PGDATABASE="$target_db" psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 --file "$fingerprint_sql")
if [[ "$source_fingerprint_before" != "$source_fingerprint_after" ]]; then
  echo "Source database state changed during the restore drill." >&2
  exit 1
fi
if [[ "$source_fingerprint_before" != "$restored_fingerprint" ]]; then
  echo "Restored database state does not match the source recovery fingerprint." >&2
  exit 1
fi

echo "PostgreSQL 16 isolated restore verified; source and restored fingerprints match."
echo "Source database fingerprint unchanged."
echo "SHA-256 verified before restore: $actual_sha256"
