# Resit activation design audit (L4)

Baseline: `origin/main` `699d786b8fff9d9e78fa0a953a9cd9448b56b7a7` (2026-09-27). This is a design audit, not an implemented activation contract. Labels below distinguish **FACT** (current source/migration), **INFERENCE** (consequence of that source), **PROPOSED DESIGN** (future slice), and **OPEN DECISION** (product or cross-workstream choice).

## 1. Executive Summary

**FACT:** A CourseReviewer can authorize and revoke one Resit opportunity for an original completed second-attempt NotYetAchieved evaluation. Authorization neither creates nor funds another `EvaluationRequest`. The authorization table already has a nullable new-request link, an activation timestamp, restrictive foreign keys, unique indexes, and consistency checks. No activation endpoint or service method exists [E1–E4].

**PROPOSED DESIGN:** L5 creates one fresh `Draft` `EvaluationRequest` for the original student, copies the original persisted academic identity and snapshots verbatim, and sets `ResitEvaluationRequestId` and `ActivatedAtUtc` on the existing authorization in the same serializable transaction. It never copies evidence, decisions, payment, or learner revision history. The authorization link is the sole Resit identity; no new `EvaluationRequest.ResitOf...` column is needed for L5.

**HIGH RISK:** The existing checkout treats a linked Resit as an ordinary non-Retake draft. It tries to consume an included Unit evaluation credit before paid checkout. A Resit is intended to be separately paid; ASUS must close this Commerce boundary before Resit payment is production-safe [E9]. The current review method also allows a first-attempt revision request; L8 must forbid that for a final Resit review [E7]. L5 alone must not be presented as an end-to-end usable Resit.

## 2. Verified Current State

| Finding | Classification | Evidence |
| --- | --- | --- |
| Authorization requires `Completed`, final `NotYetAchieved`, attempt 2, a revision deadline, a non-Retake original, valid scope/snapshot, no Retake/Resit chain, no active appeal, and an uninvolved authorizing reviewer. | FACT | `ResitService.IsEligibleAsync`, `ListEligibleAsync` [E2] |
| The staff controller has class-level `CourseReviewer`; it exposes eligible, authorizations, authorize, and revoke only. `IResitService` has no activation operation. | FACT | `ResitsController`, `ResitContracts` [E3] |
| Authorization writes an original-request `ResitAuthorized` academic event and platform audit; revoke writes `ResitAuthorizationRevoked`. Revoke refuses an already activated authorization. | FACT | `ResitService.AuthorizeAsync`, `RevokeAsync`; `ResitServiceTests` [E2, E4] |
| The original payment and result remain unchanged when authorizing/revoking. | FACT, tested in memory | `ResitServiceTests.Completed_second_attempt_nya_can_be_authorized_and_revoked_without_mutating_the_original` [E4] |
| New normal scoped drafts snapshot the current catalogue at creation and use the server price. The historical Retake service creates a separate request but chooses a current compatible target scope; that is a different workflow. | FACT | `ScopedAssessmentService.CreateAsync`, `RetakeService.AuthorizeAsync` [E5] |

## 3. Existing Database Guarantees

**FACT:** `ResitAuthorizations.OriginalEvaluationRequestId` is unique: one lifetime authorization row per original, including a revoked row. `ResitEvaluationRequestId` is nullable and unique when populated. Its foreign key and the original foreign key use `RESTRICT`. The `ActivationPair` check requires the new-request ID and `ActivatedAtUtc` to be both null or both non-null. `NotActivatedAndRevoked` forbids both timestamps; `NotSelfLinked` forbids original and Resit IDs being equal. `RevokedAtUtc`, `ActivatedAtUtc`, and `ResitEvaluationRequestId` are EF concurrency tokens [E1]. PostgreSQL constraint tests exercise duplicate original, incomplete activation pair, and duplicate Resit target [E4].

**INFERENCE:** The current schema can represent exactly one linked Resit request for an authorized original. It does not itself prove the linked request belongs to the same student, contains copied academic snapshots, is a Draft, or is the only otherwise-unlinked request someone created. L5 must establish those invariants in the service and transaction. No activation method exists today; the database check also prevents directly activating a revoked row without first clearing its revocation, which L5 must never do.

## 4. Missing Activation Capability

