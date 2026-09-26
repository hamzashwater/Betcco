# Refund → Course Access Policy

## Status

**PROPOSED — NOT APPROVED.** This is a product decision artifact for user review. It does not authorize or implement a change to refunds, course access, evaluation, or data.

## Repository Baseline

- Inspected `origin/main` at `19cde22d308235adf1d34693cf73556ad3278569` on 2026-09-26. The fresh checkout was clean. No open or Draft PR and no same-purpose remote branch were returned by the GitHub connector at preflight; therefore there were no active PR diffs, CI checks, or unresolved review threads to compare. The commit-status endpoint returned no legacy statuses, and the available workflow-run query returned no PR-triggered runs for this main commit; this is **not** a claim that all main checks are green.
- `AGENTS.md` requires server-owned authorization and financial state. `docs/WORKSTREAM_COORDINATION.md` assigns Commerce/Entitlements planning to ASUS and Resit Activation/`EvaluationRequest` lifecycle to LENOVO; neither has an open implementation PR at this baseline. Existing decision documents are in `docs/decisions/`.
- Evidence below is from code and existing tests **inspected**, not from tests rerun for this documentation change. File names and method/test names identify the exact evidence.

## Current Verified Behavior

| Current fact | Evidence |
| --- | --- |
| A finalized full internal refund leaves the linked Enrollment in place. It does not set `AccessEndsAtUtc`, delete the Enrollment, or modify academic records. | `backend/src/Betcco.Infrastructure/Services/RefundService.cs` — `FinalizeInternalAccountingAsync`; `backend/tests/Betcco.IntegrationTests/RefundFoundationTests.cs` — `Full_refund_records_immutable_evidence_payment_transition_and_balanced_new_reversal` asserts the Enrollment remains. |
| Internal partial refunds are recorded as `Requested` with `PARTIAL_REFUND_ALLOCATION_POLICY_REQUIRED`; no accounting or access effect is finalized. PayTabs execution accepts only a full refund and rejects existing partial-refund evidence. `PaymentStatus.PartiallyRefunded` exists but this service does not transition to it. | `RefundService.cs` — `RecordInternalRefundAsync`, `InitiatePayTabsRefundAsync`; `backend/src/Betcco.Domain/Common/Enums.cs`; `RefundFoundationTests.cs` — `Partial_refund_is_preserved_as_requested_without_inventing_allocation_or_access_policy`; `backend/tests/Betcco.IntegrationTests/PayTabsRefundProviderTests.cs` — `Existing_partial_refund_evidence_cannot_be_sent_to_paytabs`. |
| A consumed included credit is untouched by a course refund, whether its evaluation is pending or completed; the current refund method does not inspect evaluation status. This is an observed code path, **not** an approved product rule. | `RefundService.cs` — `RevokeUnusedIncludedEvaluationCreditsAsync`; `RefundFoundationTests.cs` — `Full_refund_preserves_an_already_consumed_included_evaluation_credit` covers `PendingAssignment`. Completed status has no dedicated refund test. |

**Untested high-impact inference (separate PayTabs follow-up):** `RefundService.FinalizeInternalAccountingAsync` changes `Refund.EntitlementDisposition` when it revokes an unused credit. `BetccoDbContext.EnsureRefundsAreControlled` excludes that property from modifications to an existing Refund. The PayTabs path creates the Refund earlier and later modifies it during verification, so finalization with an unused credit appears liable to fail at `SaveChangesAsync` after the external refund was verified. The successful PayTabs test does not create an included credit (`PayTabsRefundProviderTests.cs` — `Verified_full_refund_uses_trusted_sale_data_and_finalizes_accounting_once`). This needs a dedicated integration test and separate runtime fix before relying on that case; it is not fixed here.

## Current Financial Flow

