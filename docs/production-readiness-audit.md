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

## Executive Summary

| Classification | Count | Summary |
| --- | ---: | --- |
| P0 — Launch Blocker | 1 | No reachable, documented first-administrator bootstrap exists in the production deployment path. |
| P1 — Required Production Hardening | 5 | A merged migration drops legacy quiz records; restore evidence, operational alerts/runbooks, same-artifact promotion, and HTTPS enforcement for custom S3 endpoints are not established. |
| P2 — Post-launch Improvement | 3 | Production image inputs are mutable tags; .NET transitive restore is not locked; in-process rate limits are not shared across API replicas. |
| EXTERNAL | 5 | Live hosting/provider/legal/operational decisions and credentials cannot be verified from this repository. |
| SAFE | 15 | Important controls are implemented and/or demonstrated by current code and baseline CI. |

**Readiness conclusion:** the repository has a substantial deployment and security foundation, but the repository alone does not establish that an operator can provision the first production administrator, restore production data, monitor incidents, or promote a verified artifact. Paid checkout and payouts are intentionally disabled in the deployment Compose file. Resolve P0-01 and the P1 items before opening a real learner-facing production service. Whether disabled commerce is launch-blocking depends on the approved launch scope; it is not classified as a code defect.

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
| `BETCCO_S3_ENDPOINT` → `Storage__S3__Endpoint` | API object-store endpoint; non-secret | Optional; `.env.example` uses local HTTP for development and `deploy.env.example` uses an HTTPS placeholder | If set, `Program.cs` passes the value to `AmazonS3Config.ServiceURL`; Production validation checks neither URI scheme nor host. A configured HTTP endpoint is therefore accepted (P1-05). |
| `Storage:CleanupIntervalSeconds`, `Storage:StagingGraceMinutes` | API storage lifecycle; non-secret | `appsettings.json` defaults to 300 seconds and 15 minutes | Used by lifecycle worker for staged-object cleanup; not a production endpoint or credential. Documented as app defaults. |
| `BETCCO_S3_ACCESS_KEY` / `BETCCO_S3_SECRET_KEY` → `Storage__S3__AccessKey/SecretKey` | API object-store credentials; secret pair | Both or neither; either an explicit pair or provider credential chain | Validator rejects half-pairs; SDK uses configured credential chain if both omitted. Secret pair placeholders only in deployment example. Documented. |
| `BETCCO_CLAMAV_HOST` / `BETCCO_CLAMAV_PORT` | API-to-scanner endpoint; host non-secret | Host required; port optional, defaults to `3310`; scanner provider fixed `ClamAv` | Validator rejects missing host/invalid port or non-ClamAv provider. Runtime scan transport/protocol failure returns Unavailable and blocks upload. Documented. |
| `BETCCO_SMTP_HOST`, `PORT`, `FROM_ADDRESS`, `SMTP_USERNAME`, `SMTP_PASSWORD` | API email; host/from/port non-secret, credentials secret | Host/from/valid port required; port defaults to 587; TLS is fixed true; username/password optional but must be paired | Validator rejects missing host/from/port, SSL false, or half credentials. Send failures are surfaced to callers/outbox; many notification paths are best-effort. No Mailpit fallback in deployment Compose. Documented. |
| `BETCCO_WEB_PORT` / `BETCCO_SHUTDOWN_TIMEOUT_SECONDS` | Compose; non-secret | Optional defaults 3000 and 30 seconds; shutdown value clamped to 10–120 seconds | Web published on loopback only; invalid timeout is bounded by app. Documented. |
| `BETCCO_API_URL` build argument | Next.js server rewrite; non-secret | Deployment Docker build defaults to private Compose host `http://api:8080`; local `next.config.ts` fallback is `http://localhost:5085` | Server rewrite targets API; the localhost fallback is not selected by `frontend/Dockerfile`/Compose production build. Not a `NEXT_PUBLIC_*` secret. Documented in Compose/Dockerfile. |
| `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | Next.js public values; non-secret | Public canonical origin can be supplied for metadata/sitemap; analytics endpoint optional and remains consent-gated | Public exposure is intentional; no secret is named `NEXT_PUBLIC_*`. Deployment supplies `APP_PUBLIC_URL`; tracking remains disabled unless configured/consented. `.env.example` documents local values. |
| `Payments__Provider`, `PayTabs__ProfileId`, `PayTabs__ServerKey`, `PayTabs__BaseUrl`, `PayTabs__Environment` | Commerce/API; server key secret, others non-secret except possibly profile metadata | Deployment pins provider `Disabled`; enabling PayTabs requires positive profile, nonempty key, HTTPS base URL, explicit `Test` or `Live`; PayTabs adapter only accepts `Test` in current code | Missing PayTabs fields fail startup if provider selected. Safe unconfigured provider otherwise rejects checkout. No production live mode path; do not treat as launch-ready. Keys are blank in examples. Documented as disabled/deferred. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Development initializer; email non-secret, password secret | Optional pair with no defaults in `.env.example`; initializer forces password change | No production bootstrap behavior: production never invokes `DatabaseInitializer` (P0-01). No secret is logged. README documents the variables but not their Development-only scope. |
| `Payouts__Provider` and bank/e-wallet credentials | Commerce/API; credentials secret | Deployment pins `Disabled`; validator accepts only `Disabled` or `Manual` | Fake payout is not selected in Production; unconfigured provider refuses transfers. Real provider fields are intentionally not in deploy template. Documented as disabled/deferred. |
| JoFotara, AI, assessment PDF, demo data | API providers; optional credentials secret if separately enabled | Compose fixes JoFotara, AI, PDF, and demo data off | Each remains disabled unless a separately reviewed config path is added. Optional JoFotara/AI settings are validated when enabled; PDF licensing/fonts are validated when enabled. Documented. |
| Monitoring, metrics, tracing, backup schedules, object versioning, alert destinations | Operator/hosting; may contain secrets | No runtime config contract or real values in repository | Not silently configured by app. Provider/host proof required; see P1-02/P1-03 and EX-01. |

**Secret scan result:** no real credential value was found in the tracked example templates/source reviewed; local example values are labeled for development or are placeholders. `.gitignore` and `.dockerignore` exclude deployment env files and key/certificate material while retaining example templates. This says nothing about untracked operator files or the actual production secret store.

## P0 Launch Blockers

| ID | Area | Title | Confidence |
| --- | --- | --- | --- |
| P0-01 | Administrator bootstrap | Production has no reachable first-Admin provisioning path | HIGH |

### P0-01 — Production has no reachable first-Admin provisioning path

**Severity:** P0 — Launch Blocker
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
| P1-02 | Backup / restore | No repository or operator evidence of a tested restore path | HIGH (repository evidence); external state unknown |
| P1-03 | Observability / incident response | Health endpoints exist, but monitoring, alerting, and key incident procedures are not evidenced | HIGH (repository evidence) |
| P1-04 | Release promotion | The release process does not prove that one immutable artifact is promoted from staging to production | HIGH (repository evidence) |
| P1-05 | Storage / transport security | Custom production S3 endpoint accepts plain HTTP | HIGH |

### P1-01 — Legacy Quiz migration irreversibly removes quiz tables and dependent rules

**Severity:** P1 — Required Production Hardening
**Area:** Database migration safety
**Evidence:**

- `backend/src/Betcco.Infrastructure/Persistence/Migrations/20260924073104_RemoveLegacyQuizSystem.cs`, `Up()`: updates legacy Quiz lessons to archived/unpublished; deletes related `ContentPrerequisites` and `ContentAccessRules`; drops `QuestionBankQuestions`, `QuizAttemptQuestionGrades`, `QuizAttempts`, `QuizQuestions`, and `Quizzes`.
- The migration's comments explicitly preserve Lesson identities and lesson-linked learner history; the dropped quiz question/attempt tables are not preserved by those statements.
- `docs/DEPLOYMENT.md`, Database migration: migrations run through the explicit one-off `--migrate` container and the API replicas do not migrate at startup. This is a useful control, but the runbook does not call out the legacy quiz data deletion as a preflight item.

**Production scenario:** if an existing database contains legacy quiz authoring or attempt history when the one-off migration reaches this version, those tables and the listed access/prerequisite rows are deleted. This cannot be reversed by `Down()` because recreated tables are empty. The audit cannot determine whether any actual production database contains those records.

**Impact:** data integrity and historical learner evidence.

**Recommended remediation:** before applying this migration to any database that may contain legacy Quiz data, take and verify a restorable backup, inventory the affected rows, obtain an explicit product/data-retention decision, and export or retain the records if required. Keep the migration command gated on that preflight until the owner confirms that deletion is acceptable. No migration was executed during this audit.

**Suggested tests:** seed an old-schema database with quiz questions, attempts, grades, lessons, access rules, and prerequisites; apply the migration and assert the intended archive/delete behavior explicitly; verify the backup/export preserves the data required by the owner; test restore to an isolated database before production use.

**Dependencies:** owner decision on legacy quiz history and an external backup/restore service.
**Ownership:** shared (ASUS migration owner + data owner).

### P1-02 — No repository or operator evidence of a tested restore path

**Severity:** P1 — Required Production Hardening
**Area:** PostgreSQL / object backup
**Evidence:**

- `docs/DEPLOYMENT.md`, Persistent state and Intentionally deferred: PostgreSQL backup is owned by the selected external database service; backup schedules, RPO/RTO, restore drills, retention, and cross-region recovery remain owner decisions. The same document says the deployment is not production-ready until backup and restore have been tested.
- `compose.deploy.yml` contains no database or object-store backup job, retention policy, versioning policy, or restore mechanism. This is consistent with the runbook's external-service boundary and is not evidence that the selected host has no backups.
- No restore-test script or completed restore evidence was found in the repository.

**Production scenario:** database corruption, accidental deletion, account compromise, or provider/region loss occurs. If the selected PostgreSQL and S3 services have no tested independent backups, student submissions and finance records may be unrecoverable or recovery may exceed the required window. Current external configuration is unknown.

**Impact:** availability, financial integrity, privacy, and learner records.

**Recommended remediation:** choose and record RPO/RTO; configure encrypted, access-separated PostgreSQL backups and private object versioning/backup with retention and off-site separation; include the Data Protection certificate/key recovery dependency; conduct and retain a restore drill that restores both database and required objects into an isolated environment.

**Suggested tests:** scheduled restore exercise; verify row counts and financial ledger invariants; restore representative private objects and decrypt Data Protection-protected values using the documented certificate recovery path; record measured RPO/RTO and operator sign-off.

**Dependencies:** hosting/database/S3 vendors and operations owner.
**Ownership:** external/shared.

### P1-03 — Monitoring, alerting, and key incident procedures are not evidenced

**Severity:** P1 — Required Production Hardening
**Area:** Observability / operations
**Evidence:**

- `backend/src/Betcco.Api/Program.cs` exposes `/health/live` (process response) and `/health/ready` (PostgreSQL and S3 checks). ClamAV is correctly treated as an upload-path dependency rather than a liveness dependency.
- `docs/DEPLOYMENT.md` says SMTP is monitored separately, but no monitoring integration, alert definition, metric exporter, trace exporter, or operational alert receiver is configured in the repository.
- `docs/DEPLOYMENT.md` explicitly defers monitoring/alerting and does not provide operational procedures for database restore, storage loss, ClamAV outage, SMTP backlog, payment/refund `ProviderResultUnknown`, payout reconciliation, incident response, or administrator recovery.
- Audit records include request correlation context in the persistence model, but repository code alone does not show an operator consuming alerts or traces.

**Production scenario:** readiness turns unhealthy, email outbox begins retrying, uploads fail closed because ClamAV is unreachable, or a payment/refund remains in an unknown state; no evidenced alert or assigned response procedure ensures timely detection and resolution.

**Impact:** availability, finance, privacy, and operations. No particular vendor is required.

**Recommended remediation:** connect live health and application/worker signals to an owned monitor and alert channel; establish thresholds and runbooks for database/S3/readiness, SMTP outbox age/failure, scanner failure, repeated authentication abuse, payment/refund unknown states, payout settlement, restore, incidents, and admin recovery. Exercise alerts in staging.

**Suggested tests:** staging synthetic failure for each critical dependency; verify alerts reach the on-call owner, include a trace/correlation reference without sensitive payloads, and close through the documented runbook.

**Dependencies:** hosting/monitoring provider and operations owner.
**Ownership:** shared.

### P1-05 — Custom production S3 endpoint accepts plain HTTP

**Severity:** P1 — Required Production Hardening
**Area:** S3 configuration / transport security
**Evidence:**

- `backend/src/Betcco.Api/Program.cs`, S3 client registration: when `Storage:S3:Endpoint` is non-empty, its text is assigned to `AmazonS3Config.ServiceURL` without checking that it is an absolute HTTPS URI.
- `backend/src/Betcco.Api/Configuration/StartupConfigurationValidator.cs`, production storage checks: validates provider, bucket, region, paired credentials, and scanner, but does not validate `Storage:S3:Endpoint` scheme.
- `deploy.env.example` shows an HTTPS example endpoint, but example guidance does not enforce the runtime boundary.

**Production scenario:** an operator configures a custom `http://` S3-compatible endpoint in Production. Object contents and/or access-key authentication traffic could then traverse the API-to-storage network without TLS, depending on network topology. The default regional endpoint is not implicated when no custom endpoint is supplied.

