# BETCCO Project Status

## Metadata

- Last updated: 2026-09-25
- Verified implementation baseline SHA: `231efd020d2e8cd1d9cf8934edc288586c560024`
- Status verified against origin/main: `231efd020d2e8cd1d9cf8934edc288586c560024`
- OPEN / Draft PRs at verification: PR #53 — ASUS Comprehensive Practice Assignment — Final Unit Practice.
- Parallel workstream coordination is persisted in `docs/WORKSTREAM_COORDINATION.md` and must be rechecked against live GitHub before implementation.

The embedded SHA is a verification baseline, not a permanent current repository HEAD. Every future handoff session must verify the live `main` SHA directly with Git.

## Recently Merged Account, Security, Learning, and Coordination Work

- PR #48 — Account/Profile/Security UI Phase 1 merged at `66b832b5d7b1bc1de94757504c2ea5067375365c`; Student, Teacher, and Admin profile/security UX now uses the existing account/security APIs with EN/AR and responsive coverage.
- PR #49 — Legacy Quiz System removal merged at `b656e586dea3f57a3ccee863f16ffc25cf116769`; active Quiz functionality was removed while historical lesson/progress data was preserved through the archived legacy lesson type.
- PR #50 — Account Security Phase 2 merged at `89240b64027826f8bb48b76f3bdee28038120b82`; authenticated password change, secure Student email change, Admin-managed Teacher/SupportAdmin identity updates, logout-other-sessions, SupportAdmin provisioning/freeze authority, separate SupportAdmin-authority revocation, audit coverage, and EN/AR UI are implemented.
- PR #51 — Learning Aim Practice Flow Slice 1 merged at `b390a4e114e443839305f7aada19d397887ded8d`; formative Practice Activity, Training P/M/D, Learning Aim progression/completion, Course Player integration, and related migration/tests are implemented separately from formal ASSESS.
- PR #52 — Staff MFA Enforcement Slice 1 merged at `7929f631aa33b3e98f332905943cd9f1eab7d7f9`; mandatory MFA is server-enforced for Admin, SystemAdmin, SupportAdmin, and FinanceAdmin, including restricted enrollment state and session/SecurityStamp handling.
- PR #54 — Staff MFA Recovery Codes Slice 1 merged at `3693585d44ab43f7c591771e221b7be4cde1a4ea`; Identity recovery codes provide one-time presentation, single-use login, regeneration, and password-plus-unused-code authenticator reset with session revocation and mandatory Staff re-enrollment.
- PR #55 — ASUS/LENOVO workstream coordination merged at `231efd020d2e8cd1d9cf8934edc288586c560024`; `docs/WORKSTREAM_COORDINATION.md` now records ownership, reserved scope, preflight, overlap, and handoff rules.

## Recently Merged Academic Work (PR #47)

- Task: Pearson academic catalogue authority and Admin programme planning — Slice 1.
- Merge/commit SHA: `17dc6c8dd0fcb22ed53fc956eba416b7fce32142`.
- Status: MERGED into `main` through PR #47. The academic design, migration, and validation details below are retained from that workstream.
- Design: Trusted seed imports 101 exact Unit numbers and English titles from four Pearson BTEC International Level 2/3 IT and Business specifications, with `PearsonOfficial` provenance and source URLs. New Admin records are `AdminCustom`; activating a custom Unit publishes and locks its identity. Pearson academic identity is immutable through Admin authoring. Existing `Specialization` is reused, and new qualifications require a valid BTEC specialization. Admin can manage specializations and grades without startup seed resetting those edits.
- Initial taxonomy seed creates only Information Technology and Business specializations. Engineering, Hospitality, and future sectors are SystemAdmin-creatable; previously created Engineering rows are retained. The 101 supported Pearson Units now have distinct English canonical and BETCCO-localized Arabic titles. The Arabic wording is platform localization, not a claim of official Pearson Arabic publication. The seed replaces only blank or English-copied Arabic placeholders and preserves distinct administrator-edited Arabic titles, Unit IDs, codes, English titles, and source references.
- Localization: catalogue and planning APIs expose persisted Arabic and English qualification/Unit names, while locale-aware API services select the student-facing language. Admin and Teacher UI selectors choose from those API fields. The Admin catalogue shows both Unit titles and allows SystemAdmin to correct the BETCCO Arabic display title without changing Pearson English identity. Missing translations use a controlled opposite-language fallback.
- Planning: `DeliveryPlan` now binds qualification version, academic year, and grade, with specialization derived from the qualification. Grade-scoped uniqueness is `(QualificationVersionId, AcademicYearId, GradeId)`; legacy null-grade plans retain their former version/year uniqueness. Entries retain term binding and ordering; mapped entries cannot be removed or moved while course modules reference them. No grade/term distribution is seeded.
- Teacher authoring: new BTEC drafts require an active Admin plan; grade, specialization, and qualification version are derived or checked on the server. New BTEC `CourseModule` rows require a plan entry; canonical Unit code/title and term come from that entry. Non-BTEC modules remain free form. Legacy BTEC courses and their existing modules remain readable, and existing explicit reconciliation is limited to legacy courses.
- Legacy data: nullable links and `Unknown` source preserve historical qualifications, plans, courses, modules, lessons, progress, enrollments, assignments, submissions, and gradebook data. No title-based mapping or destructive backfill occurs.
- Migration: `20260923183826_AddAcademicProgrammeAuthority` adds source and nullable specialization/grade/plan/entry bindings, restrictive foreign keys, and filtered unique indexes. Its Up path is additive; rollback drops the new columns and would discard values created after this migration, so rollback requires separate data planning.
- Local validation: the original Slice passed focused backend integration/regression tests 27/27 (including full empty PostgreSQL migration chain and EF pending-model check) and backend unit tests 34/34. This follow-up passed 36/36 affected backend integration tests including PostgreSQL, frontend Vitest 123/123, Release build, .NET format verification, frontend typecheck/lint/Prettier, and Next.js production build. Mocked-API browser checks passed 12/12 for Admin catalogue/planning, Teacher and Student Units, English desktop, Arabic RTL, and 390px mobile with no page errors or horizontal overflow. They did not exercise a live authenticated backend.
- Deferred: production migration and smoke verification, manual reconciliation of ambiguous historical modules, user-managed PR/remote CI/review/merge, and any later physical cleanup of legacy columns.

