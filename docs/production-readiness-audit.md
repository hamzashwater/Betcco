# BETCCO Production Readiness Audit

## Audit Metadata

- Audit date: 2026-09-27
- Repository: `hamzashwater/Betcco`
- Device: ASUS
- Model: Codex GPT-6; reasoning-effort and fast-mode settings are not exposed in this task context.
- Fast mode: not exposed in this task context.
- Baseline: `origin/main` = `fcf1fd324f450c890cd7b45bf60b0f8a8eabce64` (`Merge PR #102: Resit Commerce / Payment Contract — L12`)
- Working branch: `docs/production-readiness-audit`
- Open/Draft PRs before audit: none (GitHub REST `pulls?state=open` returned zero).
- Scope: read-only audit of production deployment, application security, data, storage, mail, payment/refund/payout, CI, and operational evidence on the exact baseline above.
- Explicit exclusions: no runtime, schema, migration, workflow, dependency, or environment-template changes; no production deployment or external-provider execution; no AI/RAG assessment beyond confirming the intentional deferral; no LENOVO Resit/ASSESS workflow redesign.
- Latest baseline merges include PRs #98–#102. No open implementation PR overlapped the audit. PR #102 and the refund work on #99–#101 were audited only as merged commerce/payment infrastructure.

### Reconciliation update — 2026-09-28

This section reconciles the historical audit with repository state verified after subsequent merges. The original 2026-09-27 audit baseline above is intentionally preserved for provenance.

