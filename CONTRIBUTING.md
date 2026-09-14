# Contributing to BETCCO

BETCCO changes must be small, reviewable, and safe for a production system.

## Workflow

1. Start from an up-to-date `main` branch.
2. Create `feature/<short-description>` or `fix/<short-description>`.
3. Keep one coherent feature or fix on each branch.
4. Implement the smallest complete change and avoid unrelated refactoring.
5. Run the targeted tests for the affected behavior.
6. Review the branch with `git diff main...HEAD` and complete a Codex review.
7. Commit with a clear message, push the branch, and open a Pull Request.
8. Resolve all CRITICAL and HIGH findings and any failed required checks.
9. Merge only after GitHub Actions is green and final approval is recorded.

Never perform normal development directly on `main`, force-push `main`, or bypass the Pull Request workflow.

Before another engineer or account starts a new task, the previous implementation must be merged into `main` and `docs/PROJECT_STATUS.md` must reflect that merged state. Do not rely on previous ChatGPT or Codex conversation memory.

## Security and Repository Hygiene

- Never commit `.env`, secrets, tokens, production URLs, private keys, certificate private material, user uploads, database data, runtime logs, or runtime Data Protection keys.
- Disposable credentials scoped to ephemeral CI service containers must be clearly identified as test-only and must not match local, staging, or production credentials.
- Do not commit `node_modules`, `.next`, `bin`, `obj`, coverage, test reports, generated SQL, database dumps, IDE state, or temporary files.
- Preserve BETCCO's authorization, privacy, assessment, and server-owned financial invariants.

## Database Changes

Migrations must match the EF model, be additive and data-safe unless destructive behavior is explicitly approved, and include focused migration verification. Never generate a new migration merely to set up an existing clone.

## Pull Requests

Use the repository Pull Request template. Explain the concrete behavior change, affected areas, validation performed, migration impact, security/privacy impact, and breaking changes. A Pull Request requires Codex review, green CI, resolution of blocking findings, and final approval before merge.

See [docs/CODE_REVIEW.md](docs/CODE_REVIEW.md) for the review severity and merge policy.
