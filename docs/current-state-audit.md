# Current-state audit

Updated: 2026-09-01

This document records the repository state observed before the implementation programme defined in `BETCCO_Codex_Master_Implementation_Prompt.md`. It is an engineering audit, not a legal opinion, Pearson accreditation claim, penetration test, or production readiness certificate.

## Repository map

| Area | Location | Responsibility |
| --- | --- | --- |
| Web application | `frontend/` | Next.js 16, React 19, TypeScript, `next-intl`, React Query, Vitest, Playwright |
| API | `backend/src/Betcco.Api/` | ASP.NET Core HTTP endpoints, authentication, antiforgery, authorization and host configuration |
| Domain | `backend/src/Betcco.Domain/` | Domain entities, enums and invariants |
| Application | `backend/src/Betcco.Application/` | DTOs and use-case contracts |
| Infrastructure | `backend/src/Betcco.Infrastructure/` | EF Core persistence, integrations, services and migrations |
| Tests | `backend/tests/`, `frontend/src/**/*.test.*`, `frontend/e2e/` | Unit, integration, UI and smoke tests |
| Local infrastructure | `docker-compose.yml` | PostgreSQL 16 with pgvector, MinIO and Mailpit |
| Operations/docs | `README.md`, `docs/`, `scripts/`, `infra/` | Local setup and architecture documentation |

## Baseline versions

| Tool | Observed version |
| --- | --- |
| Node.js | 24.19.0 |
| pnpm contract | 11.19.0 |
| Next.js | 16.3.2 |
| React | 19.2.8 |
| .NET SDK | 10.0.300 |
| PostgreSQL local image | pgvector/pgvector:pg16 |
| Docker Compose | 5.1.3 |

## Current product capabilities

- Arabic-first BETCCO platform with English locale, RTL/LTR, theme switching and central public site settings.
- Role-based student, teacher and administrator workflows with cookie authentication, sessions, optional TOTP and audit records.
- Course authoring, review, enrolment, protected learning content, progress, assignments, quizzes, certificates and support.
- BTEC-oriented criteria plans, criterion decisions, teacher assessment and an internal-verification workflow.
- Server-owned cart, coupons, invoices, wallet allocation and development-only fake payment flow.
- Private local uploads with production fail-closed ClamAV configuration contract.
- Versioned legal content, consent recording, privacy centre and an AI tutor which is disabled until configured.

## Baseline findings

1. The Git repository has no initial commit. All project files are currently untracked. This must be preserved during implementation; committing or pushing requires explicit owner approval.
2. Docker configuration is valid. PostgreSQL and Mailpit are healthy; MinIO is running locally.
3. The two pre-existing frontend formatting issues in `src/features/teacher/course-editor.tsx` and `tsconfig.json` were repaired during the initial quality-gate slice.
4. The existing payment and payout adapters are intentionally safe stubs outside Development/Test. A real provider is not configured and must not be inferred.
5. Local storage remains the active private file storage implementation; MinIO is available locally but is not the active application storage adapter.
6. Historical BTEC percentage mappings were replaced in the evaluation and coursework paths with versioned, criterion-based rule snapshots. Ordinary quiz percentages and lesson-progress statistics remain separate numeric measures.
7. `localhost` occurrences currently exist in development documentation, launch settings, tests and a limited set of runtime fallback paths. Production startup validation and metadata paths require review.

## Baseline command record

| Command | Status at audit start | Evidence |
| --- | --- | --- |
| `pnpm format:check`, lint, typecheck, test, build | Passed | 5 Vitest tests passed; production build completed |
| `dotnet format --verify-no-changes`, Release build, test | Passed | 7 unit and 53 integration tests passed |
| EF Core migrations on isolated PostgreSQL | Passed | 37 migrations applied, including the BTEC rule/snapshot migrations |
| `docker compose config --quiet` | Passed | Compose configuration valid |
| `docker compose ps` | Passed | Local PostgreSQL and Mailpit healthy; MinIO running |

## Safety boundaries

- No production payment, payout, storage, mail, deployment or legal-provider decision is assumed from this repository.
- No user secrets are read or reproduced in engineering documentation.
- BTEC functionality is technical support for configurable criteria; BETCCO does not claim Pearson affiliation or accreditation.
- Any production release requires an owner-approved deployment, payment provider, legal review, data-retention decision and incident/backup plan.
