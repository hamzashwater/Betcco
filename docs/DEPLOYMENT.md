# BETCCO staging and production deployment foundation

This runbook defines the provider-neutral application deployment contract. It does not provision cloud services or enable live payments, payouts, PDF generation, AI, monitoring, or backups.

## Topology

```text
Internet
  |
HTTPS edge / reverse proxy
  |
Next.js web container (127.0.0.1:3000)
  |
ASP.NET Core API container (private Compose network)
  |-- external PostgreSQL
  |-- external private S3-compatible storage
  |-- external SMTP service
  `-- private ClamAV service
```

The HTTPS edge is owned by the deployment platform. It forwards requests to the loopback-bound web container and supplies `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host`. Next.js forwards `/api` and `/hubs` to the API over the private Compose network. The API accepts forwarded headers only from the web container's fixed private address.

The trusted-proxy list and one-hop forwarding limit follow the [ASP.NET Core proxy and load-balancer guidance](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/proxy-load-balancer?view=aspnetcore-10.0). Do not clear the known-proxy restrictions.

PostgreSQL, S3, SMTP, and ClamAV are external dependencies. This repository does not select or provision their vendors. Application containers are disposable and run read-only as non-root users with all Linux capabilities dropped.

## Prerequisites

- A Linux container host with Docker Engine and Docker Compose v2.
- An HTTPS edge or reverse proxy that can reach `127.0.0.1:3000`.
- A dedicated staging or production PostgreSQL database.
- A private S3-compatible bucket that already exists and denies anonymous access.
- A private ClamAV TCP endpoint.
- An SMTP endpoint with TLS.
- A password-protected PFX certificate for encrypting shared ASP.NET Core Data Protection keys.
- An immutable release identifier, normally the Git commit SHA.

Do not reuse production credentials, databases, buckets, certificates, or SMTP accounts in staging.

## Configuration contract

Copy `deploy.env.example` to a secure location outside the repository. Restrict its filesystem permissions and replace every placeholder. Never commit the resulting file.

| Variable                                      | Classification      | Purpose                                                                            |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `BETCCO_ENVIRONMENT`                          | REQUIRED NON-SECRET | Exactly `Staging` or `Production`. Both use fail-closed deployment validation.     |
| `BETCCO_API_IMAGE`                            | REQUIRED NON-SECRET | Full immutable API OCI reference ending in `@sha256:<64 hex>`.                      |
| `BETCCO_WEB_IMAGE`                            | REQUIRED NON-SECRET | Full immutable web OCI reference ending in `@sha256:<64 hex>`.                     |
| `BETCCO_PUBLIC_APP_URL`                       | REQUIRED NON-SECRET | Public HTTPS origin, without a path, query, or fragment.                           |
| `BETCCO_ALLOWED_HOSTS`                        | REQUIRED NON-SECRET | Semicolon-separated public host names; wildcards are rejected.                     |
| `BETCCO_POSTGRES_CONNECTION_STRING`           | REQUIRED SECRET     | Dedicated database connection string.                                              |
| `BETCCO_DATA_PROTECTION_CERTIFICATE_PATH`     | REQUIRED NON-SECRET | Absolute host path to the PFX mounted read-only into the API.                      |
| `BETCCO_DATA_PROTECTION_CERTIFICATE_PASSWORD` | REQUIRED SECRET     | PFX password.                                                                      |
| `BETCCO_S3_BUCKET`                            | REQUIRED NON-SECRET | Existing private bucket. The application never creates it in staging/production.   |
| `BETCCO_S3_ENDPOINT`                          | OPTIONAL            | S3-compatible endpoint. Leave empty for the SDK's regional endpoint.               |
| `BETCCO_S3_REGION`                            | REQUIRED NON-SECRET | Storage region identifier.                                                         |
| `BETCCO_S3_FORCE_PATH_STYLE`                  | OPTIONAL            | Defaults to `false`; use only when required by the selected S3 service.            |
| `BETCCO_S3_ACCESS_KEY`                        | CONDITIONAL SECRET  | Required with `BETCCO_S3_SECRET_KEY` unless the provider credential chain is used. |
| `BETCCO_S3_SECRET_KEY`                        | CONDITIONAL SECRET  | Required with `BETCCO_S3_ACCESS_KEY`; the pair is validated.                       |
| `BETCCO_CLAMAV_HOST`                          | REQUIRED NON-SECRET | Private ClamAV host reachable by the API.                                          |
| `BETCCO_CLAMAV_PORT`                          | OPTIONAL            | Defaults to `3310`.                                                                |
| `BETCCO_SMTP_HOST`                            | REQUIRED NON-SECRET | SMTP host.                                                                         |
| `BETCCO_SMTP_PORT`                            | OPTIONAL            | Defaults to `587`.                                                                 |
| `BETCCO_SMTP_FROM_ADDRESS`                    | REQUIRED NON-SECRET | Reviewed sender address.                                                           |
| `BETCCO_SMTP_USERNAME`                        | CONDITIONAL SECRET  | Set together with `BETCCO_SMTP_PASSWORD` when authentication is required.          |
| `BETCCO_SMTP_PASSWORD`                        | CONDITIONAL SECRET  | Set together with `BETCCO_SMTP_USERNAME`.                                          |
| `BETCCO_WEB_PORT`                             | OPTIONAL            | Loopback port exposed to the HTTPS edge; defaults to `3000`.                       |
| `BETCCO_SHUTDOWN_TIMEOUT_SECONDS`             | OPTIONAL            | Graceful shutdown budget from 10 to 120 seconds; defaults to `30`.                 |

`Payments__Provider`, `Payouts__Provider`, JoFotara, AI, demo data, and PDF reporting are fixed to disabled values in `compose.deploy.yml`. Live PayTabs and payout execution require separate reviewed changes.

Development continues to use `.env` and `docker-compose.yml`. CI/Test uses disposable credentials in GitHub Actions. Staging and Production use `compose.deploy.yml` and a secret environment file outside Git.

When `BETCCO_S3_ENDPOINT` is set in Staging or Production, it must be an absolute HTTPS URL with a valid host and no embedded credentials; endpoint paths are allowed. Leave it empty when using the AWS SDK's regional endpoint. Local HTTP MinIO endpoints are for Development/Testing only. Production object-storage credentials and objects must never travel over plaintext HTTP.

## Immutable release artifact contract

`compose.deploy.yml` consumes prebuilt API and web images. It has no application `build:` entries: a staging or production deployment cannot rebuild either application image. `migrate` uses the exact `BETCCO_API_IMAGE` reference used by `api`.

The release sequence is **build once → publish externally → record immutable digests → deploy those exact digests to staging → verify staging → promote the same digests to production**. This repository does not select a registry or publish images. Registry credentials and the publication/promotion process remain external secrets and operator or platform responsibilities. Ordinary PR Quality may build local test images; those builds do not publish artifacts and do not establish registry digests.

Production API and web Dockerfiles retain readable upstream version tags and pin each external base to its resolved OCI SHA-256 manifest/index digest. The digest is the immutable build input; the tag records the intended version. Digest changes require a reviewed PR, and each update must rebuild both production images and rerun full CI. This repository pinning does not prove external registry publication or promotion under P1-04/10F2.

Each release record follows [the release manifest schema](release-manifest.schema.json). It links a full 40-character source commit SHA to API, web, and migration image references, identifies the previous known-good API/web references for rollback, and has fields for staging verification and production approval/result evidence. Leave results as `not-run` or `not-promoted` with null evidence until the corresponding external action has actually happened. A manifest or green CI run alone is not evidence of registry publication, staging deployment, production approval, or promotion.

The repository-controlled immutable release contract is validated by CI. **Repository contract verified; external registry publication and staging-to-production promotion evidence remain open.** Do not mark P1-04 fully closed based on this contract alone.

### Assessment PDF reporting

Assessment PDF reporting remains an explicit deployment opt-in. Before enabling it, confirm the applicable QuestPDF license tier and deploy an Arabic-capable TrueType or OpenType font with the API image or as a read-only mount. Configure all four values together:

```text
AssessmentReports__PdfProvider=QuestPdf
AssessmentReports__QuestPdfLicense=Community|Professional|Enterprise
AssessmentReports__FontDirectory=/absolute/path/to/deployed/fonts
AssessmentReports__FontFamily=<exact registered family name>
```

The API disables the renderer when the provider, license, directory, font files, or configured family is unavailable. Startup probes the configured family with English and Arabic text while environment-font discovery is disabled, so a host-installed fallback cannot make one deployment behave differently from another. The download endpoint remains restricted to the Lead Internal Verifier policy and records a successful-export audit only after PDF generation succeeds.

`compose.deploy.yml` deliberately pins the provider to `Disabled` and does not mount a font directory. Enabling reports in staging or production therefore requires a separate reviewed deployment change that supplies the font files and these settings; do not place licensed font binaries or secret deployment configuration in source control without an explicit distribution review.

## Build

From the exact reviewed Git commit:

```bash
docker compose --env-file /secure/path/betcco.env -f compose.deploy.yml build
```

The API and frontend images are multi-stage production images. The frontend uses Next.js standalone output and targets the private API service name. Build staging and production with the same reviewed commit; keep environment secret files separate.

Backend projects enable NuGet lock files through `backend/Directory.Build.props`. CI restores `backend/Betcco.sln` in locked mode, and the production API Dockerfile copies the API project's referenced project files and lock files before running its cached locked restore. To intentionally change a direct package dependency, update its `PackageReference` version in the owning `.csproj`, run `dotnet restore backend/Betcco.sln` to regenerate the backend lock files, review the complete lock-file diff for expected transitive changes, then verify with locked restore, formatting, Release build, and backend tests. Submit the project-file and matching lock-file changes together in the same reviewed PR. `dotnet tool restore` remains a separate operation using the repository's `dotnet-tools.json`; it does not update application package lock files.

Before operating on an existing database, take and verify a restorable PostgreSQL backup according to the deployment owner's recovery plan. Review the immutable API and web image identifiers before continuing.

## Database migration

Migrations are an explicit one-off operation. Application replicas never apply migrations during normal staging or production startup.

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml --profile operations run --rm migrate
```

