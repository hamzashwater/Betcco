# BETCCO engineering guide

## Product rules

- BETCCO is the platform brand. Keep **BTEC** only for educational concepts.
- API authorization and ownership checks are mandatory; UI visibility is never a security control.
- Prices, discounts, payment status, entitlements, and evaluation state transitions are server-owned.
- User uploads are private and must never be written below a public web root.
- Do not add default administrator credentials, secrets, API keys, or production URLs to source control.

## Architecture rules

- Frontend uses feature folders, strict TypeScript, translations for all UI strings, and API-backed state.
- Backend keeps domain state and invariants in `Betcco.Domain`, use cases in `Betcco.Application`, persistence/integrations in `Betcco.Infrastructure`, and HTTP concerns in `Betcco.Api`.
- Return DTOs, not EF entities. Use `/api/v1`, Problem Details, pagination bounds, and `AsNoTracking` for reads.
- Every mutable API route has validation, antiforgery protection, authorization, audit logging where sensitive, and tests.

## Required verification

Run the narrowest relevant validation after each change.
Run broader formatter, lint, typecheck, build, and test suites only when the scope of the change requires them.

## Source of truth and handoff

GitHub `main` is the technical Source of Truth for BETCCO. If `docs/PROJECT_STATUS.md` conflicts with current code, Git history, tests, migrations, or CI evidence, repository evidence wins and the status document must be corrected.

Use one scoped feature or gap per branch. Do not reopen completed work without new repository evidence.

## Parallel workstreams

BETCCO may have a maximum of TWO simultaneous active implementation workstreams.

Parallel work is allowed only when the workstreams are sufficiently independent. Every active workstream must have:

- one dedicated branch
- one clearly defined owner/account
- one scoped module/feature
- one Draft Pull Request as soon as meaningful work is pushed
- a PR description containing current progress and reserved scope

Each workstream owns its declared files/modules while active. Another workstream must not modify owned files/modules without explicit coordination.

Before beginning a coding session, every account must:

1. Run `git fetch origin`.
2. Inspect the latest `main`.
3. Inspect all OPEN Draft PRs.
4. Read their Reserved Scope / Primary Files.
5. Compare those areas with the task it intends to modify.
6. STOP if meaningful overlap exists.

Open Draft PRs are part of the live collaboration state, not merely review artifacts.

## Synchronization

Each account works only on its own branch. Never push to another workstream's branch or share the same working directory across accounts/devices.

When another workstream merges into `main`, fetch `origin`, inspect the merged diff, determine whether it affects the current workstream, and merge the latest `origin/main` into the feature branch when needed. Never rebase or force-push shared workstream branches without explicit approval.

If integration produces conflicts, STOP and inspect them. Do not automatically choose ours/theirs.

## Live progress

The Draft PR body is the live progress ledger for an active workstream. Update it at meaningful checkpoints with:

- Status
- Current Progress
- Primary Files / Modules
- Reserved Scope
- Last Completed Checkpoint
- Next Step
- Blockers

Do not update `docs/PROJECT_STATUS.md` after every commit.

## PROJECT_STATUS role

`docs/PROJECT_STATUS.md` represents merged project state, a high-level active-work snapshot, roadmap state, and blockers. It is not a per-commit activity log. Live implementation progress belongs in Draft PRs.

## Context and usage efficiency

The current repository state is the source of truth.

For every task:

1. Start from the exact feature, error, component, endpoint, service, entity, or file involved.
2. Search narrowly and inspect only the minimum files required.
3. Follow direct dependencies only when necessary.
4. Do not scan, summarize, or audit the entire repository unless explicitly requested.
5. Do not reopen unchanged files without a concrete reason.
6. Do not inspect unrelated features.
7. Preserve existing working code and user changes.
8. Make the smallest safe change that solves the current task.
9. Stop when the requested task is complete.

Do not inspect generated/vendor content by default:

- node_modules/
- .next/
- dist/
- build/
- out/
- bin/
- obj/
- coverage/
- .git/
- caches/
- logs/
- generated bundles
- large media directories

## Validation efficiency

Run the narrowest relevant validation first.

For small changes, do not automatically run:
- the entire frontend test suite
- the entire backend test suite
- all integration tests
- all E2E tests
- all Docker builds
- repository-wide security scans

Preferred order:

1. directly related test
2. affected component/service tests
3. relevant lint/typecheck/build
4. affected subsystem tests
5. full validation only when genuinely required

Broader validation is appropriate when:
- shared infrastructure changed
- authentication/authorization changed broadly
- database schema changed broadly
- release validation is explicitly requested

Do not rerun an expensive successful test unless later changes could affect it.

## Task boundaries

Do not convert a focused task into a repository-wide review.

If the user asks to fix one feature:
- inspect that feature
- inspect direct dependencies
- fix the root cause
- validate the affected behavior
- stop

If an unrelated problem is discovered, mention it briefly but do not fix it unless requested.

## Master plan

Any BETCCO Master Implementation or Requirements document is a reference and roadmap.

Do not interpret it as an instruction to implement the entire roadmap during every task.

Do not restart completed phases.

For each new task:
- inspect the current implementation
- determine what is already complete
- identify only the remaining gap
- implement only that gap

## Completion

A task is NOT DONE until:

1. The implementation is merged into `main`.
2. Required CI is green.
3. `docs/PROJECT_STATUS.md` reflects the merged result.

When multiple workstreams are active, status reconciliation must not cause both branches to edit `docs/PROJECT_STATUS.md` concurrently. Prefer a small dedicated status/governance update after the product merge or another explicitly coordinated method.

At the end of a normal task report only:

1. What changed
2. Root cause, if applicable
3. Files changed
4. Validation actually run
5. Remaining blocker or risk

Do not continue automatically to the next roadmap item.

## Repository collaboration

- Keep work for the same feature in the same Codex thread when practical; start a new branch and thread for a different feature.
- Create a `feature/<short-description>` or `fix/<short-description>` branch for normal development. Do not develop or push directly on `main`.
- BETCCO supports a maximum of two sufficiently independent active implementation workstreams, coordinated through OPEN Draft PRs.
- Draft PR descriptions are the live progress ledger; `docs/PROJECT_STATUS.md` remains a high-level merged-state snapshot.
- Do not use destructive `git reset` or `git clean` operations without explicit approval.
- Before merge, review `git diff main...HEAD` and inspect the changed files plus only the direct dependencies needed to judge behavior.
- Do not mix unrelated refactoring into a feature or fix branch.
- Never expose secrets, local configuration, private keys, user uploads, or runtime data.
- Run the narrowest relevant tests and report any blocker clearly.
- Require a Pull Request, Codex review, green required CI, and final approval before merging into `main`.
- Never force-push `main`.

SEARCH NARROWLY.
READ MINIMALLY.
EDIT MINIMALLY.
TEST NARROWLY.
STOP WHEN DONE.