**FACT:** There is no `ActivateAsync` in `IResitService`/`ResitService` and no activation action in `ResitsController`. The only current link values are reserved nullable fields [E1–E3].

**PROPOSED DESIGN:** Add a student-facing activation command and result, service method, atomic new-request creation/link, and focused tests in L5. Do not repurpose the staff-only controller for a Student action by weakening its class-level policy.

## 5. Proposed Aggregate Lifecycle

| New request value | L5 design | Reason |
| --- | --- | --- |
| `Status` | `Draft` | Editable file/authenticity endpoints and checkout already expect Draft [E6, E9]. |
| `SubmissionAttemptNumber` | `1` | First submission on the new aggregate; `EvaluationRequest` default and authenticity numbering agree [E1, E6]. |
| `PaymentId` | `null` | Authorization never funds the new request; paid confirmation owns this field [E1, E6, E9]. |
| `CalculatedGrade`, `CalculatedScore` | `null` | No Resit decision exists at activation. |
| `SectionResultsJson`, `EvaluatorCriteriaPlanJson` | `"[]"`, `"[]"` | New review has neither results nor an assessor's plan [E1, E7]. |
| `RevisionDueAtUtc` | `null` | No learner revision window exists on a final Resit. |
| `RetakeOfEvaluationRequestId` | `null` | Resit identity comes from `ResitAuthorization.ResitEvaluationRequestId`; Retake semantics stay historical. |
| `Price`, `Currency` | Server-owned standard evaluation price and its supported currency; never copy old paid amount or accept a browser amount. | Current `AssessmentPricing.StandardEvaluationPrice` is 5 and normal drafts default to JOD [E1, E5]. Commerce must confirm the separate paid purpose before release. |

**PROPOSED DESIGN:** Copy persisted academic snapshots exactly rather than calling `ScopedAssessmentService.ResolveAsync` or loading a now-active rubric/scope. The original review's academic meaning must not drift when catalogue publication changes. A new ID and timestamps make the Resit a separate aggregate, with history joined through the authorization row. **OPEN DECISION:** whether L5 must reject a legacy authorized original missing optional qualification snapshot fields; the existing authorization predicate does not require them. Do not manufacture a current snapshot to fill this gap.

## 6. Activation Actor

**INFERENCE:** Student activation best matches the lifecycle: staff authorization is a prior decision, while only the owning student can supply fresh work/authenticity and initiate checkout. System activation during Commerce confirmation is too late to provide a distinct editable Draft and risks coupling lifecycle creation to payment. A second CourseReviewer activation adds a staff step unsupported by the present student-controlled evidence/checkout flow [E2, E6, E9].

**PROPOSED DESIGN:** Use a separate Student-policy endpoint/controller, for example `POST /api/v1/student/resit-authorizations/{authorizationId}/activate`; the exact route name is not established. The service must independently verify that the authorization's original belongs to the authenticated student and that the account is permitted to act. Return `NotFound` for another student's authorization; never return staff `Reason` or revocation rationale. Keep `ResitsController` staff-only [E3, E6].

## 7. Activation Preconditions

| Check inside the transaction | Why / status |
| --- | --- |
| Authenticated permitted Student; original `StudentUserId` equals actor; authorization and original exist. | **PROPOSED DESIGN:** ownership and authorization are server-side, not UI controls. |
| `RevokedAtUtc == null`, `ResitEvaluationRequestId == null`, `ActivatedAtUtc == null`. | **FACT:** pair/revocation checks exist; **PROPOSED DESIGN:** verify before inserting. An existing valid link is an idempotent replay, not a second creation. |
| Original remains `Completed`, final `NotYetAchieved`, attempt 2, non-Retake; original scope row and readable original scope snapshot still exist. | **PROPOSED DESIGN:** protect the stated authorization subject and exact snapshot copy. Do not reinterpret a Closed or changed result as still eligible. |
| Original criteria JSON is a usable nonempty set and original rule-set JSON parses with a version matching its stored version; optional qualification snapshot consistency is evaluated without current-catalogue replacement. | **PROPOSED DESIGN:** required for the later review; current authorization checks only scope snapshot, so legacy handling is an **OPEN DECISION**. |
| No active `Submitted`/`UnderReview` appeal and no newly conflicting Retake child/authorization. | **PROPOSED DESIGN:** these are mutable after staff authorization. `EvaluationAppealService.CreateAsync` can create a new appeal on a completed request without checking Resit authorization [E8]. Recheck these live conflicts. |
| No other linked Resit target for this original or target reused elsewhere. | **FACT:** unique indexes and one authorization per original protect this at commit; **PROPOSED DESIGN:** check/rely on those constraints with conflict handling. |

