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

- `main`: `0bea28b9d99c41345406fdddf416d885076535e1`
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
- OPEN implementation PRs: none.
- ASUS and LENOVO have no active implementation PR at this snapshot.

These SHAs are historical coordination markers only. Re-verify them before using them operationally.

---

# ASUS

## Current Workstream

**No active ASUS implementation PR at this snapshot.** PR #78 — Admin Payout Lifecycle UI Contract — Slice 1 is merged into `main` at `3d5affe6ac3ca98bda78273f41d9bf455a51c03f`.

PR #72 — **Evaluate My Assignment — Slice 1** — is merged into `main` at `78d3d178e1923a34071215248a95cc990bd54531`.

PR #70 — **Teacher Intervention Dashboard — Formative Signals Slice 1** — is merged into `main` at `34445cdc2c1afe1f927cc006e8295fc97c310b1f`.

PR #69 — **Student Progress Intelligence — Slice 1** — is merged into `main` at `8109ba70361ba7d1d4feb6f3a5262591eabdd19a`.

PR #64 — **AI Practice UI Shell — Slice 1** — remains merged into `main` at `649b3cd9676563d64c06dc0a245e29b6b4f7c39f`.

PR #61 — **Learning Aim Practice Attempt History — Slice 1** — remains merged at `713dd95732ac44b334b6581b171d13ec1a49fb93`.

PR #53 — **Comprehensive Practice Assignment — Final Unit Practice** — remains merged at `179b4eee25a5bad0cf4d961c3d940d9044461fff`.

## ASUS Reserved Scope

No active ASUS implementation branch is reserved at this snapshot. PR #78 — Admin Payout Lifecycle UI Contract — Slice 1 and PR #75 — Student Entitlement Visibility — Slice 1 are merged and closed; Evaluate My Assignment, Student Progress Intelligence, Teacher Intervention Dashboard, Student Entitlement Visibility, and the bounded payout UI contract are closed at the implementation/CI level. The AI engine/API/RAG/persistence work remains deliberately deferred and is not an active workstream.

ASUS retains planning ownership of Commerce / Entitlements, Production Hardening, and Final UI/UX Redesign. Its immediate next action is a fresh read-only Commerce / Entitlements gap analysis on latest `main`. Refund → Course Access remains a product-policy decision and must not be implemented implicitly. Before starting any roadmap item, ASUS must run a fresh preflight against latest `main`, all OPEN/Draft PRs, changed files, CI, and review threads.

## ASUS Current Completion Sequence

PR #69 completion is closed at the implementation/CI level: required PR Quality #198, Full UAT Matrix #88, and Security analysis #200 were green before merge; post-merge `main` Quality #199 and Security analysis #201 are green.

PR #70 completion is closed at the implementation/CI level: required PR Quality #200, Full UAT Matrix #89, and Security analysis #202 were green before merge; post-merge `main` Quality #201 and Security analysis #203 are green.

PR #72 completion is closed at the implementation/CI level: required PR Quality #204, Full UAT Matrix #91, and Security analysis #206 were green before merge; post-merge `main` Quality #205 and Security analysis #207 are green. Evaluate My Assignment is no longer an active or reserved implementation scope.

PR #75 completion is closed at the implementation/CI level: required PR Quality #209, Full UAT Matrix #94, and Security analysis #211 were green before merge; post-merge `main` Quality #211 and Security analysis #213 are green. Student Entitlement Visibility is no longer an active implementation scope.

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

**No active LENOVO implementation PR at this snapshot.** PR #77 — Resit Authorization Foundation — Slice 1 is merged into `main` at `0bea28b9d99c41345406fdddf416d885076535e1`; CourseReviewer-only eligibility/authorization, one lifetime authorization per original, historical-Retake/Resit-chain and active-appeal blockers, revoke-before-activation, staff-only rationale, audit evidence, additive persistence, and PostgreSQL-backed constraints are complete. Required PR Quality, Full UAT Matrix, and Security analysis were green before merge; post-merge `main` Application quality and both CodeQL jobs are green.

LENOVO's next planning lane is Resit Activation / `EvaluationRequest` Lifecycle. It must begin with a fresh read-only preflight and analysis/design of activation from the merged authorization foundation, new-request linkage, fresh evidence/authenticity, evaluator assignment, single final advisory review, result/history preservation, and the Commerce handoff boundary. LENOVO must not take Commerce / Entitlements, payment/refund/access logic, or other ASUS-reserved roadmap work. If future Resit UI work needs a shared file such as `frontend/src/features/student/student-area.tsx`, an overlap review is required before editing.

PR #65 — Included Evaluation Credit / Entitlement — Slice 1 is merged into `main` at `29bacc0de0a4faeec5125edffa8c04f6a2bb045e`. PR #67 — corrective Included Evaluation Credit handling — is merged at `7ddb361bfff2f570f7cb4035f7bafe253213a79a` and closes the recorded follow-up for duplicate-Unit credits across two paid enrollments in one payment, undefined numeric CriterionAchievement values, and the Student credit-check retry path. No active Included Evaluation Credit follow-up remains recorded at this snapshot.

PR #57 — **Admin Audit Log Filters — Slice 1** — is merged into `main` at `f57726607e8ac3a0c40c1bbbcf18ab3dd5705d4f`.

PR #59 — **Admin Audit Log CSV Export — Slice 2** — is merged into `main` at `a0684ce0e65027c45c860e0ebf3db332263c8a0d`.

PR #63 — **Simplify BETCCO Assignment Review Flow — Slice 1** — is merged into `main` at `11a7c5fd4dc606c222236947dd8292886f9302ea`; new Pearson-style Retake creation/authorization is retired in favor of the advisory BETCCO review flow, while historical Retake records remain readable/completable.

The merged Admin Audit Log scope now includes bounded filtering plus bounded/minimized CSV export. Repository Secret Scanning and Push Protection verification is also complete with both protections enabled and 0 open secret-scanning alerts at verification.

## LENOVO Candidate Work

These are candidates only, not automatically active/reserved:

- Resit Activation / `EvaluationRequest` Lifecycle — next LENOVO planning lane; read-only analysis/design first
- additional ASSESS accommodations beyond PR #74 only when separately evidenced and scoped
- security / repository hardening follow-ups
- Privacy / Compliance follow-ups
- independent Admin / Operations workflows
- repository status/documentation reconciliation

Before selecting any candidate, run the mandatory preflight and check ASUS active/reserved scope.

## LENOVO Must Coordinate Before Editing

LENOVO has no active implementation branch at this snapshot. Resit Authorization Foundation is complete through PR #77; its next planning lane is Resit Activation / `EvaluationRequest` Lifecycle. Run the mandatory preflight and complete analysis/design before reserving an implementation branch. Do not modify Commerce / Entitlements, payment/refund/access logic, or ASUS-reserved roadmap files without explicit coordination.

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
