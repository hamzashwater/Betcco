# PostgreSQL restore drill record

Use one copy of this record for each staging or production-provider recovery exercise. Do not include credentials, access tokens, private application records, or unrestricted connection strings. A completed repository CI drill uses synthetic data and does not count as evidence that a staging or production provider backup was restored.

## Drill details

- Date/time UTC:
- Environment (staging / production recovery exercise):
- Operator:
- Backup source/provider:
- Backup creation timestamp UTC:
- Backup identifier (non-secret):
- SHA-256:
- Restore target (isolated database/instance):
- PostgreSQL major version:
- Start time UTC:
- Completion time UTC:
- Measured recovery duration:
- Data timestamp / measured recovery point, if known:

## Verification

- Migration history and expected latest migration:
- Application row/state verification:
- Financial invariant verification (including exact expected debit/credit totals where applicable):
- Private object recovery verification (record separately; no object content here):
- Data Protection certificate/key recovery verification:
- Source remained unchanged:
- Disposable target cleanup completed:

## S3 private-object recovery evidence

- Environment (CI / staging / production recovery exercise):
- Bucket/provider (do not include credentials):
- Source/recovery-copy/restore identifiers:
- Finalized object count:
- Manifest SHA-256 (integrity only; not authenticity):
- Exact keys, bytes, and content fingerprints verified:
- Content-Type and required metadata verified:
- Anonymous bucket/object access denied:
- Source unchanged / existing-target overwrite refused:
- Failed-restore cleanup verified:
- Result: PASS / FAIL

## Data Protection recovery evidence

- Certificate SHA-256 fingerprint / thumbprint:
- Validity dates:
- Private key present: YES / NO
- Recovered PostgreSQL key ring tested with application name `BETCCO`:
- Synthetic payload protect/unprotect: PASS / FAIL
- Certificate/password stored in approved external custody (no secret values): YES / NO / NOT VERIFIED
- Result: PASS / FAIL

## Result and sign-off

- Result: PASS / FAIL
- Issues/findings:
- Follow-up owner and due date:
- Operator sign-off:
- Independent reviewer/sign-off:
