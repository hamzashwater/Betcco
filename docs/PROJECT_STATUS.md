# BETCCO Project Status

## Metadata

- Last updated: 2026-09-20
- Verified implementation baseline SHA: `7ab8c8ef428fbbce4724f8b94fe920b3fb9c775a`
- Status generated/verified against origin/main: `7ab8c8ef428fbbce4724f8b94fe920b3fb9c775a`
- Baseline branch used for status generation: `docs/reconcile-assessment-audit-export-status`
- Working tree state during status generation: clean
- Latest verified CI state: GREEN after PR #24 merged — Application quality, CodeQL (csharp), CodeQL (javascript-typescript), and Dependency review completed successfully.

The embedded SHA is a verification baseline, not a permanent current repository HEAD. Every future handoff session must verify the live `main` SHA directly with Git.

## Last Merged Task

- Task: Structured Assessment Audit Export Identifier Minimization
- Merge/commit SHA: `7ab8c8ef428fbbce4724f8b94fe920b3fb9c775a`
- Pull Request: #24
- Outcome: DONE. Structured BTEC assessment audit export uses a safe explicit v2 contract. Raw internal identifiers and sensitive implementation metadata are structurally excluded; academic traceability is preserved; actor-role attribution is corrected without fabricating unsupported historical RBAC precision; and deterministic SHA-256 integrity is preserved. No database migration, frontend change, or Assessment PDF change was introduced.
- Verification evidence: Required post-merge CI GREEN — Application quality, Dependency review, CodeQL, CodeQL (csharp), and CodeQL (javascript-typescript).

- Task: Student Course Player + Resume Learning
- Merge/commit SHA: `8770901ad78c172cbe0ed33e1235bfc78f739f07`
- Pull Request: #16
- Outcome: Added a server-authoritative resume/current lesson flow for the Student Course Player, with authorized deep links, saved position restoration, server-owned completion, the existing 80% video threshold, accessible previous/next navigation, and Course Hub Continue integration. EN/AR desktop/mobile/keyboard behavior and mobile overflow were validated. No migration was added.
- Verification evidence: Focused backend integration tests (33) and focused frontend tests (26) passed. Full frontend validation passed (79 tests, lint, typecheck, format, and build). Required CI passed the full backend suite (12 unit and 383 integration), frontend checks, Application quality, Dependency review, and CodeQL (csharp/javascript-typescript). English and Arabic desktop/mobile browser validation, keyboard accessibility, RTL/LTR behavior, resume persistence, protected navigation, and horizontal-overflow checks passed.

- Task: Media / Video Foundation + Secure Delivery
- Merge/commit SHA: `719b10e39b4370c709350dae64a1db80481872ed`
- Pull Request: #18
- Outcome: DONE. Existing private storage foundation reused for secure MP4/WEBM upload, safe replacement/removal lifecycle, orphan/shared-key protection, fail-closed malware/security scanning, teacher ownership enforcement, student enrollment/content authorization, private delivery, S3/local range/seek support, and CoursePlayer loading/error/retry behavior. Task 5 progress/completion behavior was preserved. No migration was added.
- Roadmap status: FOUNDATION COMPLETE. Advanced HLS/DASH/transcoding, CDN/provider integration, DRM, live streaming, captions/transcription, and advanced media analytics remain outside this foundation.
- Verification evidence: Required CI green, including frontend validation, full backend tests with PostgreSQL/S3, production build/image checks, Docker validation, Dependency review, and CodeQL (csharp/javascript-typescript).

- Task: Formal BTEC Assessment PDF Reporting
- Merge/commit SHA: `2fb3545604fb618019471076e4e0da587dfcea33`
- Pull Request: #6
- Outcome: DONE. Formal visual PDF reporting is complete on main, with persisted assignment/task, submission/evidence, assessor/internal-verifier/lead-internal-verifier/appeal-review, and academic audit/history context. Sensitive storage keys and internal user IDs are excluded, neutral/non-official BTEC wording is retained, and Arabic/English plus multipage rendering is verified across Linux/Windows font metrics. No migration was added.
- Verification evidence: Targeted Assessment PDF tests 11/11 passed; Linux QuestPDF reproduction and font-layout fix were verified; English PDF, Arabic PDF, and multipage PDF visual verification passed; required CI was green; final engineering review passed with no blocking findings.

- Task: CodeQL Slug Validation Security Remediation
- Merge/commit SHA: `9995034b6c27ef3ea27cee8264575c2667718e23`
- Pull Request: #22
- Outcome: DONE. Replaced the two CodeQL-flagged slug regex validators with one deterministic shared ASCII kebab-case validator. Both ReDoS findings are closed. The gradebook `cs/user-controlled-bypass` finding was revalidated and dismissed as a documented false positive; no production code was changed for that finding. The security remediation workstream is closed.
- Verification evidence: Post-merge Application quality, CodeQL (csharp), and CodeQL (javascript-typescript) passed; 0 remaining open CodeQL alerts.

## Completed

- Git and repository engineering baseline — merged through `8f290c2`, `55668f1`, and `a579895`.
- Frontend dependency security remediation — merged in `fc5e20d`.
- Next.js route type-generation fix — merged in `d8649d5`.
- Durable private-storage foundation — merged in `3bad612`.
- Teacher Course Workspace Navigation — merged through PR #8 in `f4b1b73`.
- Teacher Courses Management UX — merged through PR #10 in `1ba6a41`.
- Teacher Student Follow-up Workspace — merged through PR #12 in `33f14b6`.
- Student Courses Learning Hub — merged through PR #14 in `533b3f9`.
- Student Course Player + Resume Learning — merged through PR #16 in `8770901`.
- Formal BTEC Assessment PDF Reporting — merged through PR #6 in `2fb3545`.
- CodeQL slug validation security remediation — merged through PR #22 in `9995034`.
- Structured Assessment Audit Export Identifier Minimization — merged through PR #24 in `7ab8c8e`.

These entries are merged repository evidence only; new behavior changes still require targeted validation and review.

## Technical Core Complete

### BTEC assessment correctness core

Done: Main contains the versioned criterion/rule and qualification snapshot foundations, authenticity declarations, authorised resubmission records, internal-verification sampling, appeals, structured assessment-audit export, and formal visual PDF reporting. The structured audit export now uses the safe v2 contract: raw internal identifiers and sensitive implementation metadata are structurally excluded, academic traceability is preserved, actor-role attribution is corrected, unsupported historical RBAC precision is not fabricated, and deterministic SHA-256 integrity is preserved. The PDF includes assignment/task, submission/evidence, assessor/internal-verifier/lead-internal-verifier/appeal-review, and academic audit/history context; excludes sensitive storage/internal IDs; retains neutral/non-official BTEC wording; and has verified Arabic/English, multipage, and Linux/Windows font-layout compatibility with required CI green.

Remaining: No remaining item in this formal PDF reporting slice is recorded here. Broader assessment capabilities remain governed by the roadmap below.

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

Done: Main contains BTEC result views, internal-verification and appeal workspaces, protected privacy surfaces, these three Teacher slices, and one completed Student learning slice:

1. Teacher Course Workspace Navigation, with responsive navigation, stable deep links, active state, Arabic RTL/English LTR behavior, keyboard accessibility, mobile overflow handling, and usable sticky review/sidebar behavior.
2. Teacher Courses Management UX, with bilingual title search, status filters, deterministic sorting, course metadata, responsive management and compact dashboard presentations, and consistent Show all courses reset behavior.
3. Teacher Student Follow-up Workspace, with server-owned follow-up signals, a dedicated workspace, bounded complete-result server-side search/filter/sort/pagination, a compact dashboard preview, and bilingual responsive UX.
4. Student Courses Learning Hub, with a dedicated course workspace, bounded server-authoritative retrieval, bilingual search, progress filters, deterministic sorting, pagination, published-course and access enforcement, server-owned progress/completion state, safe cover and teacher-name handling, a compact dashboard preview, and bilingual responsive/accessibility validation.
5. Student Course Player + Resume Learning, with server-authoritative resume/current lesson selection, authorized deep links, saved position restoration, server-owned completion, preserved video threshold, accessible navigation, Course Hub Continue integration, and EN/AR responsive/accessibility validation.
6. Media / Video Foundation + Secure Delivery, with secure private MP4/WEBM upload, replacement/removal lifecycle handling, authorization, range/seek delivery, and resilient CoursePlayer media states. FOUNDATION COMPLETE; advanced media platform work remains outside this slice.