The migration container uses the same immutable API image, applies the committed EF Core migrations, and exits. A migration exception produces a non-zero exit code. Do not start or update application containers when this command fails.

## Legacy Quiz removal preflight

Migration `20260924073104_RemoveLegacyQuizSystem` archives and unpublishes legacy Quiz lessons, deletes Quiz-linked prerequisite and access rules, and drops `Quizzes`, `QuizQuestions`, `QuizAttempts`, `QuizAttemptQuestionGrades`, and `QuestionBankQuestions`. `Down()` recreates empty tables; it does not restore records.

Before a deployment migration on a database that may predate this migration, run the read-only preflight against the same database:

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml --profile operations run --rm migrate --migration-preflight
```

The preflight prints aggregate row counts only: counts in the five dropped tables, plus prerequisite and access-rule rows that the migration deletes. It does not print question text, answers, student/teacher identifiers, feedback, or connection details.

- `LEGACY_QUIZ_MIGRATION_ALREADY_APPLIED`: the removal migration is recorded as applied. The preflight does not query the removed tables.
- `LEGACY_QUIZ_MIGRATION_CLEAR`: the migration is pending and no counted legacy rows exist, or this is an empty fresh database. Normal `--migrate` may proceed without an override.
- `LEGACY_QUIZ_DATA_REQUIRES_REVIEW`: counted data would be deleted. A normal `--migrate` exits non-zero before changing the schema, records, or migration history.
- `LEGACY_QUIZ_PREFLIGHT_INDETERMINATE`: the database is unreachable, the migration state is inconsistent, or required historical tables are missing. The operation fails closed; an override cannot bypass this result.

The normal migration command performs this same inventory under a PostgreSQL advisory lock held from preflight through EF migration execution. When legacy rows exist, deletion requires an explicit, per-run owner acknowledgement:

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml --profile operations run --rm migrate \
  --migrate --allow-legacy-quiz-data-removal
```