**INFERENCE:** Re-running `IsEligibleAsync` unchanged would always fail because it rejects any existing Resit authorization, including the one being activated. Do not re-run all staff predicates or redecide the authorized reviewer's involvement. The already persisted staff decision carries that historical determination. **OPEN DECISION:** an appeal upheld after authorization is neither an active appeal nor a changed grade today; product policy must decide whether it invalidates an unused Resit authorization before activation [E8].

## 8. Immutable Snapshot Copy Matrix

All items below are **PROPOSED DESIGN** copies from the original persisted request, not reads from the current catalogue. `AssessmentScopeSnapshotReader.Read` and `BtecAssessmentRuleSet.TryRead` supply existing validation tools [E5, E12].

| Field on new request | L5 treatment |
| --- | --- |
| `StudentUserId` | Copy exactly; require match to activation actor. |
| `GradeId`, `SpecializationId`, `TaskTypeId`, `RubricTemplateId` | Copy each original ID exactly. |
| `CriteriaSnapshotJson` | Copy exact serialized bytes/string after validating a usable criterion set. |
| `AssessmentRuleSetVersion`, `AssessmentRuleSetSnapshotJson` | Copy exactly after parsing and matching the stored version. |
| `QualificationVersionId`, `QualificationVersionSnapshotJson` | Copy exactly, including historical nulls; reject inconsistent pairs and resolve the legacy-null policy before L5 release. |
| `AssessmentScopeId`, `AssessmentScopeSnapshotJson` | Copy exactly after confirming the existing FK target and readable versioned snapshot. Do not reload an active scope or silently change academic definitions. |

## 9. Fresh/Empty State Matrix

**PROPOSED DESIGN:** Leave all child collections/rows absent for the new request: `SubmissionFiles`, `AuthenticityDeclarations`, `CriterionResults`, `EvaluationReviewDecisions` and criterion decisions, `EvaluationEvidence`, `EvaluationFeedback`, `EvaluatorAssignments`, `InternalVerifications` and samples, `Appeals`, `ResubmissionAuthorizations`, `EvaluationRevisionDeadlineAdjustments`, expected-completion revisions, and original `AssessmentAuditEvents`. `PaymentId` remains null. All original rows remain attached to the original request and unmodified [E1, E6, E7].

**OPEN DECISION — `StudentComment`:** The normal scoped draft accepts an optional fresh comment (up to 1,000 characters), but no Resit policy says to copy it or require a new one [E5]. Recommend `null` in minimal L5; never copy the old comment. A later Student API/UI may accept a new comment if product owners want it.

## 10. Concurrency and Idempotency Design

**PROPOSED DESIGN:** Start a PostgreSQL `SERIALIZABLE` transaction, lock the authorization row `FOR UPDATE`, verify owner/state and current preconditions, create the new `EvaluationRequest`, set both activation fields on the locked authorization, append events/log, save, and commit once. Lock order should be consistent with `ResitService.RevokeAsync`, which already locks the authorization row. Keep all database writes in the transaction; rollback on any error so no orphan request survives [E2].

| Race/replay | Required outcome |
| --- | --- |
| Two activations | One commits; the other waits/retries, reads the existing link, and returns that same ID. Never create a second request. |
| Successful-call replay | For the owning Student, return the linked request ID without creating, charging, or copying anything again. |
| Activation versus revoke | Whichever holds the authorization lock first commits; the loser observes activated or revoked state and does not overwrite it. |
| Failure between new request and link / serialization failure | Roll back both changes; return a bounded conflict/retry result after clearing tracked failed state. |
| Activated authorization called later | Return the same linked identity to its owner; do not re-evaluate mutable original predicates on a successful replay. |

**FACT:** Unique indexes, activation-pair/revocation checks, FK restrictions, and EF concurrency tokens provide a second layer but do not replace the transaction or owner check [E1]. **OPEN DECISION:** if an authorized original has later become invalid, return a conflict requiring staff review; do not silently revoke the authorization.

