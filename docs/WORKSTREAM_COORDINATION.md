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

Snapshot captured: **2026-09-25**

At capture time:

- `main`: `3693585d44ab43f7c591771e221b7be4cde1a4ea`
- OPEN PRs: PR #53 only
- PR #53 head: `fee0939003fbe53b0edfd3f310baa5a8bf065a59`
- PR #53 branch is ahead of current `main` and not behind it.

These SHAs are historical coordination markers only. Re-verify them before using them operationally.

---

# ASUS

## Current Workstream

PR #53 — **Comprehensive Practice Assignment — Final Unit Practice**

Branch:

`feature/comprehensive-practice-assignment`

Owner: **ASUS**

Status at the snapshot: Draft / active review and completion workstream.

## ASUS Reserved Scope

Coordinate before another workstream edits these areas while PR #53 remains open:

- Comprehensive Practice / Final Unit Practice
- `CourseAssignment` ComprehensivePractice purpose and lifecycle
- Comprehensive Practice authoring / publication / learner access
- Learning Aim progression directly related to Comprehensive Practice
- `TrainingOutcome` integration for this flow
- Course Player / learner flow directly related to Practice
- Comprehensive Practice Student UI
- Comprehensive Practice Teacher UI
- related `BetccoDbContext`
- related EF ModelSnapshot
- related Comprehensive Practice migration
- related Comprehensive Practice tests

Current PR #53 also touches shared files including Student area and Teacher course editor. Always inspect the live diff before parallel edits.

## ASUS Current Completion Sequence

Before PR #53 closes:

1. verify the authoring lifecycle:
   `Create → Draft → Configure → Publish → Student Access`
2. verify all previous HIGH / MEDIUM / LOW review findings are resolved or explicitly accepted as non-blocking
3. run focused follow-up review
4. synchronize with latest `main` if needed
5. run final CI
6. Ready for Review
7. final independent review
8. merge PR #53
9. verify post-merge `main` CI

## ASUS Planned Roadmap

These items are treated as ASUS-owned planning scope unless coordination explicitly changes ownership:

1. Attempt History + Improvement Tracking
2. AI Practice Evaluator
3. Student Progress Intelligence
4. Teacher Intervention Dashboard
5. Evaluate My Assignment
6. Commerce / Entitlements
7. Production Hardening
8. Final UI/UX Redesign

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

**No active implementation feature is reserved at this snapshot.**

LENOVO should not start Student Lifecycle Closure while PR #53 is active because that work logically depends on the final Comprehensive Practice behavior and may overlap shared learner/progression files.

## LENOVO Candidate Work

These are candidates only, not automatically active/reserved:

- Resit policy / workflow
- broader ASSESS Reasonable Adjustments
- security / repository hardening follow-ups
- Secret Scanning / Push Protection verification
- Privacy / Compliance follow-ups
- independent Admin / Operations workflows
- repository status/documentation reconciliation

Before selecting any candidate, run the mandatory preflight and check ASUS active/reserved scope.

## LENOVO Must Coordinate Before Editing

While ASUS PR #53 is open, do not edit without coordination:

- Comprehensive Practice
- Learning Aim Practice progression involved in PR #53
- Comprehensive Practice `CourseAssignment` behavior
- Comprehensive Practice migration / ModelSnapshot
- Student/Teacher Comprehensive Practice UI
- any file currently changed by PR #53 if the proposed change is behaviorally related

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
