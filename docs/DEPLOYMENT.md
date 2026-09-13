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
| `BETCCO_IMAGE_TAG`                            | REQUIRED NON-SECRET | Immutable image/release identifier such as the Git SHA.                            |
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

## Build

From the exact reviewed Git commit:

```bash
docker compose --env-file /secure/path/betcco.env -f compose.deploy.yml build
```

The API and frontend images are multi-stage production images. The frontend uses Next.js standalone output and targets the private API service name. Build staging and production with the same reviewed commit; keep environment secret files separate.

## Database migration

Migrations are an explicit one-off operation. Application replicas never apply migrations during normal staging or production startup.

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml --profile operations run --rm migrate
```

The migration container uses the same immutable API image, applies the committed EF Core migrations, and exits. A migration exception produces a non-zero exit code. Do not start or update application containers when this command fails.

## Deploy

After the migration succeeds:

```bash
docker compose --env-file /secure/path/betcco.env \
  -f compose.deploy.yml up -d --no-build api web
```

Only the web port is published, and it is bound to loopback. Configure the HTTPS edge to forward the public host to that port. Do not publish the API container directly to the Internet.

## Health verification

The API exposes two generic endpoints without internal diagnostics:

- `/health/live` confirms that the process can answer HTTP.
- `/health/ready` confirms PostgreSQL connectivity and availability of the configured private S3 bucket.

The API container health check uses readiness. S3 is also checked during API startup. ClamAV failure blocks the affected upload operation rather than taking unrelated learning routes offline. SMTP delivery is durable through the registration outbox and is monitored separately from request readiness.

Verify the private API and public web process:

```bash
docker compose --env-file /secure/path/betcco.env -f compose.deploy.yml exec api \
  curl --fail --silent http://127.0.0.1:8080/health/live
curl --fail --silent https://staging.example.com/ar
```

Then run a staging smoke test for sign-in, one authorised private-file read, one scanner-protected upload, and one queued email. Do not use live payment credentials for staging smoke tests.

## Rollback

1. Keep the previous immutable API and web image tags available.
2. Stop traffic or enable the deployment platform's maintenance mode.
3. Confirm that the database changes are backward-compatible with the previous application version.
4. Change only `BETCCO_IMAGE_TAG` to the previous reviewed release.
5. Run `docker compose ... up -d --no-build api web`.
6. Verify liveness, readiness, and the public smoke route before restoring traffic.

Do not automatically downgrade the database. If a migration is not backward-compatible, stop and use an owner-approved recovery plan.

## Persistent state

- PostgreSQL data is owned and backed up by the selected database service.
- Data Protection key records are stored in PostgreSQL and encrypted with the mounted PFX certificate.
- Private objects are stored in the external S3-compatible bucket.
- No durable state is kept inside the API or web containers.
- Replacing an application container must not replace the database, bucket, or Data Protection certificate.

Production RPO/RTO, backup schedules, restore drills, retention, and cross-region recovery remain owner decisions. A deployment is not production-ready until backup and restore have been tested.

## Secret rotation

Rotate one integration at a time. Update the deployment platform's secret store or protected environment file, recreate only the affected containers, and verify health and the directly affected operation. Preserve the previous Data Protection certificate while keys encrypted with it may still be required; certificate rotation needs an explicit key migration/retention plan.

Never place secret values in image build arguments, Compose files, application settings committed to Git, logs, issue comments, or Pull Request descriptions.

## Intentionally deferred

- External backup implementation and restore drills.
- Monitoring and alerting vendor integration.
- Live PayTabs and payout providers.
- Live SMTP, S3, and ClamAV provider validation.
- QuestPDF production enablement.
- Production hosting vendor, domain, certificate ownership, and DNS decisions.
- Full UAT, capacity testing, launch hardening, and final legal review.

No repository document explicitly defines a phase named `Phase 5B`. The closest existing roadmap item is `P1 storage and operations`; this foundation implements only its deployment/runbook portion.