`RefundsController` requires `FinanceAdmin`. `RefundService.RecordInternalRefundAsync` validates payment status, currency, amount, refundable balance, and idempotency key. A full non-PayTabs refund finalizes only when `CourseSaleAllocation` rows exist, their currencies match, and their `NetAmount` sum equals the refund amount. In a serializable transaction it records the refund/payment transitions, marks the Payment `Refunded`, adds a balancing ledger reversal and negative wallet transactions, revokes unused included credits, and writes audit events. A failed allocation check leaves auditable `Requested` evidence (`REFUND_ALLOCATION_POLICY_REQUIRED`). Sources: `RefundsController.cs`; `RefundService.cs` — `RecordInternalRefundAsync`, `FinalizeInternalAccountingAsync`, `BookFullCourseSaleRefundAsync`, `AddWalletReversals`; `RefundFoundationTests.cs` — full, partial, duplicate, and append-only tests.

For PayTabs, `InitiatePayTabsRefundAsync` creates provider-processing evidence, sends a full refund, and `VerifyPayTabsRefundAsync` attempts internal finalization only after a separate provider query matches expected transaction details. A timeout or mismatch records `ProviderResultUnknown` and may open a reconciliation case; definite failure is `ProviderFailed`. Same-key replay does not resubmit the provider request, and an already finalized refund is returned without another reversal. Sources: `RefundService.cs` — provider initiation/verification/result methods; `PayTabsRefundProviderTests.cs` — success without an included credit, mismatch, timeout, and replay tests. **Policy consequence:** any future access change must wait for trusted internal finalization, not a request or ambiguous provider result.

`CommerceService` can put several courses in one `CourseCart` or `Membership` payment. Its purchase snapshot and `CourseSaleAllocation` rows identify courses and amounts, but `RefundService` currently reverses the **whole** allocation set. Sources: `CommerceService.cs` — trusted payment confirmation and `RecordCourseRevenueSplitAsync`; `backend/src/Betcco.Domain/Commerce/CommerceEntities.cs` — `Payment`, `CourseSaleAllocation`.

## Current Course Access Authority

`Enrollment` has `PaymentId`, `AccessEndsAtUtc`, `CompletedAtUtc`, and no active/revoked status. A null expiry means permanent purchase access; a future expiry means time-bounded access (`backend/src/Betcco.Domain/Learning/LearningEntities.cs` — `Enrollment`). `ContentAccessService.CanAccessCourseAsync`/`CanAccessCoreAsync`, `LearningController.CanAccessCourseAsync`, `StudentLearningToolsController`, and course assignment paths check the learner/course Enrollment and `(AccessEndsAtUtc == null || AccessEndsAtUtc > now)` on the server. `StudentCoursePlayerTests.Locked_or_expired_access_cannot_write_progress_or_open_the_player` and `Video_stream_enforces_student_access_publication_and_range_delivery` test expiry enforcement. The Student `Entitlements` endpoint displays only active Enrollments and labels null expiry `Permanent` (`StudentLearningToolsController.Entitlements`, `StudentLearningToolsControllerTests.Entitlements_are_scoped_to_active_student_access_and_project_credit_state`).

`CommerceService.GrantTimedCourseAccessAsync` can extend an existing Enrollment; `GrantPermanentCourseAccessAsync` can set its expiry to null and replace `PaymentId`. `BetccoDbContext` has a unique `(StudentUserId, CourseId)` Enrollment index. **Inference:** `Enrollment.PaymentId` is the latest recorded grant source, not a complete ledger of all purchases that might justify access. A refund of one payment cannot safely revoke this shared Enrollment without checking independent grants.

## Current Entitlement Behavior

`CommerceService` grants one included evaluation credit per paid course Enrollment and canonical Unit, tied to `GrantedByPaymentId`, `EnrollmentId`, and `UnitDefinitionId`; free courses grant none. Checkout consumes an available, unrevoked credit only for a matching Unit and eligible Draft evaluation with clean evidence/authenticity, moves the request to `PendingAssignment`, and records an assessment audit event. It does not create a separate evaluation Payment. Sources: `CommerceService.GrantIncludedEvaluationEntitlementsAsync`, `TryConsumeIncludedEvaluationCreditOnceAsync`; `IncludedEvaluationEntitlementTests` — paid, free, cross-Unit, and same-Unit/two-Enrollment tests.

