#!/usr/bin/env bash
set -euo pipefail

: "${RECOVERY_BACKUP_DIR:?Set RECOVERY_BACKUP_DIR to a temporary directory outside the repository}"
: "${GITHUB_RUN_ID:?Set GITHUB_RUN_ID to a unique CI run identifier}"
: "${GITHUB_RUN_ATTEMPT:?Set GITHUB_RUN_ATTEMPT to a unique CI attempt identifier}"
: "${PGDATABASE:?Set PGDATABASE to the migrated disposable source database}"

mkdir -p -- "$RECOVERY_BACKUP_DIR"
backup="$RECOVERY_BACKUP_DIR/betcco-recovery-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.dump"
target="betcco_restore_${GITHUB_RUN_ID}_${GITHUB_RUN_ATTEMPT}"
empty_backup="$RECOVERY_BACKUP_DIR/betcco-recovery-empty-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.dump"
tampered_dir=""
cleanup() {
  status=$?
  trap - EXIT
  rm -f -- "$backup" "$backup.sha256" "$backup.metadata.json" \
    "$empty_backup" "$empty_backup.sha256" "$empty_backup.metadata.json"
  if [[ -n "$tampered_dir" ]]; then
    rm -f -- "$tampered_dir/tampered.dump" "$tampered_dir/tampered.dump.sha256"
    rmdir -- "$tampered_dir" 2>/dev/null || status=1
  fi
  exit "$status"
}
trap cleanup EXIT

psql --no-psqlrc --set=ON_ERROR_STOP=1 --file "$(dirname -- "$0")/postgres-recovery-seed.sql"
bash "$(dirname -- "$0")/backup-postgres.sh" "$backup"
bash "$(dirname -- "$0")/test-postgres-restore.sh" "$PGDATABASE" "$target" "$backup"

if bash "$(dirname -- "$0")/test-postgres-restore.sh" "$target" "$target" "$backup" >/dev/null 2>&1; then
  echo "Restore guard accepted identical source and target names." >&2
  exit 1
fi

tampered_dir=$(mktemp -d "$RECOVERY_BACKUP_DIR/recovery-negative.XXXXXX")
tampered_backup="$tampered_dir/tampered.dump"
cp -- "$backup" "$tampered_backup"
printf '%s  %s\n' "$(cut -d ' ' -f 1 < "$backup.sha256")" "$(basename -- "$tampered_backup")" > "$tampered_backup.sha256"
printf x >> "$tampered_backup"
if bash "$(dirname -- "$0")/test-postgres-restore.sh" "$PGDATABASE" "${target}_checksum" "$tampered_backup" >/dev/null 2>&1; then
  echo "Restore guard accepted a backup with a mismatched SHA-256." >&2
  exit 1
fi
rm -f -- "$tampered_backup" "$tampered_backup.sha256"
rmdir -- "$tampered_dir"
tampered_dir=""

failed_target="${target}_failure"
if BETCCO_RECOVERY_TEST_FAIL_AFTER_TARGET_CREATE=1 \
  bash "$(dirname -- "$0")/test-postgres-restore.sh" "$PGDATABASE" "$failed_target" "$backup" >/dev/null 2>&1; then
  echo "Restore negative-path hook unexpectedly succeeded." >&2
  exit 1
fi
failed_target_exists=$(PGDATABASE=postgres psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command "SELECT count(*) FROM pg_database WHERE datname = '$failed_target'")
if [[ "$failed_target_exists" != "0" ]]; then
  echo "Failed restore did not clean up its disposable target database." >&2
  exit 1
fi

PGDATABASE=postgres bash "$(dirname -- "$0")/backup-postgres.sh" "$empty_backup"
invalid_source_target="${target}_invalid_source"
if bash "$(dirname -- "$0")/test-postgres-restore.sh" "$PGDATABASE" "$invalid_source_target" "$empty_backup" >/dev/null 2>&1; then
  echo "Restore guard accepted an archive without the migrated BETCCO recovery state." >&2
  exit 1
fi
invalid_source_target_exists=$(PGDATABASE=postgres psql --no-psqlrc --tuples-only --no-align --set=ON_ERROR_STOP=1 \
  --command "SELECT count(*) FROM pg_database WHERE datname = '$invalid_source_target'")
if [[ "$invalid_source_target_exists" != "0" ]]; then
  echo "Invalid-source preflight created a disposable target unexpectedly." >&2
  exit 1
fi
rm -f -- "$empty_backup" "$empty_backup.sha256" "$empty_backup.metadata.json"

echo "Restore guard checks passed: same-name refusal, checksum mismatch rejection, post-create failure cleanup, invalid-source refusal."