## 11. Audit/Event Design

**PROPOSED DESIGN:** In the activation transaction, append an `AssessmentAuditEvent` on the original (`ResitActivated`) and one on the new request (`ResitDraftCreated`), both with the authorization ID as a shared `CorrelationId` and the student actor. Record the new request ID in a platform `AuditLog` action such as `EvaluationResitActivated`, with `EntityType=ResitAuthorization`, `EntityId=authorizationId`, and minimal `MetadataJson` containing the original/new request IDs. The persisted authorization link remains the authoritative join. Never copy original audit events or put staff rationale into the student request/event or response. `AssessmentAuditEvent` and `AuditLog` already have these fields [E1, E2, E13].

## 12. Commerce Boundary and ASUS Handoff

**FACT:** `CreateEvaluationCheckoutAsync` first tries an included evaluation credit, then accepts an owned Draft with a clean file and attempt-matched authenticity declaration for paid checkout. Paid checkout uses `request.Price` and creates `Payment.Purpose="Evaluation"`; confirmation can move the request to `PendingAssignment` [E9]. Its credit path excludes only `RetakeOfEvaluationRequestId != null`, including the reloaded guarded branch. A Resit linked only through `ResitAuthorization` has a null Retake link, so a matching included Unit credit can be consumed, setting `Price=0`, `PaymentId=null`, and `Status=PendingAssignment`. This conflicts with the stated separately paid Resit intent [E9]. `RefundService` currently finalizes against course sale allocations and revokes only *unused* included credits granted by the refunded course payment; no Resit-specific refund/entitlement handling was found in the inspected path [E10].

**ASUS HANDOFF — must be guaranteed before Resit payment is production-safe:**

1. Exclude a Resit identified by `ResitAuthorization.ResitEvaluationRequestId` from every included-credit entry/replay/reload path, under concurrency, without changing standard Unit-credit behavior. `ExpectIncludedCredit` must never make a Resit free.
2. Confirm the paid checkout accepts only the linked owner's Draft with fresh clean file and attempt-1 authenticity, uses a server-owned Resit price/currency, and cannot reuse another request's payment/idempotency result. Decide whether the existing `"Evaluation"` payment purpose is sufficient for accounting and refunds or a distinct purpose/contract is required.
3. Define how confirmation, cancellation/failure, refund, and entitlement reporting distinguish and preserve a Resit. No included credit may be granted, consumed, restored, or revoked merely because a Resit exists; any refund policy must be explicit.
4. Add Commerce-owned integration tests for credit exclusion, paid checkout, callback/replay, and refund/entitlement interactions. LENOVO must not edit Commerce to satisfy this handoff.

**OPEN DECISION:** price/currency and payment-purpose policy belong to the Commerce/product handoff; L5 may set the existing standard server price but must not claim paid production readiness from that alone.

## 13. Fresh Evidence and Authenticity Boundary (L6)

**FACT:** `POST /api/v1/evaluations/{id}/files` has a Student policy, file type/size checks, private storage, security scan, and a service ownership check for `Draft`/`NeedsRevision`. `POST /api/v1/evaluations/{id}/authenticity-declaration` has a Student policy and creates one declaration for the request's current attempt; for Draft that is attempt 1 [E6]. The new request begins with no files or declarations. Checkout will reject it until at least one *new* clean file and its own attempt-1 declaration exist [E9].

**INFERENCE:** The existing endpoints can serve a correctly owned Resit Draft without copying old evidence or changing the upload/authenticity implementation. L6 should test this end to end on a linked Resit and check private storage/scan failure and attempt ownership. **OPEN DECISION:** whether a Resit-specific wording/statement is academically required; the current declaration is generic to an assessment attempt. If required, that is a product/legal wording decision, not a reason to copy the original declaration.

## 14. Evaluator Assignment Boundary (L7)

**FACT:** After a successful paid confirmation, an evaluation may reach `PendingAssignment`. `AssignWithOutcomeAsync` requires that status, a canonical Unit resolved from the request's scope/qualification IDs, an active non-frozen Teacher/Assessor role, and an unrevoked Unit-specialism grant. It locks the grant and records an assignment/audit [E6, E11]. The eligible-evaluator list uses the same Unit-specialism source. Neither path recognizes a Resit link or excludes the original evaluator or the staff authorizer [E11].