`RefundService.RevokeUnusedIncludedEvaluationCreditsAsync` revokes only credits granted by the refunded Payment whose `ConsumedByEvaluationRequestId` and `RevokedAtUtc` are null. The entity retains grant, consumption, and refund links. `BetccoDbContext` and migrations `20260925194114_AddIncludedEvaluationEntitlements` and `20260925212129_AllowIncludedCreditsPerEnrollment` establish restrictive foreign keys, consumed-or-revoked exclusion, and uniqueness per `(GrantedByPaymentId, EnrollmentId, UnitDefinitionId)`. The Student entitlement projection labels each credit `Available`, `Consumed`, or `Revoked` (`StudentLearningToolsController.Entitlements`).

## Product Policy Questions

1. Should a **finalized full course-payment** refund end future course access, and if so immediately, at a session boundary, at the existing expiry, or through a new explicit server-owned state? Does the answer vary by not-started, in-progress, or completed course?
2. Which purchase or grant owns the access when one Enrollment has been extended, made permanent, or linked to a later Payment? How are a package's courses and independent payments distinguished?
3. For a partial refund, is the money a price adjustment with unchanged access, a refund of specified course lines, or a proportional reduction? Who approves and records its financial allocation?
4. May a consumed credit's pending or active evaluation continue after the underlying course refund? How are completed results, feedback, evidence, submissions, and disputes presented after access ends?
5. What learner notice, appeal/manual exception, session cutoff, and audit record are required? Should an ambiguous PayTabs result ever suspend access pending reconciliation?

## Decision Matrix

Every access/credit outcome in this table is **proposed, not current behavior**. “Full” means a verified, internally recorded refund of the payment that actually funds the course; otherwise defer to a source-attribution review. “Preserve history” means no physical deletion of learning, submissions, feedback, or evaluation records. Both access types are listed because permanent access needs an explicit future cutoff and timed access may end before its former expiry.

| Refund | Course state / timing | Access type | Credit state | Evaluation state | Proposed access effect | Entitlement effect | Historical data | Decision status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Full | Not started; before first use | Permanent or timed | None | None | End future access at finalization, subject to another valid grant | None | Retain Enrollment/payment | Proposed |
| Full | Not started; before first use | Permanent or timed | Available | None or Draft | Same | Revoke unused credit from refunded payment; keep Draft | Preserve records | Proposed; Draft disposition needs approval |
| Full | In progress; active session | Permanent or timed | None or Available | None or Draft | Deny next protected server operation; define session/download cutoff | Revoke only available credit | Preserve progress and Draft | Proposed; session rule open |
| Full | In progress | Permanent or timed | Consumed | PendingAssignment, Assigned, UnderReview, or NeedsRevision | End course access; decide evaluation service separately | Keep consumed link; no automatic recreation/revocation | Preserve evidence/review trail | Proposed; evaluation continuation open |
| Full | Completed; after completion | Permanent or timed | Consumed | Completed or Closed | End future course content access | Keep consumed link | Preserve result, feedback, submissions, audit | Proposed; result visibility open |
| Full | Any | Permanent or timed | Revoked | Any | Apply source-specific access rule | Do not revoke again | Preserve all history | Proposed |
| Full | Any; provider result unknown or only `Requested` | Permanent or timed | Any | Any | No refund-triggered change before trusted finalization | No new credit change | Preserve all history | Proposed safeguard |
| Partial | Any | Permanent or timed | None, Available, Consumed, or Revoked | Any | Keep access pending an approved line-level policy | Keep credit state pending explicit allocation | Preserve all history | Proposed default; allocation unresolved |
| Full or partial | Any; another valid purchase/grant covers same course | Permanent or timed | Any | Any | Keep access justified by the other grant | Affect only credit tied to refunded course/payment under approved rule | Preserve all history | Proposed; provenance model open |

## Options Considered