**Impact:** confidentiality of private student files and storage credentials; integrity of object traffic.

**Recommended remediation:** when a custom Production/Staging endpoint is supplied, require an absolute HTTPS URI with a valid host. Allow HTTP only in Development/Testing. Document approved private endpoint use without relaxing transport protection.

**Suggested tests:** startup validator rejects `http://` custom S3 endpoints in both secure environments, accepts valid HTTPS endpoints, and preserves the provider-default behavior when endpoint is empty; include a deployment configuration test.

**Dependencies:** none for validation; external S3 provider must offer TLS.
**Ownership:** ASUS.

### P1-04 — Release process does not prove same-artifact staging-to-production promotion

**Severity:** P1 — Required Production Hardening
**Area:** Release / rollback
**Evidence:**

- `docs/DEPLOYMENT.md`, Build: operators build images from a Git commit and are told to build staging and production with the same reviewed commit.
- `compose.deploy.yml` has `build:` definitions for the API and web services and tags the resulting local images with `BETCCO_IMAGE_TAG`; the Compose file does not fetch a published artifact by digest or prove the tag equals the source SHA.
- `.github/workflows/quality.yml` builds images for CI verification but does not publish a release artifact. No staging deployment/promotion workflow was found.
- The rollback runbook depends on previously retained image tags, but no repository-backed registry/retention/provenance path is defined.

