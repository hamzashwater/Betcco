# BETCCO Project Status

## Metadata

- Last updated: 2026-09-15
- Verified implementation baseline SHA: `f4b1b737d7d9d5a2f022cbaa87216cd7c38bf897`
- Status generated/verified against origin/main: `f4b1b737d7d9d5a2f022cbaa87216cd7c38bf897`
- Baseline branch used for status generation: `docs/status-after-teacher-navigation`
- Working tree state during status generation: clean
- Latest verified CI state: GREEN for PR #8 at feature head `e3b80735af378c2d9541e401aa6288efd7594295` — Application quality, Dependency review, CodeQL (csharp), and CodeQL (javascript-typescript) completed successfully.

The embedded SHA is a verification baseline, not a permanent current repository HEAD. Every future handoff session must verify the live `main` SHA directly with Git.

## Last Merged Task

- Task: Teacher Course Workspace Navigation
- Merge/commit SHA: `f4b1b737d7d9d5a2f022cbaa87216cd7c38bf897`
- Pull Request: #8
- Outcome: Added responsive teacher course-workspace navigation with stable section anchors/deep links, active navigation state, mobile overflow handling, and usable sticky review/sidebar behavior. This is a scoped navigation and accessibility slice, not completion of the broader Teacher UX roadmap.
- Verification evidence: English LTR and Arabic RTL desktop/mobile browser validation passed, including keyboard accessibility, deep-link reload/history behavior, sticky positioning, and existing editor usability. Focused and frontend validation passed, and Application quality, Dependency review, CodeQL (csharp), and CodeQL (javascript-typescript) completed successfully.

## Completed

- Git and repository engineering baseline — merged through `8f290c2`, `55668f1`, and `a579895`.
- Frontend dependency security remediation — merged in `fc5e20d`.
- Next.js route type-generation fix — merged in `d8649d5`.
- Durable private-storage foundation — merged in `3bad612`.
- Teacher Course Workspace Navigation — merged through PR #8 in `f4b1b73`.

These entries are merged repository evidence only; new behavior changes still require targeted validation and review.

## Technical Core Complete

### BTEC assessment correctness core

Done: Main contains the versioned criterion/rule and qualification snapshot foundations, authenticity declarations, authorised resubmission records, internal-verification sampling, appeals, and structured assessment-audit export documented in the implementation record.

Remaining: The formal visual PDF reporting slice is not verified as complete on `main`; the active related feature work remains unmerged and must not be treated as complete.

### Privacy and compliance workflow core

Done: Main contains bounded privacy-rights requests, append-only marketing-consent evidence, and the restricted security-incident workflow with operational deadlines and human legal-review gates.

Remaining: Retention policy decisions, external notification execution, and final legal/UAT validation remain outside the verified technical core.

## Foundation Complete

### Private storage

Done: Main contains private local-development storage, S3-compatible storage boundaries, durable lifecycle records, orphan handling, and protected application-mediated access.

Remaining: Production provider configuration and operational validation remain outstanding.

### Production and staging deployment

Done: Main contains `compose.deploy.yml`, `deploy.env.example`, non-root application images, controlled migrations, readiness/liveness endpoints, startup validation, and rollback guidance.

Remaining: Hosting, domain, certificate, S3, SMTP, ClamAV, monitoring, backup/restore, and production smoke validation require external configuration or execution.

## Partially Complete

### Payments and finance

Done: Main contains server-owned financial state, append-only wallet/allocation records, and payment/coupon/session-recovery foundations.

Remaining: Live payment and payout providers, JoFotara, production reconciliation, and external-provider validation remain disabled or deferred.

### Teacher and student experience

Done: Main contains BTEC result views, internal-verification and appeal workspaces, protected privacy surfaces, and the Teacher Course Workspace Navigation slice with responsive navigation, stable deep links, active state, Arabic RTL/English LTR behavior, keyboard accessibility, mobile overflow handling, and usable sticky review/sidebar behavior.

Remaining: The broader course lifecycle, learning experience, and full teacher/student UX roadmap remain incomplete.

## Active Workstreams

Live progress is tracked in OPEN Draft PRs, and repository evidence wins over conversation memory. This document remains a repository-level snapshot and may not contain every intermediate checkpoint.

Maximum active implementation workstreams: **2**

### Workstream A

Task: Formal BTEC Assessment PDF Reporting
Owner: Account 1 / Device 1
Branch: `feature/btec-assessment-pdf-report`
Pull Request: #6
Status: IN PROGRESS
Scope: BTEC assessment PDF backend/reporting and PDF-specific validation.
Reserved areas:

- `AssessmentPdfReportService`
- `QuestPdfAssessmentReportRenderer`
- `AssessmentPdfReportTests`
- PDF-specific deployment documentation