Use that override only after the data owner has decided that removal is acceptable and operators have: (1) taken a database backup or snapshot, (2) verified access to it, (3) documented the retention/export decision for legacy Quiz records, and (4) preferably completed a restore drill in an isolated PostgreSQL database. The flag records an explicit destructive-operation acknowledgement; it does not verify or prove that any backup, export, retention decision, or restore drill exists. The advisory lock serializes this application's preflight/migration commands; do not run a separate migration tool concurrently.

Prefer the hosting platform's database snapshot or a standard full-database `pg_dump` custom-format archive for recovery. Run the dump through the approved secret-manager/client configuration, keep it outside the repository with restricted access, and verify that it can be restored into an isolated database before relying on it. A targeted `pg_dump --table` archive can be useful for operator-selected preservation, but PostgreSQL documents that table selection does not include other database objects on which those tables may depend; do not treat a targeted archive as independently restorable until the dependency set and restore have been verified ([PostgreSQL 16 `pg_dump` documentation](https://www.postgresql.org/docs/16/app-pgdump.html)). This repository does not provide or verify any provider backup. `Down()` is not a recovery method because it recreates schema without the dropped records.

## First administrator bootstrap

On a new migrated database with no Admin, supply `BootstrapAdmin__Email` and `BootstrapAdmin__Password` as temporary operator environment variables from the secret manager. Both are required by `--bootstrap-admin` and have no defaults. Do not use the Development-only `SEED_ADMIN_*` variables. Do not put the bootstrap password in the Compose file, the persistent deployment environment file, shell history, or a command argument. Ensure the temporary password meets the Identity policy: at least 12 characters with an uppercase and non-alphanumeric character. The operator must arrange for access to the configured SMTP service for the required password-reset step.

