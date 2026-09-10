# ADR 0003: deterministic quality gates and non-root containers

Date: 2026-09-01

## Status

Accepted.

## Decision

The repository uses one documented PowerShell verification command and GitHub Actions workflows that execute formatting, linting, type checking, frontend tests, .NET build/tests, empty-database migration, public Playwright smoke tests, compose validation, dependency review and CodeQL analysis. Production images are multi-stage and run as non-root users.

## Consequences

- Branch protection must require the `Application quality` and `CodeQL` checks once a protected remote repository is created.
- Playwright's public smoke suite runs in CI. Flows needing the real local API remain explicitly gated until deterministic CI fixtures exist.
- Image build success is verified in CI; deployment and payment credentials remain outside CI source control.