**INFERENCE:** A paid Resit with copied academic IDs can use the existing status transition and routing if its old scope still resolves to a canonical Unit. If mapping no longer resolves, the existing result is `ACADEMIC_MAPPING_REQUIRED`; do not infer a replacement Unit. **OPEN DECISION:** independent final review suggests considering exclusion of the original evaluator, and possibly the authorization actor if that person also assesses, but no Resit assignment rule currently defines these exclusions. L7 must decide and enforce the policy in both candidate listing and assignment service, with tests. Existing appeal/internal-verification rules show independence for those different decisions; they do not by themselves define the Resit assessor policy [E2, E8, E11].

## 15. Final Review Boundary (L8)

**FACT:** `SubmitReviewAsync` on an assigned non-Retake accepts attempt 1 with `RequestRevision=true` and a future deadline. It would set a Resit to `NeedsRevision`, write criterion results, feedback and an immutable `InitialReview` decision, then `ResubmitAsync` would allow a new attempt because it excludes only Retakes. With `RequestRevision=false`, the same method already calculates from the request's rule-set snapshot, writes criterion results/feedback and the decision, and ends `Completed` [E7]. The database review-decision check allows attempt 1 as `InitialReview` [E1]. The legacy `/results` route excludes non-Retakes, so it is not the intended Resit path [E6].

**PROPOSED DESIGN:** L8 identifies a linked Resit through `ResitAuthorizations` in `SubmitReviewAsync` and rejects `RequestRevision=true` and any non-attempt-1 submission; successful review uses the existing criterion calculation, feedback, `EvaluationReviewDecision(AttemptNumber=1, ReviewStage=InitialReview, RequestsRevision=false)`, and `Completed`. Guard `ResubmitAsync` as well so no later code path opens attempt 2 for a Resit. Preserve the original's result and decisions independently. No new review-stage enum/schema is needed for this one final review. **OPEN DECISION:** whether all original criteria must be selected on the Resit; current `SetCriteriaPlanAsync` permits a valid subset for non-Retakes [E7].

**Answer:** Current review flow safe for Resit: **NO**. The revision-request branch must be blocked before Resit review is exposed.

## 16. Student History and API Identification (L9/L10)

**FACT:** `EvaluationRequest` has a Retake link but no Resit field. Student `Mine` and detail, assessor assigned, and staff pending-assignment projections currently identify Retakes using `RetakeOfEvaluationRequestId`; they do not mark Resits [E1, E6].

**PROPOSED DESIGN:** Derive `isResit` and `resitOfEvaluationRequestId` by an ownership-safe join or batched lookup on the unique `ResitAuthorization.ResitEvaluationRequestId`, selecting only the original ID. Do not expose `Reason`, authorizer, or revocation rationale in Student DTOs. Prefer a query projection that avoids per-row N+1 lookups. No duplicate `EvaluationRequest` relationship column is needed for history; any external reporting unable to use the join should be demonstrated before considering schema changes.

## 17. Schema and Migration Assessment

**Answer for L5:** **NO new migration recommended.** The present authorization FK, unique links, pair/revocation/self-link checks, and concurrency tokens suffice for an atomic original authorization → one new request link [E1]. L5 needs service-level owner, snapshot, status, transaction, and conflict behavior. Commerce exclusion can also identify a Resit by this relationship without an additional database field. This conclusion concerns L5 activation only; it does not assert that later payment/accounting or reporting requirements need no schema changes.

## 18. Proposed L5 API and Result Contract

**PROPOSED DESIGN:** A Student-only `POST` takes an authorization ID from the route and no price, academic IDs, staff reason, or original request body. The response contains the activated `resitEvaluationRequestId`, a minimal status, and possibly the original request ID. The service result should distinguish:

| Result | API behavior |
| --- | --- |
| `Activated` | Return the new ID (new creation). |
| `AlreadyActivated` | Idempotent owner replay: return the same ID with no new write. |
| `NotFound` | Missing authorization or original not owned by actor; avoid cross-student enumeration. |
| `InvalidActor` | Authentication/Student policy failure; do not expose staff rationale. |
| `Revoked` | Conflict; no activation. |
| `OriginalNoLongerValid` | Conflict requiring staff review; no silent authorization change. |
| `AcademicSnapshotInvalid` | Conflict requiring data review; do not substitute current catalogue. |
| `Conflict` | Serialization/unique/concurrency race; safe retry or replay. |

