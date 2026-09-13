# BETCCO

BETCCO is an Arabic-first educational technology platform focused on BTEC learners and educators. It combines course delivery, private learning resources, assessments, governed BTEC evaluation workflows, enrollment, and role-based operations. BETCCO is independent and does not claim official affiliation with Pearson or BTEC.

## Technology Stack

- Backend: ASP.NET Core on .NET 10, Entity Framework Core, and PostgreSQL with pgvector.
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, next-intl, and TanStack Query.
- Private storage: local filesystem for supported development use and S3-compatible storage for production; a pinned MinIO Community source build provides deterministic local and integration-test infrastructure.
- Tests and quality: xUnit, Vitest, Playwright, ESLint, Prettier, TypeScript, Docker Compose, and GitHub Actions.

## Repository Structure

```text
backend/              .NET solution, application layers, migrations, and tests
frontend/             Next.js application and frontend tests
docs/                 Architecture, security, review, and project documentation
.github/              GitHub Actions and Pull Request template
infra/                Supporting infrastructure assets
scripts/              Local database and API helper scripts
docker-compose.yml    Local PostgreSQL, source-built MinIO Community, and Mailpit services
compose.deploy.yml    Provider-neutral staging/production application stack
.env.example          Safe local configuration template
deploy.env.example    Safe staging/production configuration contract
```

## Prerequisites

- Git.
- .NET SDK 10.
- Node.js 22 or newer. GitHub Actions uses Node.js 24.
- pnpm 11.19.0, as declared by `frontend/package.json`.
- Docker with Docker Compose.
- PowerShell for the supplied database and API helper scripts.

## Clone

```bash
git clone https://github.com/hamzashwater/Betcco.git
cd Betcco
```

## Environment Setup

Create a local environment file from the tracked template:

```powershell
Copy-Item .env.example .env
```

On macOS or Linux:

```bash
cp .env.example .env
```

Replace the local password placeholders and keep the PostgreSQL connection string consistent with the local Compose credentials. Optional integrations remain disabled until their values are configured.

**NEVER COMMIT `.env`.** Production credentials belong in the deployment platform's environment or secret manager, never in Git.

## Local Infrastructure

After configuring `.env`, start PostgreSQL, private MinIO storage, bucket initialization, and Mailpit:

```bash
docker compose up -d postgres minio minio-init mailpit
docker compose ps
```

Validate the Compose configuration with:

```bash
docker compose config --quiet
```

MinIO's object API is available locally on port `9000`, its console on `9001`, and Mailpit on `8025`. The initialization service creates the configured private bucket and disables anonymous access.

Compose builds the AGPL-3.0 MinIO Community server from the official `RELEASE.2025-10-15T17-29-55Z` source commit and bundles the official `mc` client release `RELEASE.2025-08-13T08-35-41Z`. This local image does not use MinIO AIStor and does not require a commercial license key. The first storage startup takes longer while Docker builds the pinned sources.

## Backend

Restore tools and dependencies, then build:

```bash
dotnet tool restore
dotnet restore backend/Betcco.sln
dotnet build backend/Betcco.sln --no-restore
```

Start the API from PowerShell. The script loads the ignored `.env` into that process only:

```powershell
./scripts/start-api.ps1
```

The API listens on `http://localhost:5085`.

## Database

Apply the migrations already committed to the repository:

```powershell
./scripts/update-database.ps1
```

The script runs `dotnet-ef database update` against the configured local PostgreSQL database. A new clone should apply existing migrations; it should not generate a new migration.

## Frontend

The repository uses pnpm and its committed lockfile:

```bash
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend dev
```

Open `http://localhost:3000/ar`. Frontend API requests use `BETCCO_API_URL`, which defaults to `http://localhost:5085`.

If PowerShell blocks the pnpm script wrapper, use the installed Node command:

```powershell
& "C:\Program Files\nodejs\npx.cmd" --yes pnpm@11.19.0 --dir .\frontend install --frozen-lockfile
& "C:\Program Files\nodejs\npx.cmd" --yes pnpm@11.19.0 --dir .\frontend dev
```

## Tests

Run backend verification after restoring and building:

```bash
dotnet format backend/Betcco.sln --verify-no-changes --no-restore
dotnet test backend/Betcco.sln --no-build --no-restore
```

Run frontend verification after installing dependencies:

```bash
pnpm --dir frontend format:check
pnpm --dir frontend lint
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build
```

Playwright tests are available through `pnpm --dir frontend test:e2e`. Some integration tests require the disposable PostgreSQL or MinIO test services configured by GitHub Actions.

## Storage

- `Local` stores private files outside the public web root and is intended for supported development use.
- `S3Compatible` is required in production. The application verifies the configured bucket during startup and does not fall back to node-local storage.
- MinIO provides an S3-compatible private bucket for local and CI testing.
- Uploaded objects are staged, committed with a durable database lifecycle record, then finalized. A storage-scoped worker retries finalization/deletion and removes orphan staging objects.
- Protected files are streamed through authorized application endpoints; raw objects are not public.
- Production Data Protection keys are shared through PostgreSQL and encrypted with a configured certificate.

## Staging and Production Deployment

The provider-neutral deployment topology, configuration contract, controlled migration command, health checks, rollback procedure, and deferred production decisions are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

`docker-compose.yml` remains development-only. Staging and production use `compose.deploy.yml` with a protected environment file stored outside Git. The deployment stack keeps payments, payouts, JoFotara, AI, demo data, and PDF reporting disabled.

## Git Workflow

`main` is the protected integration branch. Normal development must use a focused feature or fix branch and a Pull Request.

```bash
git checkout main
git pull
git checkout -b feature/teacher-resource-library
```

After implementing and testing the change:

```bash
git add <intended-files>
git commit -m "feat(teacher): add resource library"
git push -u origin feature/teacher-resource-library
```

Use `feature/<short-description>` for features and `fix/<short-description>` for fixes. Open a Pull Request into `main`; do not push normal development work directly to `main`.

Developers with repository write permission may push their feature branches directly. Other contributors should push to a fork and open a Pull Request.

## Code Review Policy

Every change intended for `main` must go through:

1. A feature or fix branch.
2. Relevant targeted tests.
3. Codex review of `git diff main...HEAD`.
4. A Pull Request.
5. Required GitHub Actions checks.
6. Correction of blocking findings.
7. Final approval.
8. Merge into `main`.

The severity and merge rules are defined in [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md). Contribution requirements are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

- Never commit `.env`, credentials, access tokens, private keys, certificate private material, private uploads, database data, or runtime Data Protection keys.
- Use environment configuration or a managed secret store for production secrets.
- Production startup rejects unsafe local storage, unshared Data Protection configuration, fake payment/payout providers, and missing malware-scanner configuration.
- The optional initial administrator is created only when both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are supplied; no default administrator account exists.
- Report suspected vulnerabilities privately to the repository owner instead of publishing credentials or exploit details in an issue.

## Development and Production Boundaries

- Development/Test may use the deliberate safe upload scanner and fake payment/payout adapters. Production requires reviewed real providers and ClamAV.
- SMTP development defaults target Mailpit. Production SMTP credentials must come from secret configuration.
- AI, OneRoster, analytics, and external payment/fiscal integrations stay disabled until explicitly configured and reviewed.
- Before a public product launch, an authorised Jordanian lawyer should review the versioned legal documents and the owner must replace placeholder business/contact data through the supported settings workflow.