- Current verified `main`: `25c162a9b002f84e604eed310a73680294055a0e` (PR #117 ASUS-10E1B merge).
- OPEN/Draft PRs at pre-edit reconciliation: none; checked against live GitHub before publishing this documentation branch.
- PR #106 — ASUS-10B Production Admin Bootstrap — merged; P0-01 repository implementation is closed.
- PR #108 — ASUS-10C Production S3 HTTPS Guard — merged; P1-05 repository implementation is closed.
- PR #109 — ASUS-10D1 Legacy Quiz Migration Preflight & Recovery Gate — merged; the repository fail-closed migration-safety gate is implemented, while owner retention/backup evidence remains external.
- PR #111 — ASUS-10E1A PostgreSQL Backup & Restore Recovery Drill — merged; PostgreSQL custom-format backup, checksum verification, isolated restore, application/financial fingerprint checks, and CI restore evidence are implemented.
- PR #114 — LENOVO N5B documentation reconciliation — merged after N1–N5A status reconciliation; no runtime/schema/workflow changes.
- PR #117 — ASUS-10E1B S3 & Data Protection Recovery Drill — DONE / MERGED at `25c162a9b002f84e604eed310a73680294055a0e`. Its final reviewed head `43ffaaf8687e9520b4441752526b3ac4ff2019a4` passed Quality, Full UAT Matrix, and Security analysis; no unresolved review threads remained.
- PR #123 — **ASUS-10E2A Operational Signals & Incident Runbooks — DONE / MERGED** at `7201ae473eae507877d314fe8c06a71de418b7bf`. Repository-controlled operational signals, stable event IDs, provider-neutral monitoring recommendations, and incident runbooks are verified. External alert collection/delivery and on-call evidence remain open.
- PR #125 — **ASUS-10F1 Immutable Release Artifact Contract — DONE / MERGED** at `ee55375461a4da6481d3ba948c487c1053734527`. Repository-controlled deployment now consumes digest-pinned API/Web references, migration reuses the API image, mutable/tag-only references are rejected by validation, and release/rollback manifest contracts exist.
- **ASUS-10F2 — Registry Publication & Same-Digest Promotion — BLOCKED / EXTERNAL-DEPENDENT** pending an approved registry and deployment platform. P1-04 remains open until real immutable artifacts are published, retained, deployed to staging, and promoted unchanged to production with evidence.
- External production-provider configuration, actual production/staging restore evidence, RPO/RTO/retention decisions, S3 provider recovery evidence, Data Protection certificate custody/recovery evidence, monitoring ownership, and live payment/payout readiness remain unverified unless separately evidenced.

## Executive Summary

| Classification | Count | Summary |
| --- | ---: | --- |
| P0 — Launch Blocker | 0 | P0-01 was closed by merged PR #106 with an explicit one-off production Admin bootstrap command. |
| P1 — Required Production Hardening | 4 | The legacy Quiz removal has a repository fail-closed migration gate and PostgreSQL recovery is now verified in CI. External retention/provider recovery evidence, S3/Data Protection recovery, monitoring/runbooks, and same-artifact promotion remain. P1-05 is closed. |
| P2 — Post-launch Improvement | 3 | Production image inputs are mutable tags; .NET transitive restore is not locked; in-process rate limits are not shared across API replicas. |
| EXTERNAL | 5 | Live hosting/provider/legal/operational decisions and credentials cannot be verified from this repository. |
| SAFE | 15 | Important controls are implemented and/or demonstrated by current code and baseline CI. |

**Readiness conclusion:** the repository has a substantial deployment and security foundation. Production Admin bootstrap, the custom S3 HTTPS guard, the legacy Quiz migration gate, and a repository-tested PostgreSQL backup/isolated-restore drill are merged. Remaining hardening includes S3 private-object and Data Protection certificate recovery, external provider/retention/RPO/RTO evidence, monitoring/incident readiness, and same-artifact promotion. Paid checkout and payouts are intentionally disabled in the deployment Compose file. Whether disabled commerce is launch-blocking depends on the approved launch scope; it is not classified as a code defect.

## Configuration / Secret Audit

`deploy.env.example` is the production/staging contract; `.env.example` and `appsettings.Development.json` are deliberately local-development defaults. `compose.deploy.yml` maps its environment into the API and fixes providers off. The clean clone contains no operator deployment env file. No credential value is reproduced here.

| Configuration | Owner / type | Required, default, and Production validation | Missing/invalid behavior; fallback risk; documentation |
| --- | --- | --- | --- |
| `BETCCO_ENVIRONMENT` / `ASPNETCORE_ENVIRONMENT` | Compose/API; non-secret | Required `Staging` or `Production` in deployment template; API image default is `Production`; `Deployment__RequireSecureEnvironment=true` | Compose requires it; validator requires deployment-safe configuration. Local environment values from `.env.example` are not production fallbacks. Documented in `deploy.env.example` and `docs/DEPLOYMENT.md`. |
| `BETCCO_IMAGE_TAG` | Compose image label; non-secret | Required placeholder is a Git SHA; Compose requires a non-empty tag but does not verify it is a SHA/digest | Compose fails if absent; operator can supply a mutable/arbitrary tag. The release-artifact proof gap is P1-04. Documented. |
| `BETCCO_PUBLIC_APP_URL` → `APP_PUBLIC_URL` / `AllowedOrigins__0` | Web/API public origin; non-secret | Required absolute HTTPS origin, no path/query/fragment; Compose uses the same value for public URL and allowed origin | Compose requires it; validator rejects absent/HTTP/malformed values. No localhost fallback in Staging/Production. Documented. |
| `BETCCO_ALLOWED_HOSTS` → `AllowedHosts` | API host filter; non-secret | Required explicit host list; wildcard `*` rejected in secure deployment | Missing or wildcard causes startup failure. Development `appsettings.json` has `*`, but Compose overrides and validator prevents silent production use. Documented. |
| `ConnectionStrings__Postgres` / `BETCCO_POSTGRES_CONNECTION_STRING` | API/PostgreSQL; secret | Required; no production default | Startup validator throws when empty; connectivity failure prevents readiness and migration. Not logged by validator. Documented. |
| `ReverseProxy__Enabled`, `ForwardLimit`, `KnownProxies` | API proxy trust; non-secret | Compose fixes enabled, one hop, `172.30.0.10`; startup requires valid proxy IP(s); app clamps hop count to 1–3 | Forwarding disabled by default outside Compose; secure deploy rejects missing trust list. Trust scope is fixed to the web container, not unrestricted. Documented in Compose and deployment runbook. |
| `DataProtection__Provider` | API key persistence; non-secret | Compose fixes `Postgres`; secure startup requires it | Invalid/missing provider fails startup; otherwise Program's filesystem default would be unsafe, but the Production validator rejects that path. Documented. |
| `BETCCO_DATA_PROTECTION_CERTIFICATE_PATH` → `DataProtection__CertificatePath` | API PFX file path; non-secret | Required absolute host path, mounted read-only in container | Compose fails if absent; Program loads PFX at startup, so absent/unreadable/invalid PFX stops startup. Documented. |
| `BETCCO_DATA_PROTECTION_CERTIFICATE_PASSWORD` | API key encryption; secret | Required; no default | Compose and validator reject empty. PFX password is not emitted by startup validation. Documented. |
| `Storage__Provider`, `BETCCO_S3_BUCKET`, `BETCCO_S3_REGION` | API object store; non-secret | Compose fixes `S3Compatible`; bucket/region required; endpoint optional (SDK regional endpoint); path-style optional/default false; auto-create fixed false; SDK retries default 3 and timeout default 100 seconds | Validator rejects Local/empty bucket/region; startup probes existing bucket and stops if unavailable. No local-storage fallback and no production auto-create. Documented. |
| `BETCCO_S3_ENDPOINT` → `Storage__S3__Endpoint` | API object-store endpoint; non-secret | Optional; `.env.example` uses local HTTP for development and `deploy.env.example` uses an HTTPS placeholder | In Staging/Production, any configured custom endpoint must be an absolute HTTPS URL with a valid host and no embedded userinfo; an empty endpoint remains allowed for the AWS SDK regional endpoint. Development/Testing may still use local HTTP MinIO. P1-05 was closed by merged PR #108. |
| `Storage:CleanupIntervalSeconds`, `Storage:StagingGraceMinutes` | API storage lifecycle; non-secret | `appsettings.json` defaults to 300 seconds and 15 minutes | Used by lifecycle worker for staged-object cleanup; not a production endpoint or credential. Documented as app defaults. |
| `BETCCO_S3_ACCESS_KEY` / `BETCCO_S3_SECRET_KEY` → `Storage__S3__AccessKey/SecretKey` | API object-store credentials; secret pair | Both or neither; either an explicit pair or provider credential chain | Validator rejects half-pairs; SDK uses configured credential chain if both omitted. Secret pair placeholders only in deployment example. Documented. |
| `BETCCO_CLAMAV_HOST` / `BETCCO_CLAMAV_PORT` | API-to-scanner endpoint; host non-secret | Host required; port optional, defaults to `3310`; scanner provider fixed `ClamAv` | Validator rejects missing host/invalid port or non-ClamAv provider. Runtime scan transport/protocol failure returns Unavailable and blocks upload. Documented. |
| `BETCCO_SMTP_HOST`, `PORT`, `FROM_ADDRESS`, `SMTP_USERNAME`, `SMTP_PASSWORD` | API email; host/from/port non-secret, credentials secret | Host/from/valid port required; port defaults to 587; TLS is fixed true; username/password optional but must be paired | Validator rejects missing host/from/port, SSL false, or half credentials. Send failures are surfaced to callers/outbox; many notification paths are best-effort. No Mailpit fallback in deployment Compose. Documented. |
| `BETCCO_WEB_PORT` / `BETCCO_SHUTDOWN_TIMEOUT_SECONDS` | Compose; non-secret | Optional defaults 3000 and 30 seconds; shutdown value clamped to 10–120 seconds | Web published on loopback only; invalid timeout is bounded by app. Documented. |
| `BETCCO_API_URL` build argument | Next.js server rewrite; non-secret | Deployment Docker build defaults to private Compose host `http://api:8080`; local `next.config.ts` fallback is `http://localhost:5085` | Server rewrite targets API; the localhost fallback is not selected by `frontend/Dockerfile`/Compose production build. Not a `NEXT_PUBLIC_*` secret. Documented in Compose/Dockerfile. |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | Next.js public values; non-secret | Public canonical origin can be supplied for metadata/sitemap; analytics endpoint optional and remains consent-gated | Public exposure is intentional; no secret is named `NEXT_PUBLIC_*`. Deployment supplies `APP_PUBLIC_URL`; tracking remains disabled unless configured/consented. `.env.example` documents local values. |
| `Payments__Provider`, `PayTabs__ProfileId`, `PayTabs__ServerKey`, `PayTabs__BaseUrl`, `PayTabs__Environment` | Commerce/API; server key secret, others non-secret except possibly profile metadata | Deployment pins provider `Disabled`; enabling PayTabs requires positive profile, nonempty key, HTTPS base URL, explicit `Test` or `Live`; PayTabs adapter only accepts `Test` in current code | Missing PayTabs fields fail startup if provider selected. Safe unconfigured provider otherwise rejects checkout. No production live mode path; do not treat as launch-ready. Keys are blank in examples. Documented as disabled/deferred. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Development initializer; email non-secret, password secret | Optional pair with no defaults in `.env.example`; initializer forces password change | Development-only seeding remains unchanged. Production now uses the separate explicit `--bootstrap-admin` operation with ephemeral `BootstrapAdmin__Email` / `BootstrapAdmin__Password`; no default credential or public bootstrap API exists. P0-01 was closed by PR #106. |
| `Payouts__Provider` and bank/e-wallet credentials | Commerce/API; credentials secret | Deployment pins `Disabled`; validator accepts only `Disabled` or `Manual` | Fake payout is not selected in Production; unconfigured provider refuses transfers. Real provider fields are intentionally not in deploy template. Documented as disabled/deferred. |
| JoFotara, AI, assessment PDF, demo data | API providers; optional credentials secret if separately enabled | Compose fixes JoFotara, AI, PDF, and demo data off | Each remains disabled unless a separately reviewed config path is added. Optional JoFotara/AI settings are validated when enabled; PDF licensing/fonts are validated when enabled. Documented. |
| Monitoring, metrics, tracing, backup schedules, object versioning, alert destinations | Operator/hosting; may contain secrets | No runtime config contract or real values in repository | Not silently configured by app. Provider/host proof required; see P1-02/P1-03 and EX-01. |

**Secret scan result:** no real credential value was found in the tracked example templates/source reviewed; local example values are labeled for development or are placeholders. `.gitignore` and `.dockerignore` exclude deployment env files and key/certificate material while retaining example templates. This says nothing about untracked operator files or the actual production secret store.

## P0 Launch Blockers — Closed

| ID | Area | Title | Confidence |
| --- | --- | --- | --- |
| P0-01 | Administrator bootstrap | Production has no reachable first-Admin provisioning path | HIGH |

### P0-01 — Production has no reachable first-Admin provisioning path

**Status:** CLOSED by merged PR #106 (`[ASUS] Production Admin Bootstrap`).

**Closure evidence:** Production now exposes an explicit one-off `--bootstrap-admin` operational command against an already migrated PostgreSQL database. It uses ephemeral operator-supplied bootstrap credentials, creates no default credential or public HTTP bootstrap route, preserves forced password change and staff MFA, is replay-safe, and serializes concurrent first-bootstrap attempts with a PostgreSQL transaction-scoped advisory lock.

**Severity:** P0 — Launch Blocker (historical finding)
**Area:** Admin bootstrap / operations
**Evidence:**

- `backend/src/Betcco.Api/Program.cs`, application startup: `DatabaseInitializer.InitializeAsync()` is invoked only inside `if (app.Environment.IsDevelopment())`. The production `--migrate` path calls only `Database.MigrateAsync()` and exits.
- `backend/src/Betcco.Infrastructure/Persistence/DatabaseInitializer.cs`, `SeedAdministratorAsync()`: this is the only source-controlled creator of an initial Admin. It needs both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`; a created account is marked `MustChangePassword = true`.
- `compose.deploy.yml` and `deploy.env.example` do not define or invoke an Admin bootstrap operation. `README.md` says the optional Admin is created from those variables but does not state the Development-only invocation boundary.
- `backend/src/Betcco.Api/Controllers/AdminUsersController.cs`: privileged user creation endpoints require the `SystemAdmin` policy, so they cannot bootstrap an empty production database.
- No migration or other documented production procedure creates the first privileged user.

**Production scenario:** an operator follows the deployment runbook on a fresh database: the one-off migration succeeds and the API starts, but no Admin/SystemAdmin account exists. Authenticated administration cannot be reached to create the course catalogue, configure operations, or grant staff access. Supplying `SEED_ADMIN_*` to the API does not help because production startup never calls `DatabaseInitializer`.

**Impact:** availability and operations; production setup and ongoing administration are blocked unless an undocumented/manual database intervention is used.

**Recommended remediation:** add a deliberate, auditable, one-time production bootstrap operation or a documented secure provisioning procedure. Require a high-entropy secret or equivalent operator authorization, create exactly one least-privilege initial administrator, require credential change and staff MFA before privileged use, and make retries idempotent. Do not restore automatic production demo seeding.

**Suggested tests:** run the migration and API startup under `Production` against an empty PostgreSQL database; prove the documented bootstrap creates exactly one forced-password-change administrator and is safe to retry; prove absent/invalid bootstrap authorization creates no account and no predictable credential; prove the new staff account cannot use privileged endpoints before mandatory MFA enrollment.

**Dependencies:** none for a repository implementation; deployment secret/operator handling is shared.
**Ownership:** ASUS.

## P1 Required Production Hardening

| ID | Area | Title | Confidence |
| --- | --- | --- | --- |
| P1-01 | Migration safety | Legacy Quiz migration irreversibly removes quiz tables and dependent rules | HIGH |
| P1-02 | Backup / restore | Repository PostgreSQL, private S3 logical-object, and Data Protection key-ring/certificate recovery evidence verified; production provider evidence remains pending | HIGH (external production evidence pending) |
| P1-03 | Observability / incident response | Health endpoints exist, but monitoring, alerting, and key incident procedures are not evidenced | HIGH (repository evidence) |
| P1-04 | Release promotion | The release process does not prove that one immutable artifact is promoted from staging to production | HIGH (repository evidence) |
| P1-05 | Storage / transport security | Custom production S3 endpoint accepts plain HTTP | HIGH |

### P1-01 — Legacy Quiz migration irreversibly removes quiz tables and dependent rules

**Status:** REPOSITORY GATE CLOSED / EXTERNAL DATA-RETENTION & BACKUP EVIDENCE REMAINS.

**Severity:** P1 — Required Production Hardening
**Area:** Database migration safety
**Evidence:**

- `backend/src/Betcco.Infrastructure/Persistence/Migrations/20260924073104_RemoveLegacyQuizSystem.cs`, `Up()`: updates legacy Quiz lessons to archived/unpublished; deletes related `ContentPrerequisites` and `ContentAccessRules`; drops `QuestionBankQuestions`, `QuizAttemptQuestionGrades`, `QuizAttempts`, `QuizQuestions`, and `Quizzes`.
- The migration's comments explicitly preserve Lesson identities and lesson-linked learner history; the dropped quiz question/attempt tables are not preserved by those statements.
- `docs/DEPLOYMENT.md`, Database migration and Legacy Quiz removal preflight: migrations run through the explicit one-off `--migrate` container, API replicas do not migrate at startup, and the legacy data count, blocked/clear/indeterminate states, override, and recovery evidence requirements are documented.
- `backend/src/Betcco.Infrastructure/Persistence/LegacyQuizMigrationGate.cs` and `backend/src/Betcco.Api/Program.cs`: `--migration-preflight` reports aggregate counts only; `--migrate` blocks when counted data exists unless the operator supplies the explicit per-run `--allow-legacy-quiz-data-removal` acknowledgement. Missing historical tables and indeterminate state remain blocked. A PostgreSQL advisory lock is held across the preflight-to-migration path.
- `backend/tests/Betcco.IntegrationTests/LegacyQuizMigrationGateTests.cs`: PostgreSQL integration coverage exercises applied, fresh, empty historical, blocked data, approved migration, missing table, private-output, and concurrent migration cases.

**Production scenario:** if an existing database contains legacy quiz authoring or attempt history when the one-off migration reaches this version, those tables and the listed access/prerequisite rows are deleted. This cannot be reversed by `Down()` because recreated tables are empty. The audit cannot determine whether any actual production database contains those records.

**Impact:** data integrity and historical learner evidence.

**Repository control implemented:** the migration preflight inventories affected row counts, and the normal migration operation stops before `Database.MigrateAsync()` when data exists unless an explicit per-run owner acknowledgement is supplied. The read-only preflight and migration share a PostgreSQL advisory lock. The existing destructive migration and ModelSnapshot are unchanged; no schema change or migration was added.

**Remaining external decision/evidence:** before using the override where data exists, the owner must decide retention/export, operators must take and verify access to a backup/snapshot, and a restore to an isolated database is preferred. Repository code cannot prove that a provider backup or owner approval exists. P1-02 remains open; no backup/restore work is claimed by this gate.

**Suggested tests:** seed an old-schema database with quiz questions, attempts, grades, lessons, access rules, and prerequisites; verify default migration blocks without changing rows or history; verify explicit approval runs the unchanged migration and archives lessons; verify backup/export preservation and restore in an isolated database as separate operator evidence.

**Dependencies:** owner decision on legacy quiz history and an external backup/restore service.
**Ownership:** shared (ASUS migration owner + data owner).

### P1-02 — Repository recovery evidence verified; production evidence pending

**Status:** REPOSITORY POSTGRESQL + PRIVATE S3 LOGICAL-OBJECT + DATA PROTECTION KEY-RING/CERTIFICATE RECOVERY VERIFIED / EXTERNAL PRODUCTION RECOVERY REMAINS OPEN.

**Severity:** P1 — Required Production Hardening
**Area:** PostgreSQL / object backup
**Evidence:**

- `scripts/backup-postgres.sh` creates a PostgreSQL 16 custom-format archive, SHA-256 sidecar, and safe metadata; it rejects non-16 `pg_dump` clients.
- `scripts/test-postgres-restore.sh` verifies the checksum before restore, uses a distinct disposable `betcco_restore_...` target, checks application and financial fingerprints plus EF migration history, compares source and restored fingerprints, and cleans up only its newly created target.
- `.github/workflows/quality.yml` runs the drill against the existing pinned PostgreSQL/pgvector 16 image after migrations are applied. Its synthetic fixture covers identity, catalogue, enrollment, evaluation price, and a balanced JOD ledger transaction.
- `docs/DEPLOYMENT.md` documents the repository and operator procedures, security boundary, and unapproved recovery decisions. `docs/operations/restore-drill-record.md` is a blank evidence template; it is not evidence of a production restore.
- `compose.deploy.yml` still contains no production backup job or provider snapshot configuration. This repository does not establish whether the selected host has backups.

**Production scenario:** database corruption, accidental deletion, account compromise, or provider/region loss occurs. If the selected PostgreSQL and S3 services have no tested independent backups, student submissions and finance records may be unrecoverable or recovery may exceed the required window. Current external configuration is unknown.

**Impact:** availability, financial integrity, privacy, and learner records.

**Repository side — VERIFIED:** PostgreSQL synthetic-data backup and isolated restore (PR #111); private S3 logical-object recovery; and encrypted Data Protection key-ring recovery using the configured certificate/private key (PR #117, merged at `25c162a9b002f84e604eed310a73680294055a0e`). The PR #117 final reviewed head passed Quality, Full UAT Matrix, and Security analysis.

**External production side — PENDING:** verify real production backup-provider configuration and schedule, production S3 versioning/replication/provider backups, production PFX/private-key custody and backup, and access controls; conduct and retain staging/production restore exercises; obtain owner-approved RPO/RTO, backup frequency, retention, recovery owner, and cross-region recovery. Repository evidence does not establish any of these operational controls.

**Approved decisions:** RPO NOT YET SET; RTO NOT YET SET; backup retention NOT YET SET; backup frequency NOT YET SET; recovery owner NOT YET SET.

**Suggested external tests:** scheduled production-provider restore exercise; verify agreed row/state and financial ledger invariants; restore representative private objects and decrypt Data Protection-protected values using the documented certificate recovery path; record measured recovery point/duration and operator sign-off.

**Dependencies:** hosting/database/S3 vendors and operations owner.
**Ownership:** external/shared.

### P1-03 — Monitoring, alerting, and key incident procedures are not evidenced

**Status:** REPOSITORY-CONTROLLED FOUNDATION VERIFIED by PR #123; EXTERNAL MONITORING / ALERT DELIVERY EVIDENCE REMAINS OPEN.

**Severity:** P1 — Required Production Hardening
**Area:** Observability / operations

**Repository evidence after PR #123:**

- `/health/live` remains a process-liveness probe.
- `/health/ready` remains a PostgreSQL and S3 readiness probe; SMTP, ClamAV, payment providers, and payout providers are intentionally not promoted to general readiness dependencies.
- Stable provider-neutral operational EventIds cover readiness unavailability, registration-email delivery/worker/aged-backlog conditions, scanner unavailability, storage-operation/reconciliation/worker failures, and payment/refund provider-result-unknown conditions.
- `docs/operations/monitoring-alerts.md` defines the repository signal contract, recommended thresholds/severity, safe correlation fields, immediate operator actions, and the external evidence required before an alert can be considered operational.
- `docs/operations/incident-response.md` documents provider-neutral response procedures for database/readiness failure, private-storage failure, ClamAV outage, SMTP/outbox backlog, payment/refund unknown states, storage lifecycle failure, security/privacy incidents, administrator recovery, and disaster-recovery escalation.
- Logging changes deliberately avoid raw provider payloads, credentials, confirmation tokens, recipient data, upload contents, and other unnecessary private data. Finance/auth state-transition semantics were not changed.
- Authentication/rate-limit alert classification remains deferred because the current rejection boundary cannot safely identify an authentication category without broader auth integration.

**Remaining production gap:** the repository does not prove deployment of a log/metric collector, alert receiver, paging/on-call channel, named operations owner, owner-approved thresholds/severity/SLA, or successful staging/production alert delivery and acknowledgement.

**Production scenario:** the application now emits stable signals and has response procedures, but those controls do not prove that a human receives or acknowledges a critical alert in a real environment.

**Impact:** availability, finance, privacy, and operations.

**Required external remediation:** connect the repository-defined health/application signals to an owned monitoring and alert channel; approve operational thresholds and response ownership; exercise representative failures in staging; verify delivery, acknowledgement, correlation, runbook execution, recovery, and closure without forwarding secrets or unnecessary personal data.

**Suggested external tests:** controlled staging failures for critical dependency/signal classes; verify the event or health transition reaches the configured receiver, is acknowledged by the responsible owner, contains only approved correlation metadata, follows the documented runbook, and is closed after recovery.

**Dependencies:** hosting/monitoring provider and operations owner.
**Ownership:** shared/external for remaining evidence.

### P1-05 — Custom production S3 endpoint accepts plain HTTP

**Status:** CLOSED by merged PR #108 (`[ASUS] Production S3 HTTPS Guard`).

**Severity:** P1 — Required Production Hardening
**Area:** S3 configuration / transport security
**Evidence:**

- `backend/src/Betcco.Api/Program.cs`, S3 client registration still passes a configured custom endpoint to the AWS SDK; transport enforcement is intentionally performed by startup validation before secure-environment startup.
- `backend/src/Betcco.Api/Configuration/StartupConfigurationValidator.cs`, `ValidateSecureS3Endpoint`: Staging/Production now require any configured custom endpoint to be an absolute HTTPS URL with a host and no embedded userinfo; an empty endpoint remains valid.
- `deploy.env.example` shows an HTTPS example endpoint, but example guidance does not enforce the runtime boundary.

**Production scenario:** an operator configures a custom `http://` S3-compatible endpoint in Production. Object contents and/or access-key authentication traffic could then traverse the API-to-storage network without TLS, depending on network topology. The default regional endpoint is not implicated when no custom endpoint is supplied.

**Impact:** confidentiality of private student files and storage credentials; integrity of object traffic.

**Recommended remediation:** when a custom Production/Staging endpoint is supplied, require an absolute HTTPS URI with a valid host. Allow HTTP only in Development/Testing. Document approved private endpoint use without relaxing transport protection.

**Suggested tests:** startup validator rejects `http://` custom S3 endpoints in both secure environments, accepts valid HTTPS endpoints, and preserves the provider-default behavior when endpoint is empty; include a deployment configuration test.

**Dependencies:** none for validation; external S3 provider must offer TLS.
**Ownership:** ASUS.

### P1-04 — Release process does not prove same-artifact staging-to-production promotion

**Status:** REPOSITORY-CONTROLLED IMMUTABLE RELEASE CONTRACT VERIFIED by PR #125; EXTERNAL REGISTRY PUBLICATION / PROMOTION EVIDENCE REMAINS OPEN.

**Severity:** P1 — Required Production Hardening
**Area:** Release / rollback

**Repository evidence after PR #125:**

- `compose.deploy.yml` no longer contains application `build:` entries for `migrate`, `api`, or `web`; secure deployment consumes prebuilt image references instead of rebuilding application images in staging/production.
- `BETCCO_API_IMAGE` and `BETCCO_WEB_IMAGE` are the secure-deployment image contract and are documented as full OCI digest references.
- `migrate` and `api` use the exact same API image reference.
- `.github/scripts/validate_release_images.py` rejects empty, tag-only, `:latest`, malformed-digest, malformed-source-SHA, API/migration mismatch, and same-release staging/production digest mismatch inputs.
- `docs/release-manifest.schema.json` links one full source commit SHA to API, Web, and migration image references, prior known-good release references, and staging/production evidence fields without claiming deployment evidence before it exists.
- `docs/DEPLOYMENT.md` now defines build-once → publish externally → record immutable digests → deploy exact digests to staging → verify → promote the same digests to production. Rollback uses exact previous digest references and does not imply automatic schema downgrade.
- PR #125 final-head Quality, Full UAT Matrix, Security analysis, both CodeQL languages, Dependency Review, Compose validation, production image build, migration-image execution, and production API health checks passed before merge. Post-merge main Quality and Security analysis also passed.

**Remaining production gap:** the repository intentionally does not select a registry or deployment platform and does not prove that an API/Web image pair has actually been published by digest, retained, pulled in staging, verified there, then promoted unchanged to production. Registry retention, provenance, production approval, and rollback pullability therefore remain external evidence.

**Production scenario:** the repository prevents the old source-rebuild deployment contract, but without a real registry/promotion path there is still no operational proof that staging and production ran the same published bytes or that the previous release remains pullable for rollback.

**Impact:** release integrity, reproducibility, provenance, and rollback availability.

**Required external remediation:** approve an image registry and deployment platform; publish one API/Web image pair from the reviewed source SHA; capture registry digests/provenance; retain current and previous known-good digests; deploy the exact pair to staging and record smoke evidence; promote those exact references unchanged to production after approval; verify rollback can still pull the prior references.

**Suggested external tests:** publish synthetic/non-production release artifacts to the approved registry; verify recorded digests are pullable; deploy exactly those references in staging; compare release records before production promotion; demonstrate that production uses the identical API/Web digests and that the prior digests remain pullable for rollback.

**Dependencies:** approved image registry, deployment platform, release operator/approver, retention policy.
**Ownership:** shared/external for remaining evidence.

## P2 Improvements

### P2-01 — Production Docker base images use mutable tags

**Severity:** P2 — Post-launch Improvement
**Area:** Container supply chain
**Evidence:** `backend/src/Betcco.Api/Dockerfile` uses `mcr.microsoft.com/dotnet/sdk:10.0` and `mcr.microsoft.com/dotnet/aspnet:10.0`; `frontend/Dockerfile` uses `node:24-bookworm-slim`. These are version-family tags, not immutable digests. By contrast, CI GitHub Actions and its PostgreSQL/Mailpit test images use digest/SHA pins.

**Production scenario:** rebuilding later from the same source SHA can resolve to changed upstream image contents, reducing reproducibility and making image provenance less precise. There is no evidence of a current compromise.

**Impact:** release reproducibility and supply-chain assurance.

**Recommended remediation:** pin runtime/build bases to reviewed digests and update them through a scheduled, reviewed maintenance process.

**Suggested tests:** CI verifies all production Docker `FROM` references are digest-pinned and builds the resulting images.

**Dependencies:** upstream image maintenance.
**Ownership:** ASUS.

### P2-02 — Backend NuGet restore has no committed dependency lockfile

**Severity:** P2 — Post-launch Improvement
**Area:** Dependency reproducibility
**Evidence:** `frontend/pnpm-lock.yaml` is committed, but no `packages.lock.json` or NuGet lock-file setting was found. Backend package references are declared in project files; CI runs `dotnet restore` on each build. `security.yml` runs CodeQL and PR Dependency Review, but that is not a pinned NuGet transitive resolution.

**Production scenario:** transitive NuGet dependency resolution may change between restores even when the BETCCO commit is unchanged, making build reproduction and incident provenance less exact. No current vulnerable package was established by this observation.

**Impact:** supply-chain traceability and reproducibility.

**Recommended remediation:** consider committing NuGet lock files and enabling locked restore for release builds; keep package changes in reviewed dependency updates rather than changing dependencies during this audit.

**Suggested tests:** CI performs locked restore for the backend solution and fails if resolved dependency versions differ from committed lock files.

**Dependencies:** none.
**Ownership:** ASUS.

### P2-03 — Rate-limit budgets are process-local

**Severity:** P2 — Post-launch Improvement
**Area:** Abuse controls / scaling
**Evidence:** `backend/src/Betcco.Api/Program.cs`, `AddRateLimiter()`: login, authentication, password reset, search, upload, checkout, webhook, write, and AI policies use ASP.NET in-process rate limiters. `compose.deploy.yml` currently runs one API service; no distributed limiter is configured.

**Production scenario:** if API replicas are added or traffic is distributed across multiple instances, each instance receives an independent budget. Effective aggregate limits increase with replica count and restart resets a process's counters. The present single-instance topology does not demonstrate this failure.

**Impact:** abuse resistance and resource controls during horizontal scaling.

**Recommended remediation:** before enabling multiple API replicas, decide on gateway-level or distributed limits for abuse-sensitive routes and preserve per-user/IP controls as appropriate.

**Suggested tests:** distribute repeated login, reset, and upload requests across replicas and verify aggregate enforcement and acceptable proxy identity handling.

**Dependencies:** deployment topology choice.
**Ownership:** shared.

## External Production Dependencies

These are not repository defects. They require a launch decision or evidence from the selected providers/operators.

### EX-01 — Production hosting, credentials, and external dependencies

**Classification:** EXTERNAL
**Area:** Hosting / infrastructure
**Title:** The external production environment has not been provisioned or evidenced
**Evidence:**

- `compose.deploy.yml` and `deploy.env.example` define required HTTPS edge, PostgreSQL, private S3-compatible storage, ClamAV, SMTP, and Data Protection PFX/password inputs.
- No real deployment values were present in this clean clone and no deployed host was inspected. The actual S3/DB/SMTP/ClamAV reachability, TLS, bucket privacy/versioning, permissions, certificate backup, DNS, and edge HSTS cannot be verified from source.
- The edge, not the application Compose stack, terminates public TLS; the API itself emits no HSTS header.

**Production scenario:** a syntactically valid configuration can still reference unreachable or mis-permissioned external services, or an edge that lacks expected TLS/HSTS behavior.
**Impact:** availability, privacy, and transport security.
**Confidence:** HIGH that the dependency is external; LOW on the actual service state.
**Recommended remediation:** provision and review each provider in staging, prove private access/TLS/permissions and HSTS at the edge, then retain production configuration evidence without disclosing secret values.
**Suggested tests:** execute the documented staging smoke for login, authorized private-file read, scanner-protected upload, queued email, readiness, and edge security headers; verify external IAM/policy settings separately.
**Dependencies:** hosting, database, object storage, ClamAV, SMTP, DNS/TLS operator.
**Ownership:** external/shared.

### EX-02 — Live payments are unavailable; launch scope must decide whether that blocks launch

**Classification:** EXTERNAL / intentionally disabled
**Area:** Payments
**Title:** No live PayTabs provider path is enabled or externally verified
**Evidence:**

- `compose.deploy.yml` fixes `Payments__Provider=Disabled`.
- `Program.cs` returns `UnconfiguredPaymentProvider` in Production unless PayTabs is explicitly selected.
- `PaymentProviders.cs`, `PayTabsPaymentProvider.EnsureTestMode()`, rejects any PayTabs environment other than `Test`; no live PayTabs path is enabled.
- Real PayTabs credentials and live behavior are unavailable. Simulated provider tests do not establish real sandbox/live readiness.
- Server-owned prices, JOD `MoneyPolicy`, checkout/idempotency/recovery, provider-result verification, and refund reconciliation paths are present. PayTabs partial provider refund execution remains disabled; ASUS-08C2 remains NO-GO.

**Production scenario:** if paid checkout is required for launch, the deployed provider refuses production checkout; if someone separately enables PayTabs with the current adapter, only Test mode is supported.
**Impact:** finance and commercial availability; no payment is falsely confirmed by a fake provider in Production.
**Confidence:** HIGH for disabled/live-not-supported code behavior; LOW for external provider readiness.
**Recommended remediation:** confirm launch scope; if paid sales are required, use a separate reviewed live-provider workstream and preserve the partial-refund NO-GO gate until real provider evidence is accepted.
**Suggested tests:** actual PayTabs sandbox and production-account verification of callbacks, query recovery, duplicates, currency/amount/reference checks, timeout/unknown recovery, refund statuses, and reconciliation with non-production credentials first.
**Dependencies:** PayTabs credentials/account, merchant onboarding, external provider validation, business scope.
**Ownership:** ASUS + external provider/business owner.

### EX-03 — Real payouts are unavailable; teacher settlement scope must be decided

**Classification:** EXTERNAL / intentionally disabled
**Area:** Payouts
**Title:** No production bank/e-wallet transfer adapter is selected
**Evidence:**

- `compose.deploy.yml` fixes `Payouts__Provider=Disabled`.
- `Program.cs` selects an unconfigured provider in Production rather than the Development/Test fake.
- Payout lifecycle/accounting contracts exist, but this audit found no real bank/e-wallet transfer adapter or provider credentials in the repository.

**Production scenario:** if teacher withdrawals/settlement are promised at launch, the deployment cannot transfer funds.
**Impact:** finance and teacher settlement.
**Confidence:** HIGH for current deployment selection; LOW for any external provider arrangement.
**Recommended remediation:** decide whether payout is in launch scope; if yes, complete a separate provider integration, idempotent unknown-result recovery, settlement reconciliation, and operational approvals before promising transfers.
**Suggested tests:** contract and sandbox tests for duplicate execution, timeout/unknown state, settlement mismatch, wallet/ledger consistency, and reconciliation; then operator-approved low-value production verification.
**Dependencies:** bank/e-wallet provider, credentials, contracts, settlement policy.
**Ownership:** ASUS + external provider/business owner.

### EX-04 — Legal, privacy, and minor-registration release decisions

**Classification:** EXTERNAL
**Area:** Legal / privacy operations
**Title:** Verified business details, legal approval, and age-scope decision remain outstanding
**Evidence:**

- The repository contains versioned privacy/legal content and data-subject request/export foundations.
- `ASSUMPTIONS.md`, `README.md`, and `DatabaseInitializer.EnsureLegalSettingsAsync()` identify placeholder business/contact fields and state that self-registration is limited to age 18+ pending a verified guardian-consent workflow.
- No lawyer's approval, verified registration/address/contact values, decision to retain or lift the 18+ limit, or release evidence for guardian consent is available in the repository.

**Production scenario:** publishing current placeholder business/contact data or accepting minors without the required consent policy/workflow could create legal/privacy non-readiness. The repository itself does not determine jurisdictional obligations.
**Impact:** privacy, legal operations, and user eligibility.
**Confidence:** HIGH for the presence of documented placeholders and the 18+ code/product constraint; LOW for external legal status.
**Recommended remediation:** obtain authorized legal/privacy review; verify owner/business/contact values; choose and document an 18+ launch or commission a separately scoped guardian-consent implementation before accepting minors.
**Suggested tests:** verify published pages and operational contact settings match approved values; if minor support is enabled, test guardian verification, consent withdrawal, access controls, retention, and audit.
**Dependencies:** business owner and qualified legal/privacy reviewer.
**Ownership:** external; resulting product changes shared with ASUS.

### EX-05 — Repository security settings and alert state could not be live-verified

**Classification:** EXTERNAL / evidence limitation
**Area:** Repository security controls
**Title:** Current branch protection and security-alert configuration require authenticated verification
**Evidence:**

- Public GitHub REST returned `401` for branch protection, Code Scanning alerts, and Secret Scanning alerts.
- `docs/PROJECT_STATUS.md` records Secret Scanning and Push Protection enabled with zero open secret-scanning alerts on 2026-09-25; that historical record is not live verification.
- No secret value was found in the tracked templates or source reviewed, but the actual host secret store is outside this clone.

**Production scenario:** the repository could have changed security settings or new alerts since the historical verification; this audit cannot rule that out.
**Impact:** supply-chain/security assurance and secret exposure response.
**Confidence:** HIGH that live evidence was unavailable; LOW on current setting/alert state.
**Recommended remediation:** repository administrator verifies branch protection, required checks, Secret Scanning, Push Protection, Code Scanning, and current alerts through authenticated GitHub settings before release.
**Suggested tests:** retain dated settings/alert evidence in the release checklist and confirm required checks enforce the intended branch rules.
**Dependencies:** authenticated repository-admin access.
**Ownership:** external (repository administrator).

## Verified Safe / Already Hardened

1. **Production configuration rejects unsafe fallbacks.** `StartupConfigurationValidator.ThrowIfInvalid()` requires explicit HTTPS public URL/origins, explicit hosts, a trusted proxy, Postgres Data Protection plus certificate settings, S3-compatible storage, ClamAV, SMTP/TLS, and explicit Disabled/PayTabs and Disabled/Manual provider choices. Invalid settings stop startup. The deployment Compose file fixes disabled providers and demo data off.
2. **No predictable production admin credential exists in source.** The optional seeded credential has no default value in `.env.example`; the development-only initializer forces password change. The production bootstrap path itself is the P0 finding above.
3. **Fake payments and fake confirmation are environment-bound.** `Program.cs` registers `FakePaymentProvider` and `FakePayoutProvider` only in Development/Testing; Production uses PayTabs only when explicitly selected, otherwise unconfigured providers. Fake confirmation endpoints return 404 outside Development.
4. **Authentication/session controls are substantial.** `Program.cs` configures 12-character minimum passwords, upper-case and non-alphanumeric requirements, confirmed email, five-failure/15-minute lockout, HttpOnly/Lax/Secure production cookies, per-browser session checks, zero-interval SecurityStamp validation, and session revocation. Staff roles are enforced through mandatory MFA middleware/policy and recovery-code flows.
5. **Cookie-authenticated writes have antiforgery protection; CORS is exact-origin.** `AddControllersWithViews()` installs automatic antiforgery validation with `X-CSRF-TOKEN`; `same-origin` CORS uses configured origins, credentials, and no wildcard. Production validation requires HTTPS origins.
6. **Sensitive route abuse controls exist.** `Program.cs` defines policies for login, auth, password reset, search, uploads, checkout, webhook, writes, and AI, and controllers apply them to sensitive actions. Current limits are process-local; see P2-03 for future scale-out.
7. **Authorization and financial decisions are server-owned.** Role/permission policies include separate Admin, SystemAdmin, FinanceAdmin, SupportAdmin, and assessment permissions; code and tests cover ownership and provider/reference/amount/currency verification. `MoneyPolicy` constrains supported currency/precision to JOD rules; refund, ledger, wallet, and payment recovery state are persisted server-side.
8. **Payment unknown-state and refund reconciliation are represented explicitly.** `CommerceService`/`RefundService` recover sessions and provider outcomes, preserve unknown/pending states, check provider identity/reference/amount/currency, and guard repeated accounting through database constraints/transactions. Current tests include `PaymentSessionRecoveryTests`, `PayTabsPaymentProviderTests`, `PaymentLifecycleTests`, and refund recovery coverage. This is code/simulated-provider evidence, not live PayTabs evidence.
9. **Production storage is private and startup-failing.** Production validation requires `S3Compatible`; `StorageProviderStartupService` checks the selected bucket and does not create it in Production. S3 objects are staged under server-generated unpredictable keys, exposed only through authorized API reads, and lifecycle recovery cleans staged/orphan objects. No local-storage fallback is selected silently.
10. **Upload scanning fails closed.** `FileSecurityScanners.cs` returns `Unavailable` when ClamAV cannot be contacted or its response is inconclusive; upload services persist/serve only clean files. Production validator requires ClamAV. Upload validation includes bounded formats and ZIP entry/uncompressed-size/compression-ratio limits; controller limits cap request bodies.
11. **Data Protection is configured for shared production use.** Production requires PostgreSQL persistence and a configured PFX/password; `Program.cs` loads the certificate at startup and encrypts persisted keys. Bad/missing certificate material prevents startup. External certificate retention/rotation remains operator-owned.
12. **Migrations are controlled, not applied by API replicas.** `--migrate` is a one-off command; normal Production startup does not call EF `MigrateAsync`. Migration errors exit non-zero. The deployment runbook documents backup-before-change as a prerequisite in principle, staging smoke, and image rollback without automatic schema downgrade. P1-01 and P1-02 describe the remaining operational safeguards.
13. **Health and HTTP security controls exist.** `/health/live` checks process response; `/health/ready` checks PostgreSQL and S3. Backend error handling returns generic production Problem Details with a trace ID. API and frontend set `nosniff`, strict referrer policy, frame denial, Permissions Policy, and CSP. Forwarded headers are enabled only when configured and restricted to explicit known proxy IPs with a bounded hop count.
14. **Production containers have meaningful hardening.** API and frontend runtime stages run as non-root; production Compose sets read-only filesystems, drops all Linux capabilities, enables `no-new-privileges`, mounts the Data Protection PFX read-only, and publishes only the web port on host loopback. Database, API, ClamAV, SMTP, and S3 ports are not published by `compose.deploy.yml`. Development Compose is separately identified and intentionally publishes local service ports.
15. **CI and dependency controls are present.** `quality.yml` runs frontend formatting/lint/type/tests/build, .NET format/build/tests, PostgreSQL migrations, private S3 checks, public Playwright smoke, Compose validation, production image builds, and image health checks. `full-uat.yml` supplies a full browser matrix. `security.yml` runs CodeQL and PR Dependency Review. The frontend `pnpm-lock.yaml` and immutable workflow action SHAs are committed. Backend package references are explicit, but no NuGet lockfile was found (P2-02). On the baseline merge SHA, GitHub check-runs reported Application quality and both CodeQL jobs successful; Dependency Review was skipped as expected on a non-PR commit.

## Deployment & Infrastructure State

| Component | Repository-managed or external | Production requirement / current behavior |
| --- | --- | --- |
| Next.js web | Repository image | Standalone non-root image; bound to host loopback port 3000 by default; proxies API/hubs privately. |
| ASP.NET API | Repository image | Non-root, HTTP inside private Compose network; `/health/ready` gates web dependency. |
| PostgreSQL | External | Required connection string; migration is explicit; readiness checks connectivity. Backup ownership is external. |
| S3-compatible private object store | External | Required bucket/region; application checks bucket at startup/readiness; no production auto-create. |
| ClamAV | External | Required in Staging/Production; upload operation fails closed if scan is unavailable; not a general readiness dependency. |
| SMTP | External | Required host/from/port and TLS in Staging/Production; email delivery is asynchronous/best effort for many workflows. |
| HTTPS edge/proxy | External | Owns public TLS and host routing; API trusts the fixed web-container proxy. TLS/HSTS/edge hardening must be configured and evidenced externally. |
| PayTabs | External / disabled | Deployment pins payments disabled; adapter currently permits Test environment only. Live readiness is absent. |
| Payout provider | External / disabled | Deployment pins payouts disabled; no real transfer adapter is selected. |
| Monitoring / backups | External / not evidenced | No repository-managed provider, restore drill, RPO/RTO, or alert receiver. |

Production Compose does not publish PostgreSQL, S3, SMTP, ClamAV, or API host ports. `docker-compose.yml` is development-only and publishes Postgres, MinIO, and Mailpit for local use; it must not be used as the production exposure boundary.

## Security State

- **Authentication/session:** strong Identity cookie/session revocation and lockout foundations are present; learner MFA is optional, staff MFA is mandatory. No evidence supports changing those boundaries in this audit.
- **CORS/CSRF:** configured-origin credentialed CORS has no wildcard; automatic antiforgery applies to unsafe MVC/controller actions. Webhook actions have dedicated rate policies and provider/server verification paths.
- **Proxy/HTTPS:** forwarding trust is restricted to configured IPs. `UseHttpsRedirection()` is present. Public TLS termination is external, and neither `Program.cs` nor `frontend/next.config.ts` configures HSTS; require edge TLS/HSTS verification before public traffic.
- **Headers:** frontend `proxy.ts` and API middleware set CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and `Permissions-Policy`. Historical development CSP console messages are not evidence of a production CSP defect.
- **Errors/logging:** `BetccoExceptionHandler` hides exception detail outside Development and returns a trace identifier. Provider clients do not log raw credentials/payloads in reviewed request paths. Audit metadata is bounded/minimized; no real secret value was exposed in this audit.
- **Abuse controls:** login, password reset, upload, checkout, search, webhook, and mutable-write policies exist. Contact/support forms use write policies. No global arbitrary limit was inferred as necessary. The limiter's in-memory scope matters if deployment scales beyond the current single API service (P2-03).
- **Admin bootstrap:** unresolved P0-01.
- **GitHub protections:** current settings/alerts could not be verified without authenticated repository API access (EX-05); only the dated status-document evidence is available.

## Data Protection / Storage / Upload State

- `DataProtection:Provider=Postgres` and an encrypted PFX-protected key ring are required for Staging/Production. This supports container restarts and shared replicas if all instances use the same database, certificate, application name, and correct secret version. Certificate backup/rotation and actual multi-instance deployment are external operational evidence.
- Private storage uses an existing externally provisioned bucket, `S3CompatiblePrivateFileStorage`, unpredictable server-side object keys, authorized application streaming, and a storage lifecycle worker. Public object access is not used by the application path. Bucket access policy, TLS, versioning, and external recovery need provider-side proof.
- ClamAV is configured as an external TCP daemon. Unavailable/malformed scan results do not become Clean; files are not made available before a clean scan. Scanner service uptime, update policy, and incident response are external.
- Upload endpoints enforce type and size checks and have server request limits; ZIP validation bounds entries, expansion size, and compression ratio. No broader production upload throughput/load test was evidenced.
- Migration `20260924073104_RemoveLegacyQuizSystem` has the conditional data deletion described in P1-01. No migration was run during the audit.

## Payments / Refunds / Payout State

- Prices, tax snapshot, currency, provider result, ownership, payment status, cart linkage, fulfillment, and ledger/wallet effects are server-owned. JOD money rules and PostgreSQL-backed uniqueness/concurrency coverage exist in the commerce tests and `MoneyPolicy`.
- Production deployment disables payment and payout providers. The safe unconfigured provider rejects checkout/transfer rather than substituting a fake provider.
- PayTabs calls use HTTPS base URL validation, server-key authorization, server-to-server query verification, transaction amount/currency/reference checks, timeouts, duplicate recovery, and explicit unknown states. `EnsureTestMode()` deliberately rejects Live mode in this release. Simulated tests do not establish real provider behavior.
- Full internal CourseCart refunds and provider recovery/reconciliation are implemented in the baseline. PayTabs partial provider execution is disabled; partial internal accounting is distinct. ASUS-08C2 remains NO-GO. No behavior was enabled or changed.
- Payout lifecycle/ledger foundations exist, but a production transfer provider and external settlement proof are absent. Launch consequence depends on whether teacher settlement is in the initial commercial promise (EX-03).

## Backup / Restore / Observability State

The repository contains a tested PostgreSQL 16 custom-format backup and isolated-restore drill from PR #111, including SHA-256 verification, EF migration-history verification, representative application/financial-state fingerprints, distinct source/target enforcement, and cleanup of disposable restore targets. ASUS-10E1B adds focused S3 logical recovery and encrypted PostgreSQL Data Protection key-ring tests using synthetic data, an ephemeral test-only PFX, the `BETCCO` application name, and a separate recovered PostgreSQL database containing the persisted encrypted key-ring rows. PR #117 is DONE / MERGED at `25c162a9b002f84e604eed310a73680294055a0e`; its final reviewed head `43ffaaf8687e9520b4441752526b3ac4ff2019a4` passed Quality, Full UAT Matrix, and Security analysis, with no unresolved review threads. These are repository-controlled checks only, not proof of a production provider backup or staging/production restore.

Repository-controlled P1-02 recovery evidence is VERIFIED for PostgreSQL (PR #111), private S3 logical-object recovery, and Data Protection encrypted key-ring/certificate recovery (PR #117). Data Protection recovery does not establish certificate rotation: only the configured certificate is registered, historical keys depend on retaining the original private key, and multi-certificate rotation is not implemented. P1-02 remains externally open for real production backup-provider configuration, production S3 versioning/replication/provider backups, production PFX/private-key custody and backup, staging/production restore exercises, approved RPO and RTO, backup frequency, retention, recovery owner, and cross-region recovery. PR #123 verifies the repository-controlled observability/runbook foundation, including stable operational EventIds and provider-neutral monitoring/incident-response contracts. Monitoring and alert ownership still remain externally open; no repository evidence shows that a real staging or production environment has delivered, acknowledged, and closed a critical operational alert. See P1-02, P1-03, P1-04 and EX-01/EX-05.

## CI / Release State

- `quality.yml` and `security.yml` use immutable action references. Current `main` branch protection requires Application Quality, Dependency Review, CodeQL (csharp), and CodeQL (javascript-typescript).
- PR #111 added `Verify PostgreSQL backup and isolated restore` to Application Quality; the recovery drill passed on its final merged head. PR #114's documentation-only reconciliation passed Quality, Security analysis, and Full UAT before merge. PR #117's final reviewed head passed Quality, Full UAT Matrix, and Security analysis before merge.
- `full-uat.yml` runs on pull requests to `main` or manual dispatch. It exercises browser flows with disposable infrastructure and does not constitute real production-provider or staging-environment evidence.
- PR #125 verifies the repository-controlled immutable release contract and removes application image rebuilding from secure deployment. No workflow currently publishes a real API/Web image pair to an approved registry or proves same-digest staging-to-production promotion. P1-04 therefore remains externally open.
- No OPEN/Draft PR existed at the 2026-09-28 reconciliation point. Repository-admin/provider alert evidence outside the GitHub checks described above remains external where applicable.

## Recommended ASUS Implementation Sequence

| Order | Workstream | Current status | Remaining goal | Model / thinking |
| --- | --- | --- | --- | --- |
| 1 | **ASUS-10B — Production Admin Bootstrap** | **DONE / MERGED — PR #106** | Repository P0-01 implementation closed; external operator secret handling remains deployment-owned. | Completed |
| 2 | **ASUS-10C — Production S3 HTTPS Guard** | **DONE / MERGED — PR #108** | Repository P1-05 implementation closed; external provider TLS availability remains provider-owned. | Completed |
| 3 | **ASUS-10D1 — Legacy Quiz Migration Preflight & Recovery Gate** | **DONE / MERGED — PR #109** | Repository migration-safety gate closed; data-owner retention/backup approval remains external. | Completed |
| 4 | **ASUS-10E1A — PostgreSQL Backup & Restore Recovery Drill** | **DONE / MERGED — PR #111** | Repository PostgreSQL restore path verified; no production-provider restore is claimed. | Completed |
| 5 | **ASUS-10E1B — S3 Object Recovery + Data Protection Certificate Recovery** | **DONE / MERGED — PR #117** | Repository-controlled private S3 logical-object and encrypted Data Protection key-ring/certificate recovery evidence is verified; external provider and production certificate custody remain open. Merge: `25c162a9b002f84e604eed310a73680294055a0e`. | Completed |
| 6 | **ASUS-10E2A — Operational Signals & Incident Runbooks** | **DONE / MERGED — PR #123** | Repository-controlled P1-03 observability/runbook foundation verified; external alert delivery/on-call evidence remains provider/operator work. Merge: `7201ae473eae507877d314fe8c06a71de418b7bf`. | Completed |
| 7 | **ASUS-10F1 — Immutable Release Artifact Contract** | **DONE / MERGED — PR #125** | Repository-controlled immutable deployment/release/rollback contract verified. Merge: `ee55375461a4da6481d3ba948c487c1053734527`. **10F2 remains BLOCKED / EXTERNAL-DEPENDENT** pending approved registry/deployment platform and real promotion evidence. | Completed |
| 8 | **ASUS-10G — Live Commerce Provider Readiness** | CONDITIONAL / EXTERNAL-HEAVY | Only if paid sales/payouts are in launch scope; preserve ASUS-08C2 NO-GO until provider evidence exists. | GPT-6 Sol / HIGH when finance/provider changes are required |

Before each implementation branch, refresh `origin/main`, all OPEN/Draft PRs, changed files, CI, and review threads. Do not infer completion from this sequence alone; merged code and current GitHub evidence remain authoritative.

## Deferred / Intentionally Disabled

- **AI/RAG engine, provider, embeddings, persistence:** deliberately deferred by product decision. The UI shell remains disabled; no production blocker was identified in that shell during this deployment audit.
- **PayTabs partial provider refund execution / ASUS-08C2:** remains NO-GO and disabled. This is intentional pending provider evidence, not a defect.
- **Live PayTabs and payout provider selection:** deployment Compose pins both disabled; live provider integration and external verification remain external work.
- **JoFotara, PDF reporting, demo data, and production AI:** deployment Compose pins these off; they require separate legal/provider/product review before enablement.

## Evidence Limitations

- Audit source is the clean repository checkout at `fcf1fd324f450c890cd7b45bf60b0f8a8eabce64`; no production database, secrets, deployment host, DNS, provider account, bank, SMTP, ClamAV, or S3 account was accessed.
- No secret values were printed. Tracked source and example templates were searched; the fresh clone cannot establish the contents or controls of an operator's external environment file/secret manager.
- At the original audit baseline, some authenticated GitHub settings endpoints were unavailable and returned `401`. During the 2026-09-28 reconciliation, authenticated repository evidence confirmed `main` is protected and requires Application Quality, Dependency Review, CodeQL (csharp), and CodeQL (javascript-typescript). External provider/security controls outside the repository remain unverified unless separately evidenced.
- The original audit itself did not run application tests. Subsequent implementation PRs #106, #108, #109, and #111 were independently gated by repository CI before merge; PR #111's final Application Quality included the PostgreSQL recovery drill. PR #114 documentation reconciliation passed Quality, Security analysis, and Full UAT. None of this is a substitute for real production-provider validation.
- Migration review searched the active migration chain for raw SQL/schema operations and inspected the legacy Quiz removal migration in detail. No migrations were executed.
- No generated application code, project tests, provider simulations, or UI behavior were changed or rerun.