**Production scenario:** operators rebuild the same source commit separately in staging and production, or reuse a mutable image tag. Mutable base-image tags and build environment differences can produce different artifacts, so staging verification may not be evidence about the production image; rollback may also be unavailable if the prior image was not retained.

**Impact:** release integrity, reproducibility, and rollback availability.

**Recommended remediation:** publish one image pair per reviewed source SHA, record immutable digests and build provenance, promote those digests unchanged from staging to production, keep the prior digests available, and have the release record link commit, migration, smoke result, approval, and rollback target.

**Suggested tests:** assert deploy manifests use the same API/web digests in staging and production; reject mutable/non-SHA release references; prove prior digest remains pullable and rollback smoke succeeds after a failed staging/production deployment.

**Dependencies:** image registry and deployment platform.
**Ownership:** shared.

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

The deployment runbook covers secure environment files, controlled migrations, staging smoke, health verification, image rollback, and secret rotation. It explicitly leaves backup/restore, RPO/RTO, retention, cross-region recovery, and monitoring to the owner. There is no repository evidence that an actual staging or production environment has completed a backup restore, emitted an alert, or reconciled a real provider transaction. See P1-02, P1-03, P1-04 and EX-01/EX-05.

## CI / Release State

- `quality.yml` and `security.yml` use immutable action references. The baseline commit check-runs show Application quality and both CodeQL jobs successful; Dependency Review is skipped for the merge commit because it runs only for pull requests.
- `full-uat.yml` runs on pull requests to `main` or manual dispatch, not every push. It exercises browser flows with disposable PostgreSQL/Mailpit and development API configuration; it is not a real staging or provider smoke.
- No workflow in the inspected repository publishes and promotes production images. The deployment guide describes building from the same source commit per environment, but does not record one verified image digest promoted unchanged.
- No active PR existed to inspect for reserved scope, review threads, or in-progress implementation overlap.
- The authenticated live repository configuration and open alert state remain unknown (EX-05).