After exporting the two values into the operator shell through the approved secret-manager workflow, run the reviewed API image once:

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml --profile operations run --rm --no-deps \
  -e BootstrapAdmin__Email -e BootstrapAdmin__Password \
  migrate --bootstrap-admin
```

Unset both temporary variables immediately after the command. Restrict access to the operator shell and container runtime while they are present. The command checks for pending migrations, creates only the Admin, Student, Teacher, and SupportAdmin Identity roles needed by current registration/staff provisioning paths, creates one confirmed Admin with `MustChangePassword`, records a system-originated audit event, and exits without starting HTTP. It creates no catalogue or demonstration data. A replay prints `ADMIN_BOOTSTRAP_ALREADY_COMPLETED` and changes nothing. An existing non-Admin with the supplied email causes `ADMIN_BOOTSTRAP_EMAIL_ALREADY_IN_USE`; resolve that account conflict manually without elevating it through this command.

For a database that already has an Admin, skip this operation. `--migrate` and normal API startup never bootstrap an Admin. After startup, the initial Admin must use the existing password-reset flow, sign in, enroll staff MFA, save recovery codes, and verify authorised Admin access. No privileged endpoint should be usable before MFA enrollment.

## Deploy

Build the API and web images from one reviewed source commit and publish them through the separately approved registry workflow. Record the registry's full digest references in the release manifest. The same API and web digests must be used for staging and production; do not rebuild between environments. For staging, set `BETCCO_API_IMAGE` and `BETCCO_WEB_IMAGE` to those full references in the protected deployment environment, then validate the staging release and attach a safe evidence reference to its manifest record.

Before running Compose, run `.github/scripts/validate_release_images.py` from a repository checkout using the `apiImage`, `webImage`, and `sourceCommit` values from that release manifest; pass `apiImage` for both `--api-image` and `--migration-image`. This fails closed on a mutable image reference, a migration/API mismatch, or a malformed source SHA. When both staging and production manifests exist, also pass them with `--staging-manifest` and `--production-manifest` to verify that same-release API/web digests match.

After the staging release is verified and any required production approval is recorded, use the exact same API and web digest references in the production deployment environment. Keep runtime configuration such as URLs and secrets environment-specific. After migration and, for a new installation, first Admin bootstrap succeed, start the application services:

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml up -d --no-build api web
```

Only the web port is published, and it is bound to loopback. Configure the HTTPS edge to forward the public host to that port. Do not publish the API container directly to the Internet.