**INFERENCE:** `Revoked` and `AcademicSnapshotInvalid` can reveal operational state only after the service has proved ownership. The public error body should remain minimal. Keep transaction failures from leaking database details. L5 should test both HTTP authorization and service ownership; a controller attribute alone is insufficient.

## 19. Exact L5 Scope

**PROPOSED DESIGN — L5 only:** activation command/result, separate Student-facing endpoint with policy and request validation, service owner/invariant checks, exact snapshot copy into fresh Draft, one atomic authorization link plus academic/platform events, serializable row-lock/idempotency/conflict handling, and focused in-memory/PostgreSQL tests (including activation/revoke race, rollback, replay, uniqueness, ownership, and audit). The service must not copy or mutate original history.

**Excluded from L5:** file upload/authenticity implementation, Commerce/payment/provider or included-credit changes, evaluator assignment, final review changes, Student/staff UI, history projections, migrations, Retake/Appeal redesign. L5 may create an editable Draft but must not claim that checkout or final Resit review is safe until ASUS and L8 close their boundaries.

## 20. L6–L13 Slice Boundaries

| Slice | Single responsibility |
| --- | --- |
| L6 — Fresh Evidence + Authenticity | Prove/restrict existing Student upload and new attempt-1 declaration against linked Resit Draft; no inherited files. |
| L7 — Evaluator Assignment | Paid `PendingAssignment` routing with resolved Unit-specialism and an explicitly approved Resit independence rule. |
| L8 — Final Advisory Review | One criterion-based, feedback-bearing, immutable final decision; no revision/resubmit cycle. |
| L9 — Student History / Result API | Ownership-safe Resit identification and separate original/new results in Student DTOs; no staff rationale. |
| L10 — Staff Coordination API / UI | Staff visibility and bounded coordination of authorized/activated Resits without changing authorization or payment state. |
| L11 — Student UI | Activation, fresh evidence, payment handoff, and result/history presentation using completed APIs. |
| L12 — Commerce Handoff / Payment Contract | ASUS-owned credit exclusion, paid purpose/price, confirmation, refund and entitlement accounting; no LENOVO Commerce edits. This boundary must close before payment launch. |
| L13 — E2E Hardening | PostgreSQL-backed concurrency and full Student→staff→payment→review/history security and failure-path verification after prior slices. |

## 21. Risks

| Level | Risk and practical effect | Required closure |
| --- | --- | --- |
| High | A Resit can consume an included standard Unit credit and become free if current checkout is reused. | ASUS credit exclusion and paid checkout tests before launch [E9]. |
| High | A linked Resit can receive `NeedsRevision` and attempt 2 under current review/resubmit code. | L8 guards before Resit final review is exposed [E7]. |
| Medium | Current assignment permits an evaluator involved in the original; intended independence is not yet defined. | Product decision and L7 enforcement [E11]. |
| Medium | Authorization can precede a new appeal or a change in original/snapshot validity. | Transaction-time checks and explicit upheld-appeal/legacy-snapshot policy [E2, E8]. |
| Medium | An original legacy row may lack qualification snapshots even though it was authorized. | Decide fail/repair policy without inventing current academic data [E1, E2]. |
| Low | Student and staff projections cannot currently label Resits. | L9/L10 derived joins; keep staff rationale private [E6]. |

## 22. Open Decisions

1. **Product/academic:** Does an appeal upheld after authorization cancel or suspend unused Resit activation? The current appeal decision does not change the original grade automatically [E8].
2. **Academic/data:** May a legacy authorized original with null `QualificationVersionId`/snapshot be activated if the versioned `AssessmentScopeSnapshotJson` is valid? Decide a documented fail-closed or evidence-backed legacy rule; never reload today's rubric to fill it.
3. **Product/UX:** Leave `StudentComment` null in L5, or accept an optional fresh comment at activation/later Draft editing? Copying the old comment is not recommended.
4. **Academic:** Must the final Resit evaluator differ from the original evaluator and/or authorizing reviewer, and must all original criteria be selected? Current assignment/review paths do not impose those Resit-specific rules.
5. **ASUS Commerce/product:** Resit price/currency, payment purpose, included-credit exclusion, refund/entitlement behavior, and separate-paid launch gate. No Commerce code is changed by this audit.
6. **Academic/legal:** Is the generic attempt-1 authenticity wording sufficient for Resit evidence?

