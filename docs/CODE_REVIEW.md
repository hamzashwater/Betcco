# BETCCO Code Review Standard

Every Pull Request targeting `main` requires a focused Codex review before merge.

## Review Scope

Review the current branch against `main`:

```bash
git diff main...HEAD
```

Inspect the changed files first. Read only directly related code needed to understand behavior, contracts, and risk. A routine Pull Request review is not a full repository audit and must not expand into unrelated refactoring.

Review for:

- functional correctness and regressions;
- security, authorization, privacy, and secret exposure;
- database consistency, transaction boundaries, concurrency, and migration safety;
- exception handling, validation, and API compatibility;
- frontend/backend contracts and backwards compatibility;
- relevant tests and failure cases;
- business-rule duplication and architecture boundaries;
- maintainability and accidental scope expansion;
- material performance regressions.

## Finding Severity

- **CRITICAL:** likely exploitation, sensitive-data exposure, financial loss, or loss of a core system invariant.
- **HIGH:** serious security, authorization, privacy, data-integrity, or core-function defect.
- **MEDIUM:** bounded correctness, reliability, compatibility, or performance defect.
- **LOW:** limited maintainability or user-impact issue.
- **INFO:** non-blocking observation or optional improvement.

Each finding should identify the affected path and behavior, explain the realistic impact, and propose the smallest safe correction. Do not label a theoretical concern CRITICAL or HIGH without evidence.

## Merge Policy

Merge is blocked when any of these conditions applies:

- any CRITICAL finding exists;
- any HIGH finding remains unresolved;
- relevant tests fail;
- a required GitHub Actions check fails;
- the change contains a secret, unsafe migration, or unreviewed breaking contract change.

Codex may report **APPROVED FOR MERGE** only when the relevant diff has been reviewed, blocking findings are resolved, and required validation is green. Codex review is a documented human-in-the-loop process unless the repository later installs a trusted review integration; it must not be represented by a fabricated GitHub status check.