## Health verification

The API exposes two generic endpoints without internal diagnostics:

- `/health/live` confirms that the process can answer HTTP.
- `/health/ready` confirms PostgreSQL connectivity and availability of the configured private S3 bucket.

The API container health check uses readiness. S3 is also checked during API startup. ClamAV failure blocks the affected upload operation rather than taking unrelated learning routes offline. SMTP delivery is durable through the registration outbox and has application-level operational signals separate from request readiness. This repository does not configure an external monitor, alert receiver, or on-call route; see [the provider-neutral monitoring contract](operations/monitoring-alerts.md) and [incident runbooks](operations/incident-response.md).

After deploying a release to staging, operators should exercise the configured alert route with controlled synthetic failures and record delivery, acknowledgement, recovery and runbook outcome. Do not configure a monitoring vendor through this repository slice. Alert payloads must use bounded event fields and correlation IDs only; never forward credentials, tokens, cookies, connection strings, private uploads, raw provider payloads, or unnecessary personal data. Staging exercises and actual alert delivery are external evidence, not repository verification.

Verify the private API and public web process:

```bash
docker compose --env-file /secure/path/betcco.env -f compose.deploy.yml exec api \
  curl --fail --silent http://127.0.0.1:8080/health/live
curl --fail --silent https://staging.example.com/ar
```

Then run a staging smoke test for sign-in, one authorised private-file read, one scanner-protected upload, and one queued email. Do not use live payment credentials for staging smoke tests.

## Rollback

1. Select the previous known-good release record and use its exact `previousRelease.apiImage` and `previousRelease.webImage` digest-pinned references.
2. Stop traffic or enable the deployment platform's maintenance mode.
3. Confirm that the database changes are backward-compatible with the previous application version.
4. Set `BETCCO_API_IMAGE` and `BETCCO_WEB_IMAGE` to those exact previous references. The migration service continues to use the same API image as the API service.
5. Run `docker compose ... up -d --no-build api web`.
6. Verify liveness, readiness, and the public smoke route before restoring traffic.

Image rollback does not automatically roll back database schema. Do not run an automatic schema downgrade. If a migration is not backward-compatible, stop and use an owner-approved recovery plan.

## Persistent state

- PostgreSQL data is owned and backed up by the selected database service.
- Data Protection key records are stored in PostgreSQL and encrypted with the mounted PFX certificate.
- Private objects are stored in the external S3-compatible bucket.
- No durable state is kept inside the API or web containers.
- Replacing an application container must not replace the database, bucket, or Data Protection certificate.

Production RPO/RTO, backup schedule, retention, encryption/access separation, and provider restore evidence remain owner decisions. The repository-tested synthetic PostgreSQL recovery drill does not make production ready. A deployment is not production-ready until the production provider path and restore have been tested.

## PostgreSQL backup and restore drill

### Repository-tested procedure

BETCCO includes Bash-based PostgreSQL-native custom-format backup and restore tools, using GNU core utilities. Both scripts require PostgreSQL 16 client tools, matching the repository's PostgreSQL 16 / pgvector baseline. They fail closed when `pg_dump` or `pg_restore` reports a different major version.

Set `PGHOST`, `PGPORT`, `PGUSER`, and `PGDATABASE` explicitly for a disposable or approved non-production source database. Supply credentials through `PGPASSFILE` or a short-lived `PGPASSWORD` process environment populated by the approved secret manager; do not put a password in shell history or a command argument. For example, after those variables have been securely exported:

```bash
scripts/backup-postgres.sh /secure/backup-location/betcco-2026-09-28.dump
```

The command writes a PostgreSQL custom archive, a `.sha256` sidecar, and a `.metadata.json` sidecar containing only the UTC creation time, PostgreSQL client version, file name, byte size, and SHA-256. Output files are created with owner-only permissions. The default repository-local location `artifacts/recovery/` is ignored by Git; never commit or upload production dumps to CI artifacts.