| Option | Behavior | Advantages | Risks | Accounting implications | Learning-history implications | Entitlement implications | Complexity / current model / migration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A — immediate full-refund cutoff** | At internal finalization, deny future course operations for affected grants; retain Enrollment. | Financial and access outcomes align promptly; server-enforceable. | Interrupts active sessions; wrong cutoff if another grant exists. | Couple to verified refund and allocate affected course lines. | Keep progress, practice, submissions, feedback, results, and review evidence. | Revoke unused; consumed needs separate rule. | Medium/high. Current expiry could cut off a simple sole grant, but reliable source-specific behavior/audit likely needs additive grant or revocation provenance; migration **appears necessary** for general multi-payment support. |
| **B — preserve access after full refund** | Refund finances and unused credit, leave course access. | Simple, no session disruption; matches current access effect. | Fully refunded learner may keep paid content; commercial inconsistency. | Existing full reversal suffices. | All history and access remain. | Existing unused-credit revocation conflicts with continued course use unless separately decided. | Low; current model; no migration apparent for access. |
| **C — scheduled full-refund cutoff** | End access at approved boundary (session end, fixed grace, or original expiry). | Gives notice and avoids abrupt interruption. | Requires exact boundary/timezone and race rules; can leave refunded access for a period. | Same full reversal; record effective cutoff separately. | Preserve records; progress may continue until cutoff. | Decide whether credit can be consumed during grace. | Medium/high; timed expiry alone cannot express refund cause or protect another grant; additive schedule/provenance migration likely for general case. |
| **P1 — partial as price concession** | Leave every course/grant and credit unchanged. | Simple learner outcome. | May mismatch a course-specific refund promise. | Requires approved allocation and accounting/tax handling before execution. | No change. | No change. | Medium finance work; current partial request is only evidence; migration need depends on approved allocation design. |
| **P2 — partial as specified course-line refund** | Cut off only the refunded course grant, if no other valid grant. | Matches item-level remedy; protects other courses. | Ambiguous packages/discount/tax and overwritten Enrollment payment source. | Needs line-level refund amounts, ledger/wallet/tax reversal rules. | Retain all affected/unaffected history. | Revoke only unused credit attributable to refunded line; consumed separate. | High; current allocations help but are not refund-line decisions; additive allocation/provenance migration likely. |
| **P3 — proportional partial** | Keep all access or shorten timed grants by an approved formula. | Can model subscription concessions. | Arbitrary entitlement value; permanent access has no natural duration. | Requires explicit proportional financial allocation. | Retain history. | Needs proportional credit rule. | High; current model insufficient; migration likely if chosen. |
| **C1 — honor consumed credit** | Let already submitted pending/active review continue; keep completed results. | Preserves committed academic service and evidence. | Refunded course may still receive review value. | Finance must decide whether consumed service value is excluded from refund or accepted as cost. | No rewrite. | Consumption remains linked, never recreated automatically. | Low for preservation; any exception/settlement audit may need new fields. |
| **C2 — pause/cancel pending review** | Pause or cancel a not-yet-completed included review after refund. | Limits further service delivery. | Disrupts assessment, evidence, and staff work; requires fair manual handling. | Define adjustment/settlement for partially delivered service. | Keep attempt, submissions, feedback, and audit even if stopped. | Keep consumption evidence; release only by explicit policy. | High; current refund path has no evaluation disposition; likely additive workflow/audit model and migration. |
| **H1 — preserve completed evaluation result** | Retain result and audit; independently decide learner read access. | Academic traceability and defensibility. | Continued result visibility may differ from a strict access cutoff. | No new reversal by itself. | Immutable historical meaning maintained. | Consumed link retained. | Low for retention; result-visibility changes may need authorization work, migration not apparent. |
| **H2 — hide completed result from learner** | Retain staff/audit record but restrict learner display. | Stronger post-refund access boundary. | Can impair learner rights and dispute handling. | No new reversal by itself. | Records still retained; presentation changes only. | Consumed link retained. | Medium; current display paths need review; migration not apparent unless exception history is required. |

## Proposed Policy

