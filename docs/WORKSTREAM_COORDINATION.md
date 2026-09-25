# BETCCO Workstream Coordination

This file is the coordination handoff for parallel ASUS and LENOVO development.

## Source of Truth

Repository: `hamzashwater/Betcco`

Before any implementation work, always verify the live repository state in this order:

1. latest `origin/main`
2. all OPEN / Draft pull requests
3. actual PR diffs and changed files
4. CI / required checks
5. review threads
6. `AGENTS.md`
7. `docs/PROJECT_STATUS.md`
8. this file

GitHub and the actual repository state override conversation memory and this document if they disagree.

Do not start a new implementation task from conversation history alone.

## Mandatory Preflight

Before any new ASUS or LENOVO task:

1. `git fetch origin`
2. verify the current branch and clean/dirty worktree
3. read latest `origin/main`
4. inspect every OPEN / Draft PR
5. inspect each active workstream's reserved scope
6. compare planned files/modules against active PR changed files
7. inspect current CI and unresolved review threads
8. stop if meaningful overlap exists
9. only then create or continue a feature branch

Maximum active implementation workstreams: **2**, and they must be sufficiently independent.

One device should own one feature branch/workstream at a time.

Do not force-push, reset, clean, or overwrite uncommitted work without explicit approval.

## Live Snapshot

Snapshot captured: **2026-09-26**

At capture time:

- `main`: `29bacc0de0a4faeec5125edffa8c04f6a2bb045e`
- PR #53 is merged: Comprehensive Practice Assignment — Final Unit Practice.
- PR #57 is merged: LENOVO Admin Audit Log Filters — Slice 1.
- PR #59 is merged: LENOVO Admin Audit Log CSV Export — Slice 2.
- PR #61 is merged: ASUS Learning Aim Practice Attempt History — Slice 1.
- PR #63 is merged: LENOVO Simplify BETCCO Assignment Review Flow — Slice 1.
- PR #64 is merged: ASUS AI Practice UI Shell — Slice 1.
- PR #66 is merged: AI Practice UI Shell status reconciliation.
- PR #65 is merged: Included Evaluation Credit / Entitlement — Slice 1.
- GitHub Secret Scanning and Push Protection are enabled; 0 open secret-scanning alerts were present at verification.
- OPEN implementation PRs: none.
- ASUS and LENOVO have no active implementation PR at this snapshot.

These SHAs are historical coordination markers only. Re-verify them before using them operationally.

---

# ASUS

## Current Workstream

**No active ASUS implementation PR at this snapshot.**

PR #64 — **AI Practice UI Shell — Slice 1** — is merged into `main` at `649b3cd9676563d64c06dc0a245e29b6b4f7c39f`.

PR #61 — **Learning Aim Practice Attempt History — Slice 1** — remains merged at `713dd95732ac44b334b6581b171d13ec1a49fb93`.

PR #53 — **Comprehensive Practice Assignment — Final Unit Practice** — remains merged at `179b4eee25a5bad0cf4d961c3d940d9044461fff`.

## ASUS Reserved Scope

No active ASUS implementation scope is reserved after PR #64 merged. The AI engine/API/RAG/persistence work is deliberately deferred and is not an active workstream.

The ASUS planned roadmap below remains planning ownership only. Before starting any roadmap item, ASUS must run a fresh preflight against latest `main`, all OPEN/Draft PRs, changed files, CI, and review threads.

## ASUS Current Completion Sequence

PR #64 completion is closed at the implementation/CI level: required PR Quality #186, Full UAT Matrix #81, and Security analysis #188 were green before merge, and post-merge `main` Quality #187 plus Security analysis #189 are complete and green. This reconciliation records the merged state.

## ASUS Planned Roadmap

These items are treated as ASUS-owned planning scope unless coordination explicitly changes ownership:

1. Student Progress Intelligence
2. Teacher Intervention Dashboard
3. Evaluate My Assignment
4. Commerce / Entitlements
5. Production Hardening
6. Final UI/UX Redesign

Deferred by current product decision: AI Practice Engine / provider integration / RAG / persistence. PR #64 provides only the UI shell and must not be treated as an active AI-engine implementation.

A roadmap item is not automatically an active implementation branch. Re-run preflight before starting each item.

## ASUS Must Coordinate Before Editing

- Authentication
- Staff MFA
- MFA Recovery Codes
- Account Security infrastructure
- an active LENOVO-reserved feature

---

# LENOVO

## Completed Work

### PR #52 — Staff MFA Enforcement — Slice 1

Completed and merged.

Includes mandatory Staff MFA enforcement, authenticator TOTP enrollment/challenge, restricted enrollment state, session/security-stamp handling, and account-security UI integration.

