# Provider-neutral incident response

## General handling

Use [the monitoring and alert contract](monitoring-alerts.md) to identify the repository signal and the external evidence still required. Record timestamps, deployment/instance, stable event ID and safe internal correlation IDs. Keep credentials, tokens, private file data and raw provider payloads out of logs, chat, alert payloads and incident notes. Preserve relevant evidence before changing state. A technical alert does not itself declare a legal or privacy breach.

## Database or readiness failure

1. **Detect:** inspect `/health/ready`, EventId 7001 and external database/service alerts. Compare across instances and check `/health/live` to distinguish process failure from dependency readiness.
2. **Verify:** use approved operator tooling to check PostgreSQL service/network and deployment configuration. Do not paste connection strings or credential-bearing diagnostics into an incident.
3. **Contain:** stop or reduce traffic only through the approved hosting procedure; do not repeatedly restart or restore against an unverified target.
4. **Recover:** follow the PostgreSQL [backup and restore drill](../DEPLOYMENT.md#postgresql-backup-and-restore-drill). Production provider recovery and restore evidence must be supplied by the operator; repository CI is not production backup evidence.
5. **Validate:** verify database connectivity, `/health/ready`, `/health/live`, and agreed application state invariants before restoring traffic.
6. **Escalate:** contact the database/hosting owner when service recovery or data integrity is uncertain; escalate possible data loss to the recovery owner.

## S3 or private storage failure

1. **Detect:** check EventId 7001 and storage-side health alongside `/health/live`.
2. **Verify:** distinguish API/bucket unavailability from confirmed missing or corrupted objects using authorized provider diagnostics and application references.
3. **Contain:** keep the source bucket and private access controls intact. **Do not automatically destroy or recreate a bucket.** Do not manually delete objects with unknown lifecycle state.
4. **Recover:** use the ASUS-10E1B [logical S3 object recovery](../DEPLOYMENT.md#private-s3-object-recovery) and [Data Protection certificate recovery](../DEPLOYMENT.md#data-protection-key-ring-and-certificate-recovery) evidence. Production provider snapshots, backup settings and certificate custody remain external responsibilities.
5. **Validate:** check object key set/content fingerprints against an approved manifest, verify anonymous access remains denied, and exercise authorized private object reads after recovery.
6. **Escalate:** involve the storage/provider and data recovery owners if object absence, corruption, access exposure or certificate loss is suspected.

## ClamAV outage

1. **Detect:** review EventId 7201 and upload-path failures; liveness/readiness intentionally do not depend on ClamAV.
2. **Verify:** confirm scanner service and network reachability using approved health tooling; avoid sending an actual learner upload to diagnostic systems.
3. **Contain:** uploads remain fail-closed. **Do not bypass malware scanning** to restore availability.
4. **Recover:** restore the configured ClamAV service/connectivity and ensure the production scanner selection is intact.
5. **Validate:** run a staging upload with a synthetic benign fixture through the full scan path and verify expected acceptance/rejection behavior.
6. **Escalate:** contact the scanner/service owner if protocol or transport errors persist.

## SMTP or registration outbox backlog

1. **Detect:** inspect EventIds 7101–7103; aged backlog is an aggregate signal for eligible Pending/Failed/Processing rows at least 30 minutes old.
2. **Verify:** use an authorized, application-safe/admin-supported mechanism to inspect counts, statuses and age where available. No recipient/token data is needed for initial triage.
3. **Contain:** restore SMTP connectivity/configuration through the approved secret manager. Do not expose, copy, manually reuse or resend confirmation tokens.
4. **Recover:** allow the existing retry schedule and worker to recover messages; do not manually reset rows or alter retry state without an approved procedure.
5. **Validate:** confirm new delivery succeeds and aggregate backlog count/age decreases. Use a synthetic staging registration for an end-to-end check.
6. **Escalate:** involve the SMTP owner if delivery remains unavailable or the backlog continues growing.

## Payment or refund `ProviderResultUnknown`

1. **Detect:** use EventId 7401 for unknown payment session state and 7402 for unknown refund state; retain the internal IDs/correlation reference.
2. **Verify:** inspect the existing persisted reconciliation case and use the provider's existing supported query/recovery path. Do not rely on a browser redirect, a client assertion, or an unverified provider response.
3. **Contain:** **do not blindly retry** a checkout or refund. Preserve server-owned payment/refund state, idempotency records, ledger entries and entitlements.
4. **Recover:** follow the application's current payment session recovery or PayTabs refund query/reconciliation procedure. This runbook does not authorize a new retry or state transition.
5. **Validate:** require deterministic provider evidence through the existing code path; verify server-owned state and financial invariants before closing the reconciliation case.
6. **Escalate:** route unresolved ambiguity to the finance owner and provider contact. Escalate material financial uncertainty under the externally approved policy.

## Storage lifecycle worker failure

1. **Detect:** review EventIds 7301–7303 and pending operation age/attempt state through authorized application mechanisms.
2. **Verify:** identify whether the issue is a bounded finalization/deletion retry, orphaned staging cleanup, or a worker-cycle dependency failure.
3. **Contain:** do not manually delete unknown objects or mark operations complete to silence an alert.
4. **Recover:** restore the affected storage dependency and allow the worker's bounded reconciliation schedule to run.
5. **Validate:** verify the operation reaches its expected terminal state and private object access/deletion matches the owning application record.
6. **Escalate:** involve storage and application owners if retries exhaust or finalization/deletion cannot be reconciled safely.

## Security or privacy incident

1. Preserve relevant logs, event IDs, request/deployment references and audit evidence with access controls; do not copy unnecessary personal data.
2. Use the existing authorized `SecurityIncident` workflow to record a human-assessed suspected incident and its evidence.
3. A technical alert is a lead for investigation; it does **not** automatically establish a privacy breach or reportable event.
4. Follow the designated human security/privacy and legal decision path for classification, notification and reporting decisions.
5. Restrict, retain or disclose evidence only under the applicable owner-approved process; document decisions and escalation.

## Administrator recovery

Use the existing [first administrator bootstrap rules](../DEPLOYMENT.md#first-administrator-bootstrap) only for a new migrated database with no Admin. Supply temporary operator credentials through the approved secret workflow; there are no default credentials. An existing deployment uses its approved identity recovery path. There is no emergency bypass account or privileged unaudited endpoint. Escalate identity or MFA recovery to the authorized administrator/security owner.

## Restore and disaster-recovery escalation

Do not improvise a production restore from this runbook. Follow and record the existing [PostgreSQL recovery drill](../DEPLOYMENT.md#postgresql-backup-and-restore-drill), [S3 logical-object recovery](../DEPLOYMENT.md#private-s3-object-recovery), and [Data Protection key/certificate recovery constraints](../DEPLOYMENT.md#data-protection-key-ring-and-certificate-recovery). Keep restore targets isolated and source data unchanged until validation completes. Production provider backup availability, RPO/RTO, retention, certificate custody, recovery owner, and completed production restore remain external evidence. Escalate uncertain scope or integrity to the designated recovery and data owners before resuming writes.