Merged into main: **NO**

### Workstream B

Last task: Teacher Course Workspace Navigation
Owner: Account 2 / Device 2
Branch: `feature/teacher-course-workspace-navigation`
Pull Request: #8
Task status: MERGED
Merged into main: **YES** — `f4b1b737d7d9d5a2f022cbaa87216cd7c38bf897`
Capacity status: AVAILABLE
Purpose: Reserved parallel capacity for one future independent task after explicit scoping.

No new Workstream B branch, owner, task, or implementation is invented here. Workstream B becomes ACTIVE only after a scoped task is selected, a dedicated branch is created, and a Draft PR records its ownership and reserved scope.

## Next Actions

- Workstream A: Continue and complete PR #6, including its required review and validation before merge.
- Workstream B capacity: AVAILABLE for one future independent task after explicit scoping; this reconciliation does not select or invent that task.

Definition of Done for each workstream: implementation is reviewed, required CI is green, its PR is merged into `main`, and this document is reconciled with the new merged state.

## Blocked

None recorded. External production configuration and validation are deferred work, not blockers for the documentation baseline.

## Do Not Reopen Without Evidence

- Git/repository baseline and governance: `8f290c2`, `55668f1`, `a579895`.
- Durable private storage foundation: `3bad612`.
- Next.js type-generation fix: `d8649d5`.
- Frontend dependency security remediation: `fc5e20d`.
- Production/Staging deployment foundation: `c9e6f36`.

Do not reopen these areas merely because a later account lacks conversation memory. Reopen only for a new, evidenced gap or a requested behavior change.

## Remaining Master Roadmap

| Area | Status |
| --- | --- |
| BTEC Assessment | TECHNICAL CORE COMPLETE |
| Authentication/Security | PARTIAL |
| Privacy/Compliance | TECHNICAL CORE COMPLETE |
| Payments/Finance | PARTIAL |
| Storage | FOUNDATION COMPLETE |
| Media/Video | NOT STARTED |
| Operations/Deployment | FOUNDATION COMPLETE |
| Teacher UX | PARTIAL |
| Student UX | PARTIAL |
| i18n/SEO/Performance/Accessibility | NOT STARTED |
| Early Warning | NOT STARTED |
| Guardian | NOT STARTED |
| Community/Formative | NOT STARTED |
| AI | NOT STARTED |
| OneRoster/LTI | NOT STARTED |
| Final UAT/Launch Hardening | PARTIAL |

## Known Risks

- Workstream A / PR #6 is unmerged and must not be represented as completed until it reaches `main` with targeted verification, review, and required CI green.
- PR #8's required CI was verified green for its merged feature head. Future workstreams must still verify their own current remote CI before claiming completion.
- Production S3, SMTP, ClamAV, Data Protection certificate, hosting, monitoring, backup/restore, payment, payout, and fiscal integrations require external configuration or validation.
- Full UAT, capacity testing, launch hardening, retention decisions, and final legal review remain outstanding.

## Important Decisions

- GitHub `main` and repository evidence are the technical Source of Truth.
- Keep one scoped task per feature/fix branch; do not perform normal feature work directly on `main`.
- BETCCO supports a maximum of two sufficiently independent active implementation workstreams, coordinated through OPEN Draft PRs.
- Draft PR descriptions are the live progress ledger; `docs/PROJECT_STATUS.md` remains a high-level merged-state snapshot.
- Do not force-push or destructively reset/clean repository state without explicit approval.
- Server-side authorization, academic decisions, financial decisions, and privacy enforcement remain the source of truth.
- Use additive, data-safe migrations and preserve historical academic and financial facts.
- Keep undecided commercial or legal integrations disabled until explicitly configured, reviewed, and validated.
- A Pull Request, engineering/Codex review, resolved blocking findings, required green CI, and final approval are required before merge.
- Updating `docs/PROJECT_STATUS.md` after merge is part of the Definition of Done.

## Engineering Workflow

`main`
→ feature/fix branch
→ implementation
→ targeted tests
→ engineering/Codex review
→ push branch
→ Pull Request
→ required CI green
→ merge to `main`
→ update `PROJECT_STATUS.md`
→ next engineer/account pulls latest `main`

## Handoff Rules

Every new ChatGPT/Codex account or developer session must:

1. Start from the latest `main`.
2. Run `git fetch origin`.
3. Run `git pull --ff-only origin main`.
4. Verify a clean working tree.
5. Read `AGENTS.md`.
6. Read `docs/PROJECT_STATUS.md`.
7. Inspect recent Git history.
8. Reconcile the documented state against current repository evidence.
9. Inspect all OPEN Draft PRs and compare their reserved areas before choosing a scoped task.

Never rely on previous account memory to determine project state.