## 23. Evidence — Current File/Method/Schema References

- **[E1]** `backend/src/Betcco.Domain/Evaluations/EvaluationEntities.cs`: `EvaluationRequest`, `ResitAuthorization`, child entities, `EvaluationReviewDecision`; `backend/src/Betcco.Domain/Common/Enums.cs`: `EvaluationStatus`/`EvaluationGrade`; `backend/src/Betcco.Domain/Common/WorkflowPolicies.cs`: `EvaluationWorkflow`. `backend/src/Betcco.Infrastructure/Persistence/BetccoDbContext.cs`: Resit mappings/concurrency/checks and review/child indexes. `backend/src/Betcco.Infrastructure/Persistence/Migrations/20260926151412_AddEvaluationResitAuthorizations.cs`: actual FK, unique indexes and checks.
- **[E2]** `backend/src/Betcco.Infrastructure/Services/ResitService.cs`: `ListEligibleAsync`, `AuthorizeAsync`, `RevokeAsync`, `IsEligibleAsync`, `ValidActorAsync`.
- **[E3]** `backend/src/Betcco.Application/Evaluations/ResitContracts.cs`: `IResitService`; `backend/src/Betcco.Api/Controllers/ResitsController.cs`: class policy and available routes.
- **[E4]** `backend/tests/Betcco.IntegrationTests/ResitServiceTests.cs`: authorization/revoke and blocker tests; PostgreSQL constraint test describes persisted uniqueness/pair checks. No tests were executed for this docs-only audit.
- **[E5]** `backend/src/Betcco.Infrastructure/Services/ScopedAssessmentService.cs`: `CreateAsync`/`ResolveAsync`; `backend/src/Betcco.Infrastructure/Services/RetakeService.cs`: `AuthorizeAsync`; `backend/src/Betcco.Application/Evaluations/EvaluationContracts.cs`: `AssessmentPricing` and review command.
- **[E6]** `backend/src/Betcco.Api/Controllers/EvaluationsController.cs`: Student file/authenticity/checkout routes, assignment/review routes, Mine/staff projections; `backend/src/Betcco.Infrastructure/Services/EvaluationService.cs`: `AddFileAsync`, `DeclareAuthenticityAsync`, `MarkPaidAsync`, `AssignWithOutcomeAsync`.
- **[E7]** `backend/src/Betcco.Infrastructure/Services/EvaluationService.cs`: `SetCriteriaPlanAsync`, `SubmitReviewAsync`, `ResubmitAsync`, `SubmitResultsAsync`; `BetccoDbContext` review-decision checks.
- **[E8]** `backend/src/Betcco.Infrastructure/Services/EvaluationAppealService.cs`: `CreateAsync`, `ReviewAsync`; `backend/src/Betcco.Domain/Evaluations/EvaluationEntities.cs`: `EvaluationAppeal`.
- **[E9]** `backend/src/Betcco.Infrastructure/Services/CommerceService.cs`: `CreateEvaluationCheckoutAsync`, `TryConsumeIncludedEvaluationCreditOnceAsync`, paid confirmation; `backend/src/Betcco.Application/Commerce/CommerceContracts.cs`: `ICommerceService`; `backend/tests/Betcco.IntegrationTests/IncludedEvaluationEntitlementTests.cs`: included-credit baseline tests.
- **[E10]** `backend/src/Betcco.Infrastructure/Services/RefundService.cs`: `FinalizeInternalAccountingAsync`, `RevokeUnusedIncludedEvaluationCreditsAsync`.
- **[E11]** `backend/src/Betcco.Infrastructure/Services/EvaluatorSpecialismService.cs`: `EligibleAsync`, `ResolveUnitIdAsync`; `EvaluationService.AssignWithOutcomeAsync`.
- **[E12]** `backend/src/Betcco.Application/Evaluations/AssessmentScopeContracts.cs`: `AssessmentScopeSnapshotReader.Read`; `EvaluationContracts.cs`: `BtecAssessmentRuleSet.TryRead`.
- **[E13]** `backend/src/Betcco.Domain/Platform/PlatformEntities.cs`: `AuditLog`.