## Recommended ASUS Implementation Sequence

| Order | Proposed workstream | Priority | Goal / affected modules | Why separate | Schema impact | External dependency | Overlap risk | Model / thinking | Complexity |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **ASUS-10B — Production Admin Bootstrap** | P0 | Add an explicit one-time production Admin bootstrap/provisioning path; `Program.cs`, `DatabaseInitializer` or dedicated operation, deployment docs, auth/MFA tests. | Blocks initial production administration and is a small isolated security boundary. | None expected. | Secret-store/operator flow. | Authentication and AdminUsers; coordinate before edits, though no open PR currently exists. | GPT-6 high | MEDIUM |
| 2 | **ASUS-10C — Production Storage and Configuration Guards** | P1 | Enforce HTTPS for custom S3 endpoints and test production config boundaries; `StartupConfigurationValidator`, startup config tests, deploy documentation. | Small, isolated fail-closed config change that protects private objects and credentials before external staging setup. | None. | S3 endpoint must support TLS. | Shared API configuration; coordinate with other backend work. | GPT-6 high | SMALL |
| 3 | **ASUS-10D — Legacy Data Migration and Recovery Gate** | P1 | Document/implement preflight and backup/export for `20260924073104_RemoveLegacyQuizSystem`; add restore drill and migration evidence. | Data-retention decision and recovery process must precede running this destructive migration on databases with old quiz data. | No new schema required for the operational gate; any preservation migration requires explicit owner decision. | PostgreSQL/S3 backup service and data owner. | Migrations/ModelSnapshot and shared release files; coordinate before edits. | GPT-6 high | MEDIUM |
| 4 | **ASUS-10E — Production Backup, Restore, Monitoring, and Incident Runbooks** | P1 | Choose RPO/RTO; implement database/object recovery evidence, dependency/worker/payment alerts, and procedures. | Operationally owned and provider-specific; can progress independently of application bootstrap. | None expected. | Hosting, storage, monitoring vendors/on-call owner. | Deployment docs/infra scripts; check active reservation before work. | GPT-6 high | LARGE |
| 5 | **ASUS-10F — Immutable Release Promotion** | P1 | Publish image digests/provenance and promote the same API/web artifacts from staging to production; link approval, migration, smoke, rollback. | Release artifact chain is separate from runtime hardening and depends on registry/hosting decisions. | None. | CI registry/deployment platform. | Workflows and deployment files; coordinate with any CI workstream. | GPT-6 high | MEDIUM |
| 6 | **ASUS-10G — Live Commerce Provider Readiness** | EXTERNAL / conditional | Only if paid sales or teacher payouts are in launch scope: separately validate live PayTabs and payout adapter, contracts, reconciliation, and settlement. | Provider credentials/contracts and real sandbox/live behavior cannot be established by simulated CI. | No schema assumption; assess against current commerce contract. | PayTabs, bank/e-wallet, legal/accounting. | High overlap with Commerce/refund files; preserve ASUS-08C2 NO-GO and disabled partial execution. | GPT-6 high | LARGE |