**PROPOSED — REQUIRES USER APPROVAL.** Select **A** for a fully and reliably attributed course refund: end future server-authorized course access when internal accounting reaches `InternallyRecorded`; keep the Enrollment and all history. Do not revoke access for `Requested`, `ProviderProcessing`, `ProviderVerified` without accounting finalization, `ProviderResultUnknown`, or `ProviderFailed`. A protected request already in flight needs a defined next-operation/session cutoff; do not treat UI hiding as enforcement. If another valid payment or grant covers the same course, retain that access. No automatic Enrollment deletion.

Select **P1** as the default for a future approved partial price concession; use **P2** only if product and finance explicitly identify refunded course lines and approve allocation. No partial execution or access effect is authorized by this document. Select **C1/H1** for consumed credits and completed evaluations: preserve the consumed link, let an already committed review continue, retain completed results and audit evidence. Learner visibility and any commercial adjustment remain approval questions. This recommendation prioritizes financial consistency, server authority, and non-destructive academic history, but depends on trustworthy per-grant provenance that the current Enrollment model does not fully provide.

## Historical Academic Data Policy

**Proposed invariant:** refund must not physically erase `Enrollment`, lesson/content progress, Learning Aim Practice attempts, Final Unit Practice submissions/outcomes, evaluation submissions/evidence, feedback, results, assessment audits, or review history merely to block future use. `RefundService.FinalizeInternalAccountingAsync` currently touches none of those entities; `EvaluationRequest` links evidence/feedback/results/audits (`backend/src/Betcco.Domain/Evaluations/EvaluationEntities.cs`). Preserve historic staff/audit access. Whether a learner can read completed results after course cutoff needs product/legal review; course content authorization and historical-record visibility are different decisions.

## Included Evaluation Entitlement Policy

**Current fact:** only available credits linked to the refunded Payment are revoked; consumed credits are not (`RefundService.RevokeUnusedIncludedEvaluationCreditsAsync`). **Proposed invariant:** a consumed credit cannot be silently recreated, “unconsumed,” or also marked revoked. The database check constraint disallows both consumed and revoked timestamps. For a consumed credit with a `PendingAssignment` or active review, propose continuation under **C1**; an alternative pause/cancel path is **C2** and requires an explicit service, learner, and audit rule. Completed results remain historical evidence under **H1**, even if course access ends. A Draft evaluation has not consumed the credit; it remains Draft, while its available credit is revoked at a finalized refund. A separately paid evaluation has its own Payment and must not be implicitly refunded by a course-payment refund.

## Multi-Course Payment / Refund Policy

**Proposed invariant:** no unrelated Enrollment or credit may lose access because another course was refunded. A full refund of a multi-course payment would affect each attributable course only after checking independent grants; a line-level partial refund would affect only approved lines. `CourseSaleAllocation` has `(PaymentId, CourseId)` uniqueness (`BetccoDbContext`), but the one-Enrollment-per-learner/course model and mutable `Enrollment.PaymentId` do not preserve a complete grant history. Package/discount/tax allocation, existing manual Enrollment, later renewal, and a second course containing the same Unit must be handled explicitly. Do not infer a refund line from an amount alone.

## Partial Refund Policy

**Current fact:** internal partial requests retain evidence without financial, access, or credit effects; PayTabs partial execution is disabled. **Proposed policy:** retain access and credits for an approved price concession (**P1**). Consider course-line termination (**P2**) only after product approval of line identity, allocation, independent-grant handling, and learner notice. Proportional access shortening (**P3**) is an alternative, especially for timed access, but has no defined rule for permanent access. No partial refund behavior is implemented or approved here.

## Concurrency / Race Conditions