## Recent Merged Tasks

- Task: COURSEMODULE → UNITDEFINITION canonical LEARN unit migration.
- Merge/commit SHA: `641ab55f695a87d380a59c288fbbc3fcc1bbd184`
- Pull Request: [#46 — canonical LEARN Unit migration](https://github.com/hamzashwater/Betcco/pull/46)
- Outcome: MERGED into `main`. Post-merge Quality and Security analysis passed. `UnitDefinition` became the academic Unit authority while `CourseModule` stayed the per-course delivery container. The additive migration `20260923155147_AddCanonicalLearnUnitLinks` preserved legacy academic and delivery history with nullable links and no title-based backfill.

- Task: Academic Year / Term / Delivery Plan — Slice 1
- Merge/commit SHA: `e48f727426ec649c3d9b9792d26d12a435afc846`
- Pull Request: [#45 — feat: add academic year term and delivery planning](https://github.com/hamzashwater/Betcco/pull/45)
- Outcome: MERGED. `DeliveryPlanEntry` references canonical `UnitDefinition` under `QualificationVersion`; the additive migration `20260923142325_AddAcademicDeliveryPlanning` is part of `main`. Delivery planning does not automatically create courses or delivery modules.

- Task: SLA / Expected Completion Workflow — Slice 1
- Merge/commit SHA: `708326e4bd55e59d981238e1d5dce68e4a7fa5dd`
- Pull Request: [#43 — feat: add assessment expected completion workflow](https://github.com/hamzashwater/Betcco/pull/43)
- Outcome: DONE. Added server-owned expected-completion oversight for active ASSESS requests under existing CourseReviewer authority. Each EvaluationRequest has append-only expected-completion revision history with actor, timestamp, bounded private reason, and a unique per-request revision sequence. The coordination queue derives `NotSet`, `OnTrack`, and `Overdue` on the server from the latest revision and supports bounded filtering without exposing student identity, comments, evidence, results, or the private operational reason. No fixed BTEC/Pearson SLA duration, working-day calendar, holiday rule, automatic reassignment, or academic consequence was invented. Retakes remain independent EvaluationRequests with independent targets; `ResubmissionAuthorization.DueAtUtc`, IV/LIV, appeal, and Retake-authorization semantics remain unchanged.
- Migration: `20260923125104_AddEvaluationExpectedCompletionRevisions` is additive, performs no historical target backfill or destructive rewrite, uses restrictive foreign keys, and preserves existing requests as `NotSet`.
- Verification evidence: 18 related backend tests, 3 focused frontend tests, Release build, formatting, typecheck, lint, production frontend build, and English/Arabic/390px browser checks passed locally. PR checks passed: Application Quality, Full-stack browser UAT, Dependency Review, CodeQL C#, and CodeQL JavaScript/TypeScript. Application Quality applied migrations to an empty PostgreSQL database and ran PostgreSQL-backed tests successfully.

- Task: Assessment Coordinator capabilities — Slice 1
- Merge/commit SHA: `62e5e5a1d9158c11104c3496e088a7ead36a7fa5`
- Pull Request: [#40 — feat: add assessment coordinator oversight queue](https://github.com/hamzashwater/Betcco/pull/40)
- Outcome: DONE. Added a bounded, read-only ASSESS coordination queue under the existing `CourseReviewer` authority. The queue exposes active request status, canonical Qualification/Unit context, current evaluator, Retake marker, and assignment blocker/availability state without exposing learner identity, learner comments, learner evidence, or assessment results. Manual assignment continues through the existing server-authoritative evaluator-specialism path and final eligibility recheck. No new role, database migration, Retake/Resubmission rule change, or IV/LIV authority change was introduced. The final architecture keeps HTTP concerns in `Betcco.Api`, contracts in `Betcco.Application`, and EF/query orchestration in `Betcco.Infrastructure`.
- Verification evidence: Focused backend tests, Release build, .NET format verification, frontend unit/browser verification, and `git diff --check` passed. After synchronization with PR #41, required PR checks passed: Application quality, Full-stack browser UAT, Dependency review, CodeQL C#, and CodeQL JavaScript/TypeScript.

- Task: CI reproducibility hardening — Slice 1
- Merge/commit SHA: `8ec295f071a2711486ecc2c8827c332eac0a60c8`
- Pull Request: [#41 — chore: pin CI dependencies for reproducibility](https://github.com/hamzashwater/Betcco/pull/41)
- Outcome: DONE. Pinned moving GitHub Actions references and direct workflow container images in `.github/workflows/quality.yml`, `.github/workflows/security.yml`, and `.github/workflows/full-uat.yml` to upstream-verified immutable commit SHAs or image digests. Workflow names, jobs, triggers, permissions, commands, coverage, browser matrix, database/storage behavior, and test semantics were preserved. No application code, schema, migrations, production configuration, or product behavior changed.
- Verification evidence: `actionlint 1.7.12` and `git diff --check` passed; reversing only the pins reproduced the prior workflow content. PR checks passed after the WebKit Full UAT retry: Application quality, Full-stack browser UAT, Dependency review, CodeQL C#, and CodeQL JavaScript/TypeScript.

- Task: Evaluator-specialism routing — Slice 1
- Merge/commit SHA: `8bce145f94cc1dc87ef7bda1aef8eae25da2d2f3`
- Pull Request: [#38 — Evaluator Unit specialism routing — Slice 1](https://github.com/hamzashwater/Betcco/pull/38)
- Outcome: DONE. `EvaluatorUnitSpecialism` grants eligibility at `UnitDefinition` level, with grant/revoke/history managed by SystemAdmin and manual assignment retained for CourseReviewer. Eligible candidates are server-derived, and assignment rechecks eligibility; the evaluator must have an eligible Teacher or Assessor role and must not be frozen. Each new `EvaluatorAssignment` stores the exact grant used. The grant reference is nullable for historical assignments; revocation affects future assignments or reassignments without rewriting historical evidence, and later regrant is allowed. Canonical academic resolution checks `AssessmentScope` → `AssessmentDefinition` → `UnitDefinition` and `QualificationVersion` consistency. Historic unit-less requests remain unmapped and receive no backfill; they cannot be assigned through this flow until canonical academic mapping exists. The legacy unscoped assessment creation endpoint now requires canonical scoped creation. Retakes follow the same Unit-specialism rule; Retake policy, Resubmission, IV/LIV eligibility and independence were not redesigned. LEARN and ASSESS remain separate. No automatic routing, load balancing, ranking, or AI assignment was introduced. Migration `20260923081757_AddEvaluatorUnitSpecialisms` is additive: it creates `EvaluatorUnitSpecialisms`, adds nullable `EvaluatorUnitSpecialismId` to `EvaluatorAssignments`, enforces one active grant with a filtered unique index, and uses restrictive foreign keys. There is no historical backfill or destructive data rewrite. Production migration and production smoke verification have not been executed.
- Verification evidence: PostgreSQL migration test 1/1, PostgreSQL evaluator-routing tests 3/3, related backend regression group 21/21, and focused frontend tests 8/8 passed. Backend Release build, `dotnet format`, frontend typecheck, lint, and production build passed. English desktop, Arabic RTL desktop, and 390px mobile browser verification passed; student direct assignment and CourseReviewer access to SystemAdmin specialism management were rejected. PR checks passed: Quality, Security analysis, and Full UAT Matrix. Post-merge checks passed: Quality and Security analysis on current main.

- Task: Retake Slice 1 — authorised paid assessment retakes
- Merge/commit SHA: `717ddd5b81e2825cdf45dda80bfb4fcac7d7da93`
- Pull Request: [#36 — feat: add authorised paid assessment retakes](https://github.com/hamzashwater/Betcco/pull/36)
- Outcome: DONE. Retake is distinct from Resubmission and creates a new `EvaluationRequest` linked to the immutable original. A server-verified Lead Internal Verifier approval is required; `RetakeAuthorization` retains the private staff rationale and approval history. One Retake is allowed per original assessment, Retakes cannot chain, and Retake-only `AssessmentDefinition` / `AssessmentScope` records are excluded from normal student assessment creation. Only eligible unmet Pass criteria are covered; Merit/Distinction criteria are prohibited and the result is Pass-only. Files, authenticity, evaluator results, audit history, and payment lifecycle are independent, while original financial records remain unchanged. Slice 1 uses the server-owned standard assessment price and the client cannot choose it. Migration `20260922182302_AddAssessmentRetakes` is additive, has no historical backfill or destructive operation, preserves the nullable original/Retake relationship, adds Retake authorization and `IsRetakeOnly`, protects uniqueness, and uses `RESTRICT` foreign keys. Production migration and production smoke verification have not been executed.
- Verification evidence: Retake PostgreSQL tests 4/4 and related PostgreSQL/regression suite 23/23 passed; backend Release build passed with 0 warnings/errors; frontend Vitest 107/107, format, typecheck, lint, and production build passed; migration SQL safety review and `git diff --check` passed. Browser verification covered English desktop, Arabic RTL desktop, 390px mobile, Lead Internal Verifier authorization, unauthorized Assessor rejection, hiding Retake-only scopes from normal student creation, private rationale privacy, and relevant layout/overflow checks. PR checks passed: Application Quality, Full-stack browser UAT, Dependency Review, CodeQL C#, and CodeQL JavaScript/TypeScript. Post-merge main checks passed: Quality and Security analysis.

- Task: Reasonable Adjustments Slice 1 — student-specific LEARN coursework deadline extensions
- Merge/commit SHA: `ab4ace6ef4b1774f3c752c7b7bd5e688531330f1`
- Pull Request: [#34 — feat: add student-specific coursework deadline extensions](https://github.com/hamzashwater/Betcco/pull/34)
- Outcome: DONE. `CourseAssignmentDeadlineExtension` records teacher grants and revocations with retained history; a partial unique index prevents multiple active extensions for one student and assignment. `CourseAssignmentDeadlineResolver` supplies the effective student deadline without changing other students' assignment deadline. Start Submission, Submit, student dashboard/calendar, reminders, and Teacher Analytics use the effective deadline where applicable. Teachers can grant, review history, and revoke in the UI; students see their adjusted deadline without the private administrative reason. Migration `20260922114919_AddCourseAssignmentDeadlineExtensions` is additive, with no backfill or destructive schema operation. `EvaluationRequest` and `ResubmissionAuthorization.DueAtUtc` semantics were not changed; LEARN and ASSESS remain separate.
- Verification evidence: Focused PostgreSQL and backend regression tests 32/32, backend Release build, frontend tests 6/6, format/typecheck/lint/production build, English desktop, Arabic RTL desktop, and 390px mobile browser checks passed. Post-merge Quality and Security analysis succeeded on main. Production migration and production smoke verification have **not** been executed.

- Task: Versioned Academic Authoring + Assessment Definition Mapping
- Merge/commit SHA: `689b87280ecf27b1d4f825092e8f814066e9ccd4`
- Pull Request: #30
- Outcome: DONE. Added canonical versioned academic authoring under `QualificationVersion` → `UnitDefinition`, with `LearningAimDefinition`, `AssessmentCriterionDefinition`, controlled Pass/Merit/Distinction bands, explicit `AssessmentDefinition` aim and criterion mappings, source/provenance references, publication and immutability guards, rubric/qualification-version compatibility validation, and canonical criterion-code compatibility validation. Added the Admin Academic Catalogue API and bilingual English/Arabic Admin UI with real browser verification. The additive migration introduced the academic authoring and mapping tables without historic backfill or destructive data rewrite. LEARN remains separate: existing `CourseModule` / `BtecLearningAim` is unchanged. ASSESS remains rooted at `EvaluationRequest`; the new catalogue supports future ASSESS scope selection and snapshots.
- Verification evidence: Targeted backend integration/regression tests 30/30, frontend tests 95/95, backend build, frontend format/typecheck/lint/build, migration SQL review, real browser English/Arabic desktop and Arabic mobile verification, and post-merge Application quality and CodeQL checks passed. Dependency review was skipped on push as expected; the PR check passed before merge.

- Task: ASSESS Slice 3 — AssessmentScope selection + immutable academic snapshot
- Merge/commit SHA: `5321baa7f64eb06c6affd9e0bac94f28a52dc825`
- Pull Request: #32
- Outcome: DONE. New ASSESS requests can select a canonical `AssessmentScope`; the server persists the scope identity and creates an immutable academic snapshot containing server-derived grade, specialization, rubric, task type, qualification version, criteria, and rule-set data. Legacy requests remain compatible when the nullable bridge is absent, and scope creation does not require CourseModule enrollment. LEARN remains separate: `CourseModule` / `BtecLearningAim` is unchanged; ASSESS remains rooted at `EvaluationRequest`. No migration or historical backfill was introduced.
- Verification evidence: Required PR CI passed. The Full-stack browser UAT passed against the production-built application, covering the browser matrix and route usability. Separate real local browser verification covered English desktop, Arabic desktop, mobile, canonical `AssessmentScope` selection, scoped request creation, academic detail, authenticity flow, and checkout/test-payment flow; no relevant page or hydration errors were observed in that local scoped-flow verification. Development-preview CSP inline script/style messages remain a separate non-blocking follow-up.

- Task: ASSESS Academic Identity Foundation
- Merge/commit SHA: `be2b275b02a5c1f31aaead68c2fe32784d50bc11`
- Pull Request: #28
- Outcome: DONE. Added `UnitDefinition` under `QualificationVersion`, `AssessmentDefinition` under `UnitDefinition`, and `AssessmentScope` under `AssessmentDefinition`, with Grade, Specialization, and existing `RubricTemplate` bindings. Added nullable `EvaluationRequest.AssessmentScopeId` and `EvaluationRequest.AssessmentScopeSnapshotJson` through an additive migration. Historic EvaluationRequests were preserved without backfill; all new foreign keys use `RESTRICT`. Subsequent PRs #30 and #32 completed academic authoring, scope selection, and snapshots; PR #34 completed LEARN coursework deadline extensions; PR #38 completed UnitDefinition-level evaluator-specialism routing. Assessment Coordinator capabilities Slice 1 was completed by PR #40. LEARN and ASSESS remain separate; `EvaluationRequest` remains the ASSESS aggregate root and `CourseModule` remains unchanged.
- Verification evidence: Focused PostgreSQL identity/migration tests 3/3, targeted integration suite 31/31, focused BTEC unit tests 4/4, backend build with 0 warnings and 0 errors, formatting verification, git diff verification, PR full-stack browser UAT, Application quality, Dependency review, and CodeQL passed. Post-merge Application quality and both CodeQL workflows succeeded; Dependency review was skipped on push as expected by workflow configuration.

## Previous Merged Tasks

- Task: Structured Assessment Audit Export Identifier Minimization
- Merge/commit SHA: `7ab8c8ef428fbbce4724f8b94fe920b3fb9c775a`
- Pull Request: #24
- Outcome: DONE. Structured BTEC assessment audit export uses a safe explicit v2 contract. Raw internal identifiers and sensitive implementation metadata are structurally excluded; academic traceability is preserved; actor-role attribution is corrected without fabricating unsupported historical RBAC precision; and deterministic SHA-256 integrity is preserved. No database migration, frontend change, or Assessment PDF change was introduced.
- Verification evidence: Required post-merge CI GREEN — Application quality, Dependency review, CodeQL, CodeQL (csharp), and CodeQL (javascript-typescript).

- Task: Brand hydration locale consistency / `/en/about` WebKit hydration remediation
- Merge/commit SHA: `23ff9d3926a079d72871e68a4950805a5cd947e2`
- Pull Request: #26
- Outcome: DONE. Server/client locale-aware public brand settings are consistent, React Query hydration is seeded consistently, and a bounded 3000ms AbortController timeout with localized fallback handles timeout/abort, non-2xx, malformed JSON, and partial responses. No backend or database migration changes were introduced.
- Verification evidence: Unit verification 9/9 passed; production HTTPS browser verification 4/4 passed across Chromium/WebKit, English/Arabic, and 390x664 mobile, with no hydration errors or horizontal overflow.

- Task: Full-stack UAT Browser Matrix
- Merge/commit SHA: `25b25e30e3dc1e6a63025d4308073545e00412e9`
- Pull Request: #20
- Outcome: DONE. Dedicated browser UAT covers Chromium desktop/mobile, Firefox tablet, WebKit iPhone 14, English LTR, Arabic RTL, public routes, Student/Admin/Teacher golden paths, mobile Student coverage, responsive overflow assertions, strict page-error checks, and a production-style local HTTPS proxy. No production code or database migration was changed.
- Verification evidence: 7 passed / 0 failed / 0 skipped. Required `/en/about` WebKit iPhone 14 regression coverage asserts English SSR content, excludes the opposite Arabic content, verifies hydrated English DOM with `lang=en` and `dir=ltr`, and checks no page errors, React #418/hydration console errors, or horizontal overflow.

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
- `/en/about` brand hydration locale defect — merged through PR #26 in `23ff9d3`.
- Full-stack UAT browser matrix — merged through PR #20 in `25b25e3`.
- ASSESS academic identity foundation — merged through PR #28 in `be2b275b`.
- Versioned academic authoring and assessment definition mapping — merged through PR #30 in `689b872`.
- ASSESS AssessmentScope selection and immutable academic snapshot — merged through PR #32 in `5321baa7`.
- Reasonable Adjustments Slice 1, student-specific LEARN coursework deadline extensions — merged through PR #34 in `ab4ace6`.
- Retake Slice 1, authorised paid assessment Retakes — merged through PR #36 in `717ddd5`.
- Evaluator-specialism routing Slice 1 — merged through PR #38 in `8bce145`.

These entries are merged repository evidence only; new behavior changes still require targeted validation and review.

## Technical Core Complete

### BTEC assessment correctness core

Done: Main contains the versioned criterion/rule and qualification snapshot foundations, the additive ASSESS academic identity foundation from PR #28 (`UnitDefinition`, `AssessmentDefinition`, `AssessmentScope`, and the nullable `EvaluationRequest` bridge), authenticity declarations, authorised resubmission records, internal-verification sampling, appeals, structured assessment-audit export, formal visual PDF reporting, authorised paid Retakes from PR #36, and Evaluator-specialism routing Slice 1 from PR #38. ASSESS Slices 1–3 are DONE: the canonical academic chain is `QualificationVersion` → `UnitDefinition` → `LearningAimDefinition` → `AssessmentCriterionDefinition`, with `AssessmentDefinition` → `AssessmentScope`; `EvaluationRequest` remains the ASSESS aggregate root and a Retake is another new linked `EvaluationRequest`. Evaluator assignment requires an active UnitDefinition specialism grant checked server-side, and each new assignment retains the exact grant evidence. The structured audit export now uses the safe v2 contract: raw internal identifiers and sensitive implementation metadata are structurally excluded, academic traceability is preserved, actor-role attribution is corrected, unsupported historical RBAC precision is not fabricated, and deterministic SHA-256 integrity is preserved. The PDF includes assignment/task, submission/evidence, assessor/internal-verifier/lead-internal-verifier/appeal-review, and academic audit/history context; excludes sensitive storage/internal IDs; retains neutral/non-official BTEC wording; and has verified Arabic/English, multipage, and Linux/Windows font-layout compatibility with required CI green. PR #34 separately completed student-specific LEARN coursework deadline extensions without changing `EvaluationRequest` or `ResubmissionAuthorization.DueAtUtc`; LEARN remains separate from ASSESS.

Remaining: Resit, admin-configurable Retake pricing, automatic Appeal → Retake, and broader ASSESS reasonable adjustments beyond the completed LEARN coursework deadline slice remain unresolved on `main`. Canonical LEARN units and AcademicYear/Term/DeliveryPlan Slice 1 are merged through PRs #46 and #45. Production payment/provider validation and production operations remain outstanding.

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

Done: Main contains server-owned financial state, append-only wallet/allocation records, payment/coupon/session-recovery foundations, and the Slice 1 Retake payment lifecycle using the standard server-owned assessment price.

Remaining: Admin-configurable Retake pricing, live payment and payout providers, JoFotara, production reconciliation, production migration/smoke execution, and external-provider validation remain disabled or deferred.

### Teacher and student experience

Done: Main contains BTEC result views, internal-verification and appeal workspaces, protected privacy surfaces, these three Teacher slices, and one completed Student learning slice:

1. Teacher Course Workspace Navigation, with responsive navigation, stable deep links, active state, Arabic RTL/English LTR behavior, keyboard accessibility, mobile overflow handling, and usable sticky review/sidebar behavior.
2. Teacher Courses Management UX, with bilingual title search, status filters, deterministic sorting, course metadata, responsive management and compact dashboard presentations, and consistent Show all courses reset behavior.
3. Teacher Student Follow-up Workspace, with server-owned follow-up signals, a dedicated workspace, bounded complete-result server-side search/filter/sort/pagination, a compact dashboard preview, and bilingual responsive UX.
4. Student Courses Learning Hub, with a dedicated course workspace, bounded server-authoritative retrieval, bilingual search, progress filters, deterministic sorting, pagination, published-course and access enforcement, server-owned progress/completion state, safe cover and teacher-name handling, a compact dashboard preview, and bilingual responsive/accessibility validation.
5. Student Course Player + Resume Learning, with server-authoritative resume/current lesson selection, authorized deep links, saved position restoration, server-owned completion, preserved video threshold, accessible navigation, Course Hub Continue integration, and EN/AR responsive/accessibility validation.
6. Media / Video Foundation + Secure Delivery, with secure private MP4/WEBM upload, replacement/removal lifecycle handling, authorization, range/seek delivery, and resilient CoursePlayer media states. FOUNDATION COMPLETE; advanced media platform work remains outside this slice.
7. Reasonable Adjustments Slice 1, with teacher grant/revoke/history UI and student-specific LEARN coursework deadlines shown without the private staff rationale; other students retain the shared deadline.

Remaining: Broader Teacher UX remains incomplete. Student UX remains partial: the broader Student learning lifecycle remains. The broader course lifecycle and learning experience remain incomplete.

## Active Workstreams

Live progress is tracked in OPEN Draft PRs, and repository evidence wins over conversation memory. This document remains a repository-level snapshot and may not contain every intermediate checkpoint.

Maximum active implementation workstreams: **2**

At the 2026-09-25 preflight, GitHub reported one OPEN Draft PR: PR #53, owned by ASUS for Comprehensive Practice Assignment — Final Unit Practice. Its reserved scope includes Comprehensive Practice, related CourseAssignment/Learning Aim progression, Student/Teacher UI, and related EF migration/ModelSnapshot areas. LENOVO has no active implementation feature reserved at this snapshot.

## Next Actions

- ASUS: complete focused review, latest-main synchronization, final CI, Ready-for-Review, final approval, and merge for PR #53.
- LENOVO: after this documentation reconciliation, run a fresh preflight and select only an independent candidate from `docs/WORKSTREAM_COORDINATION.md`; do not start Student Lifecycle Closure or overlap PR #53 while it remains active.
- Task 6: DONE — Media / Video Foundation + Secure Delivery. PR #18 merged with required CI green.
- Slice 1: DONE — ASSESS academic identity foundation. PR #28 merged with required CI green.
- Slice 2: DONE — Versioned Learning Aims / Criteria + AssessmentDefinition publication/source mapping + Qualification/Rubric compatibility enforcement. PR #30 merged with required CI green.
- Slice 3: DONE — EvaluationRequest + AssessmentScope selection + immutable academic snapshot. PR #32 merged with required CI and production full-stack browser UAT green.
- Reasonable Adjustments Slice 1: DONE — student-specific LEARN coursework deadline extensions. PR #34 merged with post-merge CI green; production migration and smoke verification remain outstanding.
- Retake Slice 1: DONE — authorised paid assessment Retakes. PR #36 merged with post-merge Quality and Security analysis green; production migration and smoke verification remain outstanding.
- Evaluator-specialism routing Slice 1: DONE — UnitDefinition-level specialism grants and server-enforced manual assignment. PR #38 merged with PR and post-merge CI green; production migration and smoke verification remain outstanding.
- Assessment Coordinator capabilities Slice 1: DONE — bounded read-only ASSESS coordination queue with existing CourseReviewer authority and server-authoritative evaluator-specialism enforcement. PR #40 merged; no migration or new role was added.
- CI reproducibility hardening Slice 1: DONE — GitHub Actions and direct workflow container references are pinned to verified immutable identifiers in the three CI workflows. PR #41 merged without changing CI semantics.
- SLA / Expected Completion Workflow Slice 1: DONE — append-only server-owned operational targets with NotSet/OnTrack/Overdue coordination state. PR #43 merged; no fixed SLA duration was introduced.
- AcademicYear / Term / DeliveryPlan Slice 1: DONE and merged through PR #45; planning and course delivery remain separate.
- Canonical LEARN unit migration: merged through PR #46; ambiguous historical modules still need explicit evidence-backed reconciliation. Resit remains unimplemented. Admin-configurable Retake pricing and broader ASSESS reasonable adjustments remain unresolved.

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
| Authentication/Security | TECHNICAL CORE COMPLETE; REPO/DEVICE HARDENING FOLLOW-UPS REMAIN |
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
| Community/Formative | PARTIAL — LEARNING AIM PRACTICE FOUNDATION MERGED |
| AI | NOT STARTED |
| OneRoster/LTI | NOT STARTED |
| Final UAT/Launch Hardening | PARTIAL |

## Known Risks

- PR #6 is merged into `main` at `2fb3545604fb618019471076e4e0da587dfcea33` with targeted Assessment PDF verification, required CI green, and final engineering review passed; the formal BTEC assessment PDF reporting slice is complete.
- PR #16 is merged into `main` at `8770901ad78c172cbe0ed33e1235bfc78f739f07` with required CI green; the Student Course Player + Resume Learning task is complete.
- PR #18 is merged into `main` at `719b10e39b4370c709350dae64a1db80481872ed` with required CI green; Media/Video is FOUNDATION COMPLETE. Advanced media work remains deferred as documented above.
- PR #22 is merged into `main` at `9995034b6c27ef3ea27cee8264575c2667718e23`; both ReDoS CodeQL findings are closed, the gradebook finding is dismissed as a documented false positive, 0 CodeQL alerts remain open, and the security remediation workstream is closed.
- PR #24 is merged into `main` at `7ab8c8ef428fbbce4724f8b94fe920b3fb9c775a`; assessment-audit export identifier minimization is DONE, the safe v2 contract excludes raw internal identifiers and sensitive implementation metadata, actor-role attribution is corrected, and required post-merge CI is GREEN.
- PR #26 is merged into `main` at `23ff9d3926a079d72871e68a4950805a5cd947e2`; the `/en/about` WebKit React #418 hydration mismatch is resolved with consistent locale-aware server/client settings, seeded React Query hydration, and a bounded 3000ms server fetch timeout with localized fallbacks. Unit verification was 9/9 and production HTTPS browser verification was 4/4.
- PR #20 is merged into `main` at `25b25e30e3dc1e6a63025d4308073545e00412e9`; full-stack browser UAT completed 7/7 with required `/en/about` WebKit iPhone 14 regression coverage, strict page-error and overflow assertions, and no production or database changes.
- PR #28 is merged into `main` at `be2b275b02a5c1f31aaead68c2fe32784d50bc11`; the ASSESS academic identity foundation is DONE with additive `UnitDefinition`, `AssessmentDefinition`, `AssessmentScope`, and a nullable `EvaluationRequest` bridge. No historic backfill or destructive migration was performed. Subsequent PRs #30 and #32 completed academic authoring, scope selection, and snapshots; PR #38 completed evaluator-specialism routing. Assessment Coordinator capabilities Slice 1 was completed by PR #40.
- PR #30 is merged into `main` at `689b87280ecf27b1d4f825092e8f814066e9ccd4`; versioned academic authoring, canonical aims and criteria, definition mappings, source/publication rules, qualification/rubric compatibility, and the bilingual Admin Academic Catalogue are DONE. Slice 3 subsequently completed AssessmentScope selection and the immutable EvaluationRequest academic snapshot; PR #34 completed LEARN coursework deadline extensions; PR #36 completed authorised paid assessment Retakes; PR #38 completed evaluator-specialism routing; PR #45 completed AcademicYear/Term/DeliveryPlan Slice 1; PR #46 completed canonical LEARN unit links; and PR #47 completed Pearson academic catalogue authority and Admin programme planning. Resit, admin-configurable Retake pricing, and automatic Appeal → Retake remain future work.
- PR #32 is merged into `main` at `5321baa7f64eb06c6affd9e0bac94f28a52dc825`; AssessmentScope selection and immutable academic snapshot creation are DONE. The nullable legacy bridge remains supported, with no historical backfill or destructive migration. The transitional `TaskTypeId` dependency remains explicit follow-up work where canonical task-type ownership is not yet fully migrated.
- PR #34 is merged into `main` at `ab4ace6ef4b1774f3c752c7b7bd5e688531330f1`; Reasonable Adjustments Slice 1 for LEARN coursework deadlines is DONE with an additive migration, no backfill, and no destructive schema operation. Production migration and production smoke verification have not been executed.
- PR #36 is merged into `main` at `717ddd5b81e2825cdf45dda80bfb4fcac7d7da93`; Retake Slice 1 is DONE with additive migration `20260922182302_AddAssessmentRetakes`, no historical backfill, no destructive schema operation, retained approval history, Retake-only scope protection, one-Retake uniqueness, and `RESTRICT` foreign keys. ResubmissionAuthorization semantics, including `ResubmissionAuthorization.DueAtUtc`, were not changed; LEARN remains separate from ASSESS. Resit, admin-configurable Retake pricing, automatic Appeal → Retake, production migration, production smoke verification, and production payment/provider validation remain outstanding.
- PR #38 is merged into `main` at `8bce145f94cc1dc87ef7bda1aef8eae25da2d2f3`; Evaluator-specialism routing Slice 1 is DONE with additive migration `20260923081757_AddEvaluatorUnitSpecialisms`, exact grant evidence on new assignments, no historical backfill, and no destructive data rewrite. Retake policy, Resubmission, and IV/LIV behavior were not redesigned; LEARN remains separate from ASSESS. PR checks and post-merge Quality/Security analysis passed. Production migration and production smoke verification have not been executed.
- PR #41 is merged into `main` at `8ec295f071a2711486ecc2c8827c332eac0a60c8`; CI reproducibility hardening Slice 1 is DONE. The three existing workflows now use immutable upstream-verified Action SHAs and direct container digests while preserving workflow semantics.
- PR #40 is merged into `main` at `62e5e5a1d9158c11104c3496e088a7ead36a7fa5`; Assessment Coordinator capabilities Slice 1 is DONE. Coordination visibility is bounded and privacy-minimized, uses existing CourseReviewer authority, reuses evaluator-specialism eligibility, adds no migration or new role, and preserves Retake, Resubmission, IV/LIV, and LEARN/ASSESS boundaries.
- PR #43 is merged into `main` at `708326e4bd55e59d981238e1d5dce68e4a7fa5dd`; SLA / Expected Completion Workflow Slice 1 is DONE with additive migration `20260923125104_AddEvaluationExpectedCompletionRevisions`, append-only operational target history, no historical backfill, and no destructive rewrite. No fixed SLA duration was introduced; Retake, Resubmission, IV/LIV, and LEARN/ASSESS boundaries remain unchanged.
- PR #14's required CI was verified GREEN for feature head `431d12efe70236872173f66677d88d484b4348b4`: Application quality, Dependency review, CodeQL (csharp), and CodeQL (javascript-typescript) completed successfully. Future workstreams must still verify their own current remote CI before claiming completion.
- Production S3, SMTP, ClamAV, Data Protection certificate, hosting, monitoring, backup/restore, payment, payout, and fiscal integrations require external configuration or validation.
- Broader capacity testing, launch hardening, retention decisions, and final legal review remain outstanding; the dedicated PR #20 full-stack browser UAT matrix is complete.

### Remaining P0 items

- Resit policy and workflow remains unresolved; broader Retake policy beyond Slice 1 remains unresolved.
- Secret-scanning and push-protection verification remains unresolved.
- External BTEC/specification/policy dependencies remain unresolved.
- Payments, legal, and accounting external blockers remain unresolved.

### Non-blocking follow-up

- Development-preview CSP inline script/style console messages remain a non-blocking follow-up; Slice 3 did not change CSP, and production full-stack browser UAT passed. Reassess only if reproduced against production/main.

### Deferred P1 work

- Production Operations.
- Task 7 responsive/accessibility/i18n/performance baseline (NOT STARTED).
- Teacher Authoring Lifecycle.
- Student Lifecycle Closure.
- Advanced Media.

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