The first implementation slice should be ASUS-10B after independent review of this audit. Do not begin it in this audit branch. Before each implementation branch, refresh `origin/main`, open/Draft PRs, CI, and review threads.

## Deferred / Intentionally Disabled

- **AI/RAG engine, provider, embeddings, persistence:** deliberately deferred by product decision. The UI shell remains disabled; no production blocker was identified in that shell during this deployment audit.
- **PayTabs partial provider refund execution / ASUS-08C2:** remains NO-GO and disabled. This is intentional pending provider evidence, not a defect.
- **Live PayTabs and payout provider selection:** deployment Compose pins both disabled; live provider integration and external verification remain external work.
- **JoFotara, PDF reporting, demo data, and production AI:** deployment Compose pins these off; they require separate legal/provider/product review before enablement.

## Evidence Limitations

- Audit source is the clean repository checkout at `fcf1fd324f450c890cd7b45bf60b0f8a8eabce64`; no production database, secrets, deployment host, DNS, provider account, bank, SMTP, ClamAV, or S3 account was accessed.
- No secret values were printed. Tracked source and example templates were searched; the fresh clone cannot establish the contents or controls of an operator's external environment file/secret manager.
- Open PRs were checked live via GitHub REST and there were none. Branch protection, Code Scanning alerts, and Secret Scanning alerts endpoints required authentication and returned `401`; historical status-document evidence is dated and not treated as current proof.
- CI check-runs on the exact baseline merge commit reported Application quality and both CodeQL jobs successful, Dependency Review skipped. The baseline check-run list did not include Full UAT on that merge SHA. No application tests were run as part of this docs-only audit.
- Migration review searched the active migration chain for raw SQL/schema operations and inspected the legacy Quiz removal migration in detail. No migrations were executed.
- No generated application code, project tests, provider simulations, or UI behavior were changed or rerun.