The automated restore helper is intended for the synthetic recovery fixture used by CI. It requires a source database distinct from a new target named `betcco_restore_<safe-suffix>`, refuses an existing target, validates the checksum before creating the target, restores with `pg_restore`, checks synthetic identity/catalogue/enrollment/evaluation rows, verifies the latest EF migration, and checks that the synthetic JOD ledger debit and credit totals both equal 25.00. It drops only the target it created, including on failure. Run it only against a disposable PostgreSQL 16 instance:

```bash
scripts/test-postgres-restore.sh betcco_recovery_source betcco_restore_operator /secure/backup-location/betcco-recovery.dump
```

The source database used here must already contain the synthetic recovery fixture in `scripts/postgres-recovery-seed.sql`; CI applies that fixture after migrations. The helper rejects obvious production/staging source names. A separate environment for a production/staging recovery exercise must be provisioned and authorized by its operator; restore the provider backup only into a distinct isolated target and record the exercise below. Do not use the production database as either the restore target or CI source.

The repository verification checks a repository-defined latest migration identifier and proves the restored history matches the source fingerprint. CI first applies the complete migration assembly to an empty database, so a passing drill verifies that migrated source state was carried into the restore without applying migrations during restore.

### Operator restore test

For a provider backup outside the synthetic CI fixture, provision a disposable PostgreSQL 16 instance and an isolated target database with a generated `betcco_restore_...` name. Use the approved credentials through `PGPASSFILE` or a short-lived process environment. Verify the archive checksum before restoring:

```bash
cd /secure/backup-location
sha256sum --check betcco-2026-09-28.dump.sha256
createdb betcco_restore_operator
pg_restore --exit-on-error --no-owner --no-privileges \
  --dbname=betcco_restore_operator \
  betcco-2026-09-28.dump
```

Then check `__EFMigrationsHistory`, database connectivity, agreed application row/state invariants, and the applicable financial balancing invariant. Capture the results in `docs/operations/restore-drill-record.md`. The restore target must remain separate from the source and production; remove only the disposable target after the evidence is recorded.

### Production provider boundary

The repository proves only that its PostgreSQL custom-format procedure can restore the synthetic, migrated BETCCO database in CI. It does not configure or verify production-host backup scheduling, provider snapshots, encryption, access separation, retention, restore completion, or recovery time. Production backups contain sensitive learner, identity, and financial data: production backup storage must be encrypted at rest and access-restricted separately from the database credentials. Provider, location, retention, and operator ownership must be selected and evidenced externally.

These procedures do not prove that a production provider backs up or restores private S3 objects or the Data Protection certificate. Repository-controlled logical recovery checks for both paths are described below; external provider and certificate-custody evidence remains operator-owned.

## Private S3 object recovery

### Repository-tested logical recovery

The Application Quality workflow runs `S3PrivateObjectRecoveryTests` against the pinned MinIO/`mc` image built from `infra/minio/Dockerfile`, using isolated, randomly named source, recovery-copy, restore, and negative-path buckets. Synthetic objects cover different byte sizes, content types, nested server-owned `objects/YYYY/MM/<guid>` keys, and user metadata. The test records a JSON manifest containing only object keys, byte sizes, SHA-256 digests, content types, and the applicable BETCCO metadata, then verifies the manifest and restored bytes through the S3-compatible API. A manifest SHA-256 detects accidental change; it does not authenticate the manifest or prove who created it.

The recovery target must be a newly provisioned private bucket that is different from both source and recovery-copy buckets. Refuse an existing target containing any objects. Copy only finalized `objects/` keys and use a recovery manifest to compare the expected exact key set, count, content length, content type, required metadata, and SHA-256 after restoration. Keep the source untouched and verify anonymous bucket and object requests remain denied. The repository test also checks equal source/target rejection, non-empty target rejection, missing source, corrupted/incomplete manifests, and cleanup of only drill-created buckets.

`staging/` keys are transient upload state. The durable business recovery set consists of finalized `objects/` keys referenced by persisted application records. Do not promote stale staging keys into finalized objects. If a separate operational requirement calls for staging recovery, copy that prefix separately and retain its staging status.

