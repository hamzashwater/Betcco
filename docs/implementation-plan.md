# BETCCO implementation plan

Updated: 2026-09-13

This is the execution plan for the approved master implementation prompt. Each stage is kept buildable and is verified before the next stage starts. External-commercial decisions are implemented as disabled adapters and documented blockers, not guessed integrations.

| Stage                                       | Status      | Deliverable                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery and baseline                      | Completed   | Audit, risk register, ADRs, baseline command record and Prettier repair                                                                                                                                                                                                                               |
| P0 repository and CI                        | Completed   | CI, clean-clone verification, production image builds, Playwright, PostgreSQL/S3 tests, CodeQL and dependency review are green                                                                                                                                                                        |
| P0 BTEC assessment correctness              | In progress | Versioned criterion rules, qualification-version registry/snapshots, authenticity, academic audit export, authorised resubmission, risk-informed internal-verification sampling, and a protected appeal workflow are complete for the current external-evaluation slice; formal PDF reporting remains |
| P0 identity, privacy and commerce hardening | In progress | Central permission policies, invitation lifecycle, privacy-rights workflow, and versioned marketing-consent evidence are in place; payment/ledger adapter hardening remains                                                                                                                           |
| P1 storage and operations                   | In progress | Durable private storage is complete; provider-neutral staging/production deployment and rollback runbooks are present; backup/restore and monitoring remain deferred                                                                                                                                  |
| P1 learning experience                      | Pending     | Course lifecycle, student learning improvements, i18n, SEO, performance and accessibility                                                                                                                                                                                                             |
| P2/P3 educational extensions                | Pending     | Early warning, guardian portal, community/formative learning and guarded integrations                                                                                                                                                                                                                 |

## Work rules

1. Server-side authorization, financial decisions and academic decisions are the source of truth.
2. Database changes use additive EF Core migrations and do not destructively rewrite existing data.
3. Every new mutable route has validation, authorization, antiforgery, appropriate audit logging and tests.
4. Every feature remains behind a safe default or feature flag when a commercial/legal dependency is undecided.
5. Each stage updates this document with the actual files, migrations and verification output.

## Immediate slice

1. Fix the known Prettier failures without behavioral changes.
2. Add the baseline audit, risk register and initial architecture decision records.
3. Inspect the existing evaluation entities/services/tests to define a safe additive migration from percentage-derived BTEC outcomes to a versioned criterion rule set.
4. Add CI/container scaffolding only after existing quality commands are green.

## Implemented record

