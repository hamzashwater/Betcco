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

Snapshot captured: **2026-09-28**

At capture time:

- `main`: `00f9f2044097739cd7df15cb6e78720bbe5f9902` (PR #116 LENOVO N6A merge).
- PR #103 — ASUS Production Readiness & Hardening Gap Audit — is merged; its production-hardening findings remain separate from Resit completion.
- PR #104 — LENOVO Resit End-to-End Hardening — L13 is merged at historical main commit `3109adfcf1f370338e0f348ceadf72e84a14f749`. Its Full UAT and required checks passed on final PR head `e404539ac7f2488d7cc85a50ceb02d4f8c02f529` before merge.
- PR #107 — LENOVO N1 ASSESS Reasonable Adjustments Resit guard — merged at `816ae1632ac93392440656051e6fba8a7bfa9704`; Resit revision-deadline adjustment grant/revoke/summary protection is verified in source and focused tests.
- PR #110 — LENOVO N2 Privacy Execution Concurrency and Idempotency — merged at `0a8bf9beca6b006d7802492c6fdf6b8dd77c4853`; PostgreSQL request-row locking, terminal completion, replay, rollback/retry, and unrelated-request coverage are merged; required PR checks passed.
- PR #112 — LENOVO N3 Admin Audit Log Query and Pagination Hardening — merged at `3a70a3615de4f59f26b3dc5499dda5da1f1138c9`; bounded overflow-safe pagination, stable ordering, and PostgreSQL tests are merged.
- N4 — read-only TaskType ownership audit: scoped Evaluation derives `TaskTypeId` from the selected `RubricTemplate`; ownership remains architecturally ambiguous, with no approved schema migration or established correctness blocker. No implementation is claimed.
- N5 — read-only Privacy / Compliance reconciliation: same-subject Rectification × Erasure/Concealment precedence on overlapping fields remains an undecided product/privacy semantic question; no cross-request orchestration is approved or claimed.
- PR #113 — LENOVO N5A expired Data Portability artifact cleanup — merged at `6f6988c124d66d955de61dd30c0d42f8ad577ebf` from PR head `080ce744c2acb63270b81b8812d641fd76227e11`. Required PR Quality, Full UAT, Dependency Review, both CodeQL languages, and standalone CodeQL passed. The Quality run started S3-compatible storage and passed .NET tests including S3 contracts. Post-merge main Quality run `36409469670` and Security analysis run `36409469557` passed; main-push Dependency Review was skipped.
- PR #114 — LENOVO N5B documentation reconciliation — merged at `03bb131cfb16b68dc6d0a983289511dd823223da`; it reconciled N1–N5A merged status through PR #113 and changed documentation only. PR #114 Quality, Security analysis, and Full UAT all passed before merge.
- PR #116 — LENOVO N6A Student-only target guard and atomic deletion — merged at `00f9f2044097739cd7df15cb6e78720bbe5f9902`; Student-only role invariants now guard Student-specific privileged operations and relational Student deletion is serialized/atomic. ResetDevice remains a separate follow-up observation; no schema/migration/DbContext/frontend change was included.
- PR #98 — Student Resit UI — L11 is merged.
- PR #99 — PayTabs partial-refund contract tests are merged; partial provider refund execution remains disabled.
- PR #100 — PayTabs refund pending-state hardening is merged.
- PR #101 — PayTabs refund recovery/reconciliation is merged.
- PR #102 — Resit Commerce / Payment Contract — L12 is merged.
- PR #53 is merged: Comprehensive Practice Assignment — Final Unit Practice.
- PR #57 is merged: LENOVO Admin Audit Log Filters — Slice 1.
- PR #59 is merged: LENOVO Admin Audit Log CSV Export — Slice 2.
- PR #61 is merged: ASUS Learning Aim Practice Attempt History — Slice 1.
- PR #63 is merged: LENOVO Simplify BETCCO Assignment Review Flow — Slice 1.
- PR #64 is merged: ASUS AI Practice UI Shell — Slice 1.
- PR #66 is merged: AI Practice UI Shell status reconciliation.
- PR #65 is merged: Included Evaluation Credit / Entitlement — Slice 1.
- PR #67 is merged: corrective Included Evaluation Credit handling follow-up.
- PR #69 is merged: ASUS Student Progress Intelligence — Slice 1.
- PR #70 is merged: ASUS Teacher Intervention Dashboard — Formative Signals Slice 1.
- PR #72 is merged: ASUS Evaluate My Assignment — Slice 1.
- PR #78 is merged: ASUS Admin Payout Lifecycle UI Contract — Slice 1.
- PR #77 is merged: LENOVO Resit Authorization Foundation — Slice 1.
- GitHub Secret Scanning and Push Protection are enabled; 0 open secret-scanning alerts were present at verification.
- OPEN/Draft PRs at verification: none (live GitHub query on 2026-09-28).
- No ASUS or LENOVO implementation PR was active at this snapshot. PR #102's Resit Commerce integration is merged; ASUS's broader Commerce / Entitlements planning ownership remains unchanged.
- LENOVO's Resit implementation lane L1–L13 is complete and closed; no follow-on Resit implementation branch is reserved.

These SHAs are historical coordination markers only. Re-verify them before using them operationally.

---

# ASUS

## Current Workstream

**Active ASUS implementation PR: #117 — ASUS-10E1B S3 & Data Protection Recovery Drill.** PR #78 — Admin Payout Lifecycle UI Contract — Slice 1 is merged into `main` at `3d5affe6ac3ca98bda78273f41d9bf455a51c03f`.

PR #72 — **Evaluate My Assignment — Slice 1** — is merged into `main` at `78d3d178e1923a34071215248a95cc990bd54531`.

PR #70 — **Teacher Intervention Dashboard — Formative Signals Slice 1** — is merged into `main` at `34445cdc2c1afe1f927cc006e8295fc97c310b1f`.

PR #69 — **Student Progress Intelligence — Slice 1** — is merged into `main` at `8109ba70361ba7d1d4feb6f3a5262591eabdd19a`.

PR #64 — **AI Practice UI Shell — Slice 1** — remains merged into `main` at `649b3cd9676563d64c06dc0a245e29b6b4f7c39f`.

PR #61 — **Learning Aim Practice Attempt History — Slice 1** — remains merged at `713dd95732ac44b334b6581b171d13ec1a49fb93`.

PR #53 — **Comprehensive Practice Assignment — Final Unit Practice** — remains merged at `179b4eee25a5bad0cf4d961c3d940d9044461fff`.

## ASUS Reserved Scope

ASUS-10E1B is reserved by active Draft PR #117 until merge/closure. PR #78 — Admin Payout Lifecycle UI Contract — Slice 1 and PR #75 — Student Entitlement Visibility — Slice 1 are merged and closed; Evaluate My Assignment, Student Progress Intelligence, Teacher Intervention Dashboard, Student Entitlement Visibility, and the bounded payout UI contract are closed at the implementation/CI level. The AI engine/API/RAG/persistence work remains deliberately deferred and is not an active workstream.

ASUS retains planning ownership of Commerce / Entitlements, Production Hardening, and Final UI/UX Redesign. Resit L12's paid Commerce integration is merged in PR #102; ASUS is not still implementing that slice. The original ASUS-10A audit has advanced through merged production-hardening slices: PR #106 (10B Production Admin Bootstrap), PR #108 (10C Production S3 HTTPS Guard), PR #109 (10D1 Legacy Quiz Migration Preflight & Recovery Gate), and PR #111 (10E1A PostgreSQL Backup & Restore Recovery Drill). ASUS-10E1B — S3 private-object recovery + Data Protection certificate recovery — is the active Draft PR #117 and is not complete until exact-head CI/review passes and the PR merges. After that, 10E2 covers monitoring/alerts/incident runbooks, 10F covers immutable release promotion, and 10G remains conditional on live commerce launch scope. Refund → Course Access remains a product-policy decision and must not be implemented implicitly. Before starting any roadmap item, ASUS must run a fresh preflight against latest `main`, all OPEN/Draft PRs, changed files, CI, and review threads.

## ASUS Current Completion Sequence

PR #69 completion is closed at the implementation/CI level: required PR Quality #198, Full UAT Matrix #88, and Security analysis #200 were green before merge; post-merge `main` Quality #199 and Security analysis #201 are green.

PR #70 completion is closed at the implementation/CI level: required PR Quality #200, Full UAT Matrix #89, and Security analysis #202 were green before merge; post-merge `main` Quality #201 and Security analysis #203 are green.

PR #72 completion is closed at the implementation/CI level: required PR Quality #204, Full UAT Matrix #91, and Security analysis #206 were green before merge; post-merge `main` Quality #205 and Security analysis #207 are green. Evaluate My Assignment is no longer an active or reserved implementation scope.

PR #75 completion is closed at the implementation/CI level: required PR Quality #209, Full UAT Matrix #94, and Security analysis #211 were green before merge; post-merge `main` Quality #211 and Security analysis #213 are green. Student Entitlement Visibility is no longer an active implementation scope.

Production-hardening completion is current through:
- PR #106 — ASUS-10B Production Admin Bootstrap — merged; repository P0-01 bootstrap implementation is closed.
- PR #108 — ASUS-10C Production S3 HTTPS Guard — merged; repository P1-05 transport/configuration guard is closed.
- PR #109 — ASUS-10D1 Legacy Quiz Migration Preflight & Recovery Gate — merged; repository migration-safety gate is implemented, while external retention/backup evidence remains separate.
- PR #111 — ASUS-10E1A PostgreSQL Backup & Restore Recovery Drill — merged; repository PostgreSQL recovery is verified in CI, while external provider recovery, S3 object recovery, Data Protection certificate recovery, RPO/RTO/retention, and production restore evidence remain open.

## ASUS Planned Roadmap

These items are treated as ASUS-owned planning scope unless coordination explicitly changes ownership:

1. Commerce / Entitlements
2. Production Hardening
3. Final UI/UX Redesign

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

**No active LENOVO implementation PR at this snapshot.** Resit L1–L13, N1–N3, N5A, and N6A are complete and merged; N4 and N5 are read-only audits. N6A merged in PR #116 at `00f9f2044097739cd7df15cb6e78720bbe5f9902`. The current merged Resit scope remains separate from historical Retake and normal Resubmission. No next Resit lane or automatic Privacy implementation branch is reserved.

The N4 TaskType audit records current scoped-Evaluation derivation from `RubricTemplate.TaskTypeId` while leaving canonical ownership unresolved; it does not approve AssessmentDefinition/AssessmentScope ownership or a schema change. N5 leaves same-subject Rectification × Erasure/Concealment precedence as a product/privacy decision. N2's same-request PostgreSQL locking is implemented; no cross-request orchestration or subject-wide lock requirement is reserved.

PR #65 — Included Evaluation Credit / Entitlement — Slice 1 is merged into `main` at `29bacc0de0a4faeec5125edffa8c04f6a2bb045e`. PR #67 — corrective Included Evaluation Credit handling — is merged at `7ddb361bfff2f570f7cb4035f7bafe253213a79a` and closes the recorded follow-up for duplicate-Unit credits across two paid enrollments in one payment, undefined numeric CriterionAchievement values, and the Student credit-check retry path. No active Included Evaluation Credit follow-up remains recorded at this snapshot.

PR #57 — **Admin Audit Log Filters — Slice 1** — is merged into `main` at `f57726607e8ac3a0c40c1bbbcf18ab3dd5705d4f`.

PR #59 — **Admin Audit Log CSV Export — Slice 2** — is merged into `main` at `a0684ce0e65027c45c860e0ebf3db332263c8a0d`.

PR #63 — **Simplify BETCCO Assignment Review Flow — Slice 1** — is merged into `main` at `11a7c5fd4dc606c222236947dd8292886f9302ea`; new Pearson-style Retake creation/authorization is retired in favor of the advisory BETCCO review flow, while historical Retake records remain readable/completable.

The merged Admin Audit Log scope now includes bounded filtering plus bounded/minimized CSV export. Repository Secret Scanning and Push Protection verification is also complete with both protections enabled and 0 open secret-scanning alerts at verification.

## LENOVO Candidate Work

These are candidates only, not automatically active/reserved:

- additional ASSESS accommodations beyond PR #74 only when separately evidenced and scoped
- security / repository hardening follow-ups
- Privacy / Compliance follow-ups
- independent Admin / Operations workflows

Before selecting any candidate, run the mandatory preflight and check ASUS active/reserved scope.

## LENOVO Must Coordinate Before Editing

LENOVO has no active implementation PR at this snapshot. Resit L1–L13 and the N1–N3 implementation slices are merged; N4 and N5 were read-only; N5A is merged. No follow-on Resit lane or Privacy implementation branch is reserved. Any future work must be separately evidenced and scoped after the mandatory preflight. Do not modify Commerce / Entitlements, payment/refund/access logic, or ASUS-reserved roadmap files without explicit coordination.

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
