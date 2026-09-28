#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: PGHOST=... PGPORT=... PGUSER=... PGDATABASE=... $0 <backup-file.dump>" >&2
  echo "Credentials must come from PGPASSWORD or PGPASSFILE; the source DB is PGDATABASE." >&2
}

if [[ $# -ne 1 || -z "${PGHOST:-}" || -z "${PGPORT:-}" || -z "${PGUSER:-}" || -z "${PGDATABASE:-}" ]]; then
  usage
  exit 2
fi
if [[ -z "${PGPASSWORD:-}" && -z "${PGPASSFILE:-}" ]]; then
  echo "Set PGPASSWORD or PGPASSFILE through an approved secret mechanism." >&2
  exit 2
fi

backup_file=$1
backup_name=$(basename -- "$backup_file")
if [[ ! "$backup_name" =~ ^[A-Za-z0-9._-]+\.dump$ ]]; then
  echo "Backup file name may contain only letters, numbers, dot, underscore, and hyphen." >&2
  exit 2
fi
case "$backup_file" in
  *.dump) ;;
  *) echo "Backup path must end in .dump." >&2; exit 2 ;;
esac
if [[ -e "$backup_file" || -e "$backup_file.sha256" || -e "$backup_file.metadata.json" ]]; then
  echo "Backup output or sidecar already exists; choose a new path." >&2
  exit 2
fi

client_version=$(pg_dump --version)
if [[ ! "$client_version" =~ ^pg_dump\ \(PostgreSQL\)\ 16\. ]]; then
  echo "PostgreSQL 16 pg_dump is required; found: $client_version" >&2
  exit 2
fi

mkdir -p -- "$(dirname -- "$backup_file")"
umask 077
temporary_file=$(mktemp "${backup_file}.tmp.XXXXXX")
cleanup() { rm -f -- "$temporary_file"; }
trap cleanup EXIT
pg_dump --format=custom --no-owner --no-privileges --file "$temporary_file"
if [[ ! -s "$temporary_file" ]]; then
  echo "pg_dump did not produce a non-empty archive." >&2
  exit 1
fi
mv -- "$temporary_file" "$backup_file"
trap - EXIT

sha256=$(sha256sum -- "$backup_file" | cut -d ' ' -f 1)
byte_size=$(wc -c < "$backup_file" | tr -d '[:space:]')
timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
printf '%s  %s\n' "$sha256" "$backup_name" > "$backup_file.sha256"
printf '{"createdAtUtc":"%s","clientVersion":"%s","fileName":"%s","byteSize":%s,"sha256":"%s"}\n' \
  "$timestamp" "$client_version" "$backup_name" "$byte_size" "$sha256" > "$backup_file.metadata.json"
chmod 600 -- "$backup_file" "$backup_file.sha256" "$backup_file.metadata.json"
echo "PostgreSQL custom-format backup created: $backup_name ($byte_size bytes)."
echo "SHA-256: $sha256"