Remaining: Broader Teacher UX remains incomplete. Student UX remains partial: the broader Student learning lifecycle remains. The broader course lifecycle and learning experience remain incomplete.

## Active Workstreams

Live progress is tracked in OPEN Draft PRs, and repository evidence wins over conversation memory. This document remains a repository-level snapshot and may not contain every intermediate checkpoint.

Maximum active implementation workstreams: **2**

### Workstream A

Task: Formal BTEC Assessment PDF Reporting
Owner: Lenovo
Branch: `feature/btec-assessment-pdf-report`
Pull Request: #6
Status: MERGED / CLOSED
Scope: BTEC assessment PDF backend/reporting and PDF-specific validation.
Reserved areas:

- `AssessmentPdfReportService`
- `QuestPdfAssessmentReportRenderer`
- `AssessmentPdfReportTests`
- PDF-specific deployment documentation

Merged into main: **YES** — `2fb3545604fb618019471076e4e0da587dfcea33`
Capacity status: AVAILABLE

### Workstream B

Last task: Media / Video Foundation + Secure Delivery
Owner: ASUS
Branch: `feature/media-video-foundation`
Pull Request: #18
Task status: MERGED
Merged into main: **YES** — `719b10e39b4370c709350dae64a1db80481872ed`
Capacity status: AVAILABLE
Purpose: Available for one future explicitly scoped independent task.

No new Workstream B branch, owner, task, or implementation is invented here. Workstream B becomes ACTIVE only after a scoped task is selected, a dedicated branch is created, and a Draft PR records its ownership and reserved scope.

## Next Actions

- Workstream A / Lenovo capacity: AVAILABLE after PR #6 merged into main; this reconciliation does not select or invent a new task.
- Workstream B / ASUS capacity: AVAILABLE for one future explicitly scoped independent task; this reconciliation does not select or invent that task.
- Task 6: DONE — Media / Video Foundation + Secure Delivery. PR #18 merged with required CI green.
- Task 7: NOT STARTED.

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
| Media/Video | FOUNDATION COMPLETE |
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

- PR #6 is merged into `main` at `2fb3545604fb618019471076e4e0da587dfcea33` with targeted Assessment PDF verification, required CI green, and final engineering review passed; the formal BTEC assessment PDF reporting slice is complete.
- PR #16 is merged into `main` at `8770901ad78c172cbe0ed33e1235bfc78f739f07` with required CI green; the Student Course Player + Resume Learning task is complete.
- PR #18 is merged into `main` at `719b10e39b4370c709350dae64a1db80481872ed` with required CI green; Media/Video is FOUNDATION COMPLETE. Advanced media work remains deferred as documented above.
- PR #22 is merged into `main` at `9995034b6c27ef3ea27cee8264575c2667718e23`; both ReDoS CodeQL findings are closed, the gradebook finding is dismissed as a documented false positive, 0 CodeQL alerts remain open, and the security remediation workstream is closed.
- PR #24 is merged into `main` at `7ab8c8ef428fbbce4724f8b94fe920b3fb9c775a`; assessment-audit export identifier minimization is DONE, the safe v2 contract excludes raw internal identifiers and sensitive implementation metadata, actor-role attribution is corrected, and required post-merge CI is GREEN.
- PR #14's required CI was verified GREEN for feature head `431d12efe70236872173f66677d88d484b4348b4`: Application quality, Dependency review, CodeQL (csharp), and CodeQL (javascript-typescript) completed successfully. Future workstreams must still verify their own current remote CI before claiming completion.
- Production S3, SMTP, ClamAV, Data Protection certificate, hosting, monitoring, backup/restore, payment, payout, and fiscal integrations require external configuration or validation.
- Full UAT, capacity testing, launch hardening, retention decisions, and final legal review remain outstanding.

### Remaining P0 items

- PR #20 / full-stack UAT remains open and unresolved.
- Reasonable-adjustment and extension workflow remains unresolved.
- Retake/resit policy and workflow remains unresolved.
- Staff MFA decision and enforcement remains unresolved.
- Secret-scanning verification remains unresolved.
- External BTEC/specification/policy dependencies remain unresolved.
- Payments, legal, and accounting external blockers remain unresolved.

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