The repository proves a logical private-object copy/restore procedure, S3-compatible API behavior, and synthetic fingerprint/private-access verification only. It does not prove that a real production provider has bucket versioning, snapshots, cross-region replication, object lock, retention, backup-account separation, provider-side encryption, or an already completed provider restore. Do not enable versioning or assert provider settings based on this CI check. Use the provider's documented backup/export facility and restore to an isolated private target; retain the source bucket unchanged until application-level verification is complete.

## Data Protection key-ring and certificate recovery

PostgreSQL stores the Data Protection key-ring XML, and BETCCO encrypts the persisted keys with the configured X.509 certificate. The PFX/private key and its password are separate critical recovery assets. Restoring PostgreSQL without the corresponding certificate/private key may leave existing protected payloads, such as authentication tokens, unreadable. Keep the PFX and password in approved external secret/backup systems with restricted access and an operational/geographic failure boundary separate from the application host as appropriate. Never commit a PFX, private key, or password to Git.

After recovering a certificate, supply its password to the verification script through the approved secret mechanism as `BETCCO_DATA_PROTECTION_CERT_PASSWORD`; do not place the password in a command argument or shell history. Run:

```powershell
./scripts/verify-data-protection-certificate.ps1 -CertificatePath /secure/recovery/data-protection.pfx
```

The script reports the certificate SHA-256 fingerprint, thumbprint, subject, validity dates, and private-key availability without exporting or displaying private-key bytes or the password. Compare the safe identifiers and validity against the separately recorded certificate inventory before deploying it. Restrict access to the terminal and clear the temporary password environment value after verification.

The CI recovery test creates short-lived test-only PFX files and random passwords under runner temporary storage, then removes them. It exercises the production registration helper with PostgreSQL key persistence, certificate protection, and application name `BETCCO`; a newly constructed service provider using the same database and certificate must unprotect the synthetic payload, while a different certificate fails. A missing certificate path/password fails the production startup validator. This proves the repository recovery dependency only; it is not evidence that a production PFX backup exists or can be accessed.

### Certificate rotation is separate

Recovery reuses the original certificate that encrypted the key-ring entries. The current application registers `ProtectKeysWithCertificate` for the configured certificate and does not register older certificates through `UnprotectKeysWithAnyCertificate`. Replacing it with a new certificate alone therefore does not establish that historical key-ring entries remain decryptable. Preserve the old private key for as long as its key-ring entries may be needed. A safe rotation procedure requires explicit review and a separate cryptographic change; no multi-certificate rotation support is claimed here.

## Combined recovery evidence

BETCCO recovery depends on the PostgreSQL backup/restore procedure above, finalized private S3 object recovery, and the Data Protection certificate/private key needed for the restored key ring. External secrets/configuration and real provider restore evidence are additional operator responsibilities. Repository CI evidence does not establish production disaster recovery, backup frequency, retention, recovery ownership, RPO, or RTO. Record a real exercise in `docs/operations/restore-drill-record.md` without storing credentials, PFX bytes, object content, or private records.

### Recovery decisions

| Decision | Approved value |
| --- | --- |
| Approved RPO | NOT YET SET |
| Approved RTO | NOT YET SET |
| Backup retention | NOT YET SET |
| Backup frequency | NOT YET SET |
| Recovery owner | NOT YET SET |

## Secret rotation

Rotate one integration at a time. Update the deployment platform's secret store or protected environment file, recreate only the affected containers, and verify health and the directly affected operation. Preserve the previous Data Protection certificate while keys encrypted with it may still be required; certificate rotation needs an explicit key migration/retention plan.

Never place secret values in image build arguments, Compose files, application settings committed to Git, logs, issue comments, or Pull Request descriptions.

## Intentionally deferred

- Production provider backup configuration, scheduling, retention, and restore drills.
- Monitoring and alerting vendor integration.
- Live PayTabs and payout providers.
- Live SMTP, S3, and ClamAV provider validation.
- QuestPDF production enablement.
- Production hosting vendor, domain, certificate ownership, and DNS decisions.
- Full UAT, capacity testing, launch hardening, and final legal review.

No repository document explicitly defines a phase named `Phase 5B`. The closest existing roadmap item is `P1 storage and operations`; this foundation implements only its deployment/runbook portion.