Future implementation must define and test: refund finalization versus content read/progress save/video stream; checkout consuming a credit versus refund revoking it; duplicate admin requests/provider callbacks or delayed verification; another course purchase or timed renewal while an earlier payment is refunded; multi-course same-Unit credits; a review progressing from Draft to PendingAssignment or Completed during refund; and failure after financial reversal but before access change. **Proposed invariants:** check access on protected server operations; use idempotent, auditable transitions; serialize or detect credit consumption/revocation conflicts; make financial and access outcomes atomic where possible or durably recoverable with reconciliation. Existing refund serializable transactions, idempotency keys, credit concurrency tokens, and database exclusion constraint are supporting architecture, not proof that future races are already solved.

## Audit Requirements

**Proposed:** record actor, trusted refund/payment IDs and statuses, provider/reference when applicable, affected course/Enrollment/grant IDs, old/new access state and effective UTC cutoff, reason, policy version, entitlement IDs/disposition, independent grants that prevented cutoff, and an idempotency/correlation key. Record manual exception and recovery actions. Restrict sensitive notes. Existing `RefundStatusTransition`, `PaymentStatusTransition`, `AuditLog`, and credit refund links provide partial evidence; they do not record a course-access revocation (`RefundService.FinalizeInternalAccountingAsync`; `CommerceEntities.cs`).

## LENOVO / Resit Boundary

LENOVO owns future Resit Activation/`EvaluationRequest` lifecycle. It must coordinate if a refunded course loses access while a Resit authorization or new request remains pending or active, including evidence upload, result visibility, and separately paid service treatment. This document does not set Resit pricing or activation rules and changes no Resit/Retake/ASSESS code (`docs/WORKSTREAM_COORDINATION.md`, LENOVO section).

## Database / Migration Impact

**This PR adds no migration or database change.** A basic sole-grant cutoff could use `AccessEndsAtUtc`, but that field currently means natural timed expiry and cannot explain a refund or preserve multiple grant sources. For robust source-specific revocation/scheduling, an additive grant/provenance and access-action model **appears necessary**; the exact schema, backfill, legacy ambiguity handling, and indexes need a separately approved design. Any future migration that transforms or deletes data must disclose its risk before execution. Do not infer new table/column names from this proposal.

## Required Tests for Future Implementation

1. Full internal and verified PayTabs refund: sole permanent/timed grants, before use/in progress/completed, access denial on all protected read/write/stream paths after the chosen cutoff, history retained.
2. Requested, provider-unknown/failed, replay, and concurrent finalization: no early/duplicate access action, credit change, ledger reversal, or audit transition.
3. Available/consumed/revoked/no-credit cases, including Draft, PendingAssignment, active review, Completed, same-Unit credits from two Enrollments, and checkout-versus-refund races.
4. Multi-course payment, package, independent later purchase/renewal, overwritten Enrollment `PaymentId`, and manual/legacy Enrollment: unrelated valid access retained.
5. Partial concession and approved course-line allocation: financial/tax, wallet, credit, and access effects align with each line; no accidental broad cutoff.
6. Transaction failure/recovery and audit evidence; learner/staff historical result visibility; repeat callbacks. Use relevant PostgreSQL constraint/integration tests as well as controller access tests.
7. Before implementation, add a focused PayTabs full-refund test with an unused included credit to confirm or refute the persistence-allowlist inference above; track any fix separately from this policy document.

## Open Decisions Requiring User Approval

- Choose A, B, or C for full refunds; if A/C, define exact session cutoff, notice, grace/appeal exception, and whether completed learners differ.
- Choose P1, P2, or P3 for partial refunds, including finance allocation, packages, discounts/tax, and permanent versus timed access.
- Choose C1 or C2 for consumed credits in pending/active review, including cost treatment; choose H1 or H2 for completed result visibility.
- Approve a source-of-access provenance design and handling of legacy/overwritten `Enrollment.PaymentId` before any automatic revocation.
- Define a PayTabs ambiguous-result operational rule and the audit/notification requirements. None of these choices is approved by this document.

## Explicitly Out of Scope

Runtime refund, Commerce, Enrollment, entitlement, controller, frontend, test, schema, or migration changes; partial-refund and PayTabs bug fixes; payout; Resit/Retake/ASSESS activation or pricing; AI/RAG; production deployment. This document is the only scoped change.