### PR #54 — Staff MFA Recovery Codes — Slice 1

Completed and merged.

Merge commit:

`3693585d44ab43f7c591771e221b7be4cde1a4ea`

Includes:

- Identity recovery-code generation
- single-use recovery-code login
- regeneration with password + TOTP
- authenticator reset with password + unused recovery code
- SecurityStamp rotation
- revocation of other sessions
- protected recovery-code persistence
- EN/AR Account Security/login flows

## Current LENOVO Workstream

**No active LENOVO implementation PR at this snapshot.** PR #65 — Included Evaluation Credit / Entitlement — Slice 1 is merged into `main` at `29bacc0de0a4faeec5125edffa8c04f6a2bb045e`. Its scope includes the included-credit data model and migration, course payment grant and refund revocation, evaluation checkout consumption, and the Student evaluation wizard. At this baseline, a follow-up is needed for credits on two paid enrollments sharing a Unit, undefined numeric criterion achievements, and retrying a failed Student credit check.

PR #57 — **Admin Audit Log Filters — Slice 1** — is merged into `main` at `f57726607e8ac3a0c40c1bbbcf18ab3dd5705d4f`.

PR #59 — **Admin Audit Log CSV Export — Slice 2** — is merged into `main` at `a0684ce0e65027c45c860e0ebf3db332263c8a0d`.

PR #63 — **Simplify BETCCO Assignment Review Flow — Slice 1** — is merged into `main` at `11a7c5fd4dc606c222236947dd8292886f9302ea`; new Pearson-style Retake creation/authorization is retired in favor of the advisory BETCCO review flow, while historical Retake records remain readable/completable.

The merged Admin Audit Log scope now includes bounded filtering plus bounded/minimized CSV export. Repository Secret Scanning and Push Protection verification is also complete with both protections enabled and 0 open secret-scanning alerts at verification.

## LENOVO Candidate Work

These are candidates only, not automatically active/reserved:

- Resit policy / workflow
- broader ASSESS Reasonable Adjustments
- security / repository hardening follow-ups
- Privacy / Compliance follow-ups
- independent Admin / Operations workflows
- repository status/documentation reconciliation

Before selecting any candidate, run the mandatory preflight and check ASUS active/reserved scope.

## LENOVO Must Coordinate Before Editing

LENOVO has no active implementation workstream at this snapshot. Run the mandatory preflight before selecting the next candidate or expanding into shared files.

Comprehensive Practice is merged and is no longer reserved by an open ASUS PR. Any future change to its `CourseAssignment`, Learning Aim progression, migration/ModelSnapshot, or Student/Teacher Practice UI must still be treated as shared high-risk work and preflighted against active branches.

Also do not take an ASUS roadmap feature after ASUS has started or explicitly reserved it.

---

# Shared Coordination Rules

## Ownership

A workstream is considered active/reserved when at least one of the following is true:

- an OPEN / Draft PR exists for it
- a feature branch has been explicitly assigned to ASUS or LENOVO
- this document explicitly marks it as active/reserved

If GitHub evidence contradicts this file, GitHub wins and this file must be reconciled.

## Branches

- one scoped feature/fix per branch
- do not share a feature branch across ASUS and LENOVO
- do not perform normal feature work directly on `main`
- use Draft PRs as the live implementation ledger

## Shared Files

Editing the same file in two workstreams is not automatically forbidden, but it requires an explicit overlap review first.

High-risk shared areas include:

- `BetccoDbContext`
- EF migrations and ModelSnapshot
- common domain enums
- shared Student area
- shared Teacher area
- authentication/session infrastructure
- CourseAssignment / learning progression services

If both workstreams need one of these files for related behavior, pause and sequence the work instead of developing in parallel.

## Merge Handoff

After either device merges a PR:

1. verify the merge commit on `main`
2. verify required post-merge CI where applicable
3. re-check OPEN / Draft PRs
4. other active device/workstream fetches latest `main`
5. reconcile branch divergence before further implementation
6. update `docs/PROJECT_STATUS.md` if merged-state documentation is stale
7. update this file when ownership, active workstream, or reserved scope changes

## New Chat Handoff

A new ChatGPT/Codex session should be given only the device identity and instructed to rebuild state from repository evidence.

Recommended start:

> You are taking over the BETCCO workstream for DEVICE: ASUS/LENOVO. Read `AGENTS.md`, `docs/PROJECT_STATUS.md`, and `docs/WORKSTREAM_COORDINATION.md`. Then perform a read-only preflight against latest `origin/main`, all OPEN/Draft PRs, actual diffs, CI, and review threads. Do not modify files until you report the current ASUS scope, LENOVO scope, overlap risks, and exact next action.

Do not rely on previous conversation memory as the technical source of truth.