- Added rule-set versions and snapshots to evaluation requests, rubrics, coursework and coursework submissions.
- Added migrations `20260901032605_AddVersionedBtecAssessmentRules` and `20260901032834_AddCourseAssignmentRuleSnapshots`. They convert legacy 60/80/100 BTEC storage values to ordered outcomes and clear retired outcome scores while retaining independent quiz/progress percentages.
- The teacher, student and administrator BTEC result views now expose criterion decisions and P/M/D outcomes rather than numeric BTEC scores.
- Added unit coverage for complete P/M/D prerequisites, section-level minimum outcomes and incomplete-plan rejection.
- Added an originality declaration for each formal external-evaluation attempt. The server stores the policy wording/version, attempt number, timestamp, bounded IP/user-agent metadata, and an academic audit event; checkout cannot proceed without the first declaration.
- Added append-only assessment audit events for draft creation, declaration, assignment, criteria planning, assessment submission, internal-verification decision, and resubmission; EF rejects update or deletion attempts after creation.
- Added explicit `ResubmissionAuthorization` records. A verifier must record a reason and a rule-set-bounded deadline; the student then needs a fresh declaration before one authorised next attempt can be submitted.
- Added migrations `20260901120122_AddAssessmentAuthenticityAudit` and `20260901120433_AddResubmissionAuthorization`.
- Added Lead Internal Verifier-owned sampling plans for external evaluations. Plans are scoped to the available assessor, grade, specialization, task-type and outcome context and require a human-written rationale; they deliberately do not apply an invented fixed sampling percentage. A selected sample is unique per assessment attempt, requires an independent eligible verifier, is protected from deletion or scope rewrites, and records its terminal accepted/returned decision in the academic audit trail. The verifier workspace no longer exposes a selected sample to other verifiers.
- Added the protected administration workspace at `/admin/internal-verification`, with a bilingual plan form, candidate list, eligible-staff picker and independent-verifier selection. The server, rather than this UI, enforces eligibility, independence, plan scope, status transitions and uniqueness.
- Added migration `20260902033205_AddInternalVerificationSampling` and applied it to the local Docker PostgreSQL database on 2026-09-02.
- Added academic appeals for released external evaluations. A student can submit one documented open appeal at a time or withdraw it; only a qualified Lead Internal Verifier independent from the original assessor and IV decision can record an upheld/rejected outcome with a rationale. The appeal decision is append-only in the academic and operational audit trails and deliberately does not alter a grade: any reassessment must be a separately authorised academic action. Student and reviewer workspace pages are available at `/student/appeals` and `/admin/evaluation-appeals`.
- Added migration `20260902085351_AddEvaluationAppeals`, verified the EF model has no pending changes, generated an idempotent script, and applied it to local Docker PostgreSQL on 2026-09-02.
- Added a Lead Internal Verifier-only structured assessment-audit export at `/api/v1/assessment-audit-exports/{evaluationRequestId}`. It contains the immutable rules and qualification snapshots, submission metadata, declarations, criterion decisions, evidence, feedback, IV sampling/decisions, resubmission records, appeals and academic events, but never private storage keys, IP addresses or user-agent strings. The JSON payload is wrapped with a SHA-256 checksum and every export is operationally audited. A download link is available in the appeal review queue. A visual PDF report remains a separate P0 slice.
- Added a protected qualification registry at `/admin/qualification-registry`. A SystemAdmin (or the legacy Admin during the least-privilege transition) can register the centre's own qualification code, bilingual name, dated source reference and version, then bind it to a rubric. New evaluations capture an immutable qualification-version snapshot, while historical requests remain unchanged. BETCCO does not seed a Pearson specification or claim centre approval.
- Added migration `20260902091209_AddQualificationVersionRegistry`, verified there are no EF pending-model changes, generated an idempotent script, and applied it to local Docker PostgreSQL on 2026-09-02.
- Split rate limits by sensitive action: login, password reset, catalog search, uploads, checkout, payment-webhook handling, and AI; the protected upload and checkout routes now use their dedicated policies.
- Centralized evaluator eligibility through Identity. The assessment service rejects a frozen, missing, or non-assessor account even if a caller attempts to submit its identifier directly.
- Added an authenticated privacy-rights workflow at `/api/v1/privacy`: the account owner can create, track and cancel only their own bounded requests, while a `PrivacyAdmin` policy can review them. Completing a non-marketing request requires a recorded identity-verification action and a user-facing resolution summary; the workflow never performs direct deletion or browser-side export.
- Added the student-facing Privacy Centre request panel and the protected BETCCO administration review queue. Both use the server API, including antiforgery and rate-limited mutable requests.
- Added `ConsentRecord` as append-only evidence for explicit optional marketing-consent grants and withdrawals. The identity profile remains the fast enforcement value, while the record holds the policy version, capture method and bounded request metadata. The `Privacy__MarketingConsentVersion` environment variable is documented with a safe default.
- Added a restricted security-incident register for system administrators, with a separate breach assessment and server-calculated 24-hour/72-hour operational deadlines. Human staff must record legal confirmation and, where the legal reviewer requires it, the external notification actions before closure; BETCCO does not make legal determinations or send those notifications automatically. The record is available in the admin workspace under Security incidents.
- Made the existing wallet ledger (`WalletTransaction`) and course-sale allocation rows append-only in the EF persistence boundary. Corrections must be represented by a compensating entry, preserving the 30% platform / 70% teacher allocation history rather than editing past financial facts.
- Added a nonce-based Content Security Policy through the frontend request proxy, together with `nosniff`, anti-framing, referrer and browser-permissions headers. Development keeps only the WebSocket/eval allowances required by Next.js; production restricts connections to the same origin.
- Added server-side upload signature validation for PDFs, images, video, plain text, ZIP and Office documents. The server now derives the persisted content type from the bytes, rejects mismatched extensions, dangerous archive entries, archive bombs and malformed Office packages before the existing private-storage and malware-scanning flow. Upload endpoints also enforce multipart request limits.
- Added migrations `20260901121524_AddDataSubjectRequestWorkflow` and `20260901180749_AddConsentRecords`. The former includes a PostgreSQL partial unique index so one account cannot create duplicate open requests of the same type under concurrent requests.
- Added and applied migration `20260902031751_AddSecurityIncidentWorkflow` to the local Docker PostgreSQL database.
- Verified the privacy/consent migrations by generating an idempotent SQL script and running EF's pending-model check. With Docker PostgreSQL available, the idempotent script was applied successfully to the local development database on 2026-09-01.
- Latest verification: `dotnet format backend/Betcco.sln --verify-no-changes --no-restore` passed; `dotnet build backend/Betcco.sln --configuration Release --no-restore` passed with 0 warnings/errors; `dotnet test backend/Betcco.sln --configuration Release --no-restore` passed 11 unit and 86 integration tests. Frontend Prettier, TypeScript and ESLint checks passed; Vitest passed 5/5; and the Next.js production build completed successfully.
- Added non-root API/frontend container definitions, CI workflow scaffolding, security analysis workflow and a local verification script.

## External decisions deliberately left disabled

- Payment gateway, payout provider and JoFotara registration details.
- Production object storage/CDN, email and queue provider.
- The precise BTEC qualification, specification versions and named academic roles.
- Formal retention schedule, guardian-access and AI-assessment policies.
- Production RPO/RTO and hosting budget.
