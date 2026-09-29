# Refund → Course Access Policy

## Status

**APPROVED — 2026-09-26. RF1 was merged through PR #134 into `main` at `357b2575fa35ca0c585f003e31886269f227d28e`.** The policy below remains unchanged. Older branch/merge-pending wording in the dated RF1 implementation snapshot below describes its pre-merge state.

RF1 adds payment, membership, subscription, and unattributed legacy course-access grants. Trusted full CourseCart refund finalization revokes only grants attributable to that Payment in the financial transaction. The next protected server check uses current grants; an independent valid grant preserves access. Existing Enrollment and academic history remain. The additive migration preserves every existing non-deleted Enrollment as an unattributed Legacy grant without trusting its mutable `PaymentId`; ambiguous historical access therefore remains available until separately reconciled. No production or live PayTabs validation is claimed.

## Repository Baseline

- Inspected `origin/main` at `19cde22d308235adf1d34693cf73556ad3278569` on 2026-09-26. The fresh checkout was clean. No open or Draft PR and no same-purpose remote branch were returned by the GitHub connector at preflight; therefore there were no active PR diffs, CI checks, or unresolved review threads to compare. The commit-status endpoint returned no legacy statuses, and the available workflow-run query returned no PR-triggered runs for this main commit; this is **not** a claim that all main checks are green.
- `AGENTS.md` requires server-owned authorization and financial state. `docs/WORKSTREAM_COORDINATION.md` assigns Commerce/Entitlements planning to ASUS and Resit Activation/`EvaluationRequest` lifecycle to LENOVO; neither has an open implementation PR at this baseline. Existing decision documents are in `docs/decisions/`.
- Evidence below is from code and existing tests **inspected**, not from tests rerun for this documentation change. File names and method/test names identify the exact evidence.
- Approval update preflight: `origin/main` remained at `19cde22d308235adf1d34693cf73556ad3278569`; branch `docs/refund-course-access-policy` was clean at `aed7aef772dde16f0760837bd6b9251fd7cb4d23`. PR #80 was Open/Draft and the only open PR returned by the GitHub connector. The preceding bullets record the baseline when the original document was created.

## Current Verified Behavior

| Current fact | Evidence |
| --- | --- |
| Trusted full CourseCart refund finalization leaves Enrollment, completion, and progress in place while revoking only grants attributed to its Payment. | `RefundService.FinalizeInternalAccountingAsync`, `RevokePaymentCourseAccessGrantsAsync`; `RefundFoundationTests.Full_refund_records_immutable_evidence_payment_transition_and_balanced_new_reversal`. |
| Current course access requires an Enrollment and a valid grant. An unattributed Legacy grant and another independent payment grant preserve access. | `CourseAccessQueries.ActiveEnrollments`; `RefundFoundationTests.Independent_paid_grant_keeps_access_when_first_payment_is_fully_refunded`, `Legacy_grant_remains_accessible_and_is_marked_for_reconciliation`. |
| Internal partial CourseCart refunds can finalize accounting, but leave grants and included credits unchanged. PayTabs partial execution remains disabled. | `RefundService.FinalizeInternalAccountingAsync`; `PartialRefundAccountingTests.Taxed_single_partial_books_revenue_only_and_preserves_access_and_credit`; `PayTabsRefundProviderTests.Existing_partial_refund_evidence_cannot_be_sent_to_paytabs`. |
| A consumed included credit remains consumed; an unused credit tied to a fully refunded Payment is revoked. The focused PayTabs PostgreSQL test verifies the unused-credit persistence path. | `RefundService.RevokeUnusedIncludedEvaluationCreditsAsync`; `RefundFoundationTests.Full_refund_preserves_an_already_consumed_included_evaluation_credit`; `PayTabsRefundProviderTests.Verified_PayTabs_full_refund_with_unused_included_credit_finalizes_accounting_and_revokes_credit`. |

## Current Financial Flow

`RefundsController` requires `FinanceAdmin`. `RefundService.RecordInternalRefundAsync` validates payment status, currency, amount, refundable balance, and idempotency key. Internal CourseCart refunds use serializable transactions for accounting, Payment/Refund transitions, available-credit disposition, and, at cumulative full refund, attributed-grant revocation. An invalid allocation leaves auditable `Requested` evidence. Sources: `RefundService.RecordInternalRefundAsync`, `FinalizeInternalAccountingAsync`, `RevokePaymentCourseAccessGrantsAsync`; `RefundFoundationTests`, `PartialRefundAccountingTests`.

For PayTabs, `InitiatePayTabsRefundAsync` creates provider-processing evidence, sends a full refund, and `VerifyPayTabsRefundAsync` attempts internal finalization only after a separate provider query matches expected transaction details. A timeout or mismatch records `ProviderResultUnknown`; definite failure is `ProviderFailed`. Same-key replay does not resubmit the provider request, and an already finalized refund is returned without another reversal. The PostgreSQL unused-credit test now also checks attributed-grant revocation. Sources: `RefundService` provider verification methods; `PayTabsRefundProviderTests.Verified_PayTabs_full_refund_with_unused_included_credit_finalizes_accounting_and_revokes_credit`.

`CommerceService` can put several courses in one `CourseCart` or `Membership` payment. Its purchase snapshot and `CourseSaleAllocation` rows identify courses and amounts, but `RefundService` currently reverses the **whole** allocation set. Sources: `CommerceService.cs` — trusted payment confirmation and `RecordCourseRevenueSplitAsync`; `backend/src/Betcco.Domain/Commerce/CommerceEntities.cs` — `Payment`, `CourseSaleAllocation`.

## Current Course Access Authority

`Enrollment` retains learning history and a mutable summary of access. `CourseAccessGrant` is the source record. `CourseAccessQueries.ActiveEnrollments` requires an Enrollment plus a current, unrevoked grant; pre-migration Enrollments receive unattributed Legacy grants. The protected Course Player, lesson/video access, private resources, practice, progress, and current entitlement projection use this server predicate (`ContentAccessService`, `LearningController`, `CourseAssignmentsController`, `StudentLearningToolsController`). Historical teacher/admin reads and completed evaluation results retain their existing history paths.

`CommerceService.GrantTimedCourseAccessAsync` can extend an existing Enrollment; `GrantPermanentCourseAccessAsync` can set its expiry to null and replace `PaymentId`. New grants record their immutable Payment, source type, source ID, and validity separately. `Enrollment.PaymentId` remains a mutable summary and is never the sole refund attribution proof.

## Current Entitlement Behavior

`CommerceService` grants one included evaluation credit per paid course Enrollment and canonical Unit, tied to `GrantedByPaymentId`, `EnrollmentId`, and `UnitDefinitionId`; free courses grant none. Checkout consumes an available, unrevoked credit only for a matching Unit and eligible Draft evaluation with clean evidence/authenticity, moves the request to `PendingAssignment`, and records an assessment audit event. It does not create a separate evaluation Payment. Sources: `CommerceService.GrantIncludedEvaluationEntitlementsAsync`, `TryConsumeIncludedEvaluationCreditOnceAsync`; `IncludedEvaluationEntitlementTests` — paid, free, cross-Unit, and same-Unit/two-Enrollment tests.

`RefundService.RevokeUnusedIncludedEvaluationCreditsAsync` revokes only credits granted by the refunded Payment whose `ConsumedByEvaluationRequestId` and `RevokedAtUtc` are null. The entity retains grant, consumption, and refund links. `BetccoDbContext` and migrations `20260925194114_AddIncludedEvaluationEntitlements` and `20260925212129_AllowIncludedCreditsPerEnrollment` establish restrictive foreign keys, consumed-or-revoked exclusion, and uniqueness per `(GrantedByPaymentId, EnrollmentId, UnitDefinitionId)`. The Student entitlement projection labels each credit `Available`, `Consumed`, or `Revoked` (`StudentLearningToolsController.Entitlements`).

## Product Policy Questions

**Resolved by user approval:** a finalized full course-payment refund ends future access at the next protected server authorization check; Enrollment and academic history remain. Partial refund defaults to a price concession with access and credits unchanged. Unused credits from the fully refunded Payment are revoked; consumed credits remain consumed and their committed reviews may continue. Completed evaluation results remain available for historical learner viewing. Another valid independent grant preserves course access. Ambiguous PayTabs results do not change access.

**Still unresolved:** reconciliation of pre-migration legacy sources; course-line or proportional partial-refund policies; learner notice/manual exceptions; external provider validation; and Resit commerce/access interaction. These do not reopen the approved decisions above.

## Decision Matrix

This table records the approved policy. RF1 implements source-specific cutoff for grants created with trusted provenance on its branch; legacy grants remain fail-safe until reconciled. “Full” means a trusted, internally recorded refund of the Payment that funds the course. “Preserve history” means no physical deletion of learning, submissions, feedback, or evaluation records.

| Refund | Course state / timing | Access type | Credit state | Evaluation state | Approved access effect | Entitlement effect | Historical data | Decision status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Full | Not started; before first use | Permanent or timed | None | None | Deny refunded access at next protected check after finalization unless another valid grant exists | None | Retain Enrollment/payment | Approved; RF1 branch implementation |
| Full | Not started; before first use | Permanent or timed | Available | None or Draft | Same | Revoke unused credit from refunded Payment; retain Draft/evidence | Preserve records | Approved; RF1 branch implementation |
| Full | In progress; active session | Permanent or timed | None or Available | None or Draft | Deny refunded access at next protected check after finalization | Revoke only available credit from refunded Payment | Preserve progress and Draft | Approved; in-flight technical handling unresolved |
| Full | In progress | Permanent or timed | Consumed | PendingAssignment, Assigned, UnderReview, or NeedsRevision | End future course-content access; committed evaluation may continue | Keep consumed link; never recreate or revoke it | Preserve evidence/review trail | Approved; RF1 branch implementation |
| Full | Completed; after completion | Permanent or timed | Consumed | Completed or Closed | End future course-content access | Keep consumed link | Preserve result, feedback, submissions, audit; learner may view historical completed result | Approved; RF1 branch implementation |
| Full | Any | Permanent or timed | Revoked | Any | Apply the source-specific access rule | Do not revoke again | Preserve all history | Approved; RF1 branch implementation |
| Full | Any; `Requested`, provider processing/verified without accounting, unknown, or failed | Permanent or timed | Any | Any | No refund-triggered access change before `InternallyRecorded` | No new credit change | Preserve all history | Approved safeguard |
| Partial price concession | Any | Permanent or timed | None, Available, Consumed, or Revoked | Any | Keep access unchanged | Keep credit state unchanged | Preserve all history | Approved default; financial execution pending |
| Full | Any; another valid independent purchase/grant covers same course | Permanent or timed | Any | Any | Keep access justified by the other grant | Revoke only unused credit tied to the fully refunded Payment | Preserve all history | Approved; RF1 branch implementation |

## Options Considered

| Option | Behavior | Advantages | Risks | Accounting implications | Learning-history implications | Entitlement implications | Complexity / current model / migration |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A — selected: immediate full-refund cutoff** | After internal finalization, deny the next protected course authorization check for affected grants; retain Enrollment. | Financial and access outcomes align promptly; server-enforceable. | In-flight operations need a race rule; wrong cutoff if another grant exists. | Couple to verified refund and affected course sources. | Keep progress, practice, submissions, feedback, results, and review evidence. | Revoke unused; preserve consumed. | Medium/high. Current expiry could cut off a simple sole grant, but reliable source-specific behavior/audit likely needs additive grant or revocation provenance; migration **appears necessary** for general multi-payment support. |
| **B — not selected: preserve access after full refund** | Refund finances and unused credit, leave course access. | Simple, no session disruption; matches current access effect. | Fully refunded learner may keep paid content; commercial inconsistency. | Existing full reversal suffices. | All history and access remain. | Existing unused-credit revocation conflicts with continued course use. | Low; current model; no migration apparent for access. |
| **C — not selected: scheduled full-refund cutoff** | End access at a later boundary (session end, fixed grace, or original expiry). | Gives notice and avoids abrupt interruption. | Needs an arbitrary boundary; leaves refunded access for a period. | Same full reversal; record effective cutoff separately. | Preserve records; progress may continue until cutoff. | Would need a rule for credit use during grace. | Medium/high; timed expiry alone cannot express refund cause or protect another grant; additive schedule/provenance migration likely for general case. |
| **P1 — selected default: partial price concession** | Leave every course/grant and credit unchanged. | Simple learner outcome. | May mismatch a course-specific refund promise. | Requires approved allocation and accounting/tax handling before execution. | No change. | No change. | Medium finance work; current partial request is only evidence; migration need depends on approved allocation design. |
| **P2 — not approved: specified course-line partial refund** | Cut off only the refunded course grant, if no other valid grant. | Matches item-level remedy; protects other courses. | Ambiguous packages/discount/tax and overwritten Enrollment payment source. | Needs line-level refund amounts, ledger/wallet/tax reversal rules. | Retain all affected/unaffected history. | Would revoke only unused credit attributable to refunded line; consumed separate. | High; current allocations help but are not refund-line decisions; additive allocation/provenance migration likely. |
| **P3 — not approved: proportional partial** | Keep all access or shorten timed grants by a future formula. | Can model subscription concessions. | Arbitrary entitlement value; permanent access has no natural duration. | Requires explicit proportional financial allocation. | Retain history. | Would need a proportional credit rule. | High; current model insufficient; migration likely if chosen. |
| **C1 — selected: honor consumed credit** | Let an already committed pending/active review continue; keep completed results. | Preserves committed academic service and evidence. | Refunded course may still receive review value. | Any service-value adjustment remains a separate financial design question. | No rewrite. | Consumption remains linked, never recreated or revoked. | Low for preservation; any exception/settlement audit may need new fields. |
| **C2 — not selected: pause/cancel pending review** | Pause or cancel a not-yet-completed included review after refund. | Limits further service delivery. | Disrupts assessment, evidence, and staff work; requires fair manual handling. | Would require adjustment/settlement for partially delivered service. | Keep attempt, submissions, feedback, and audit even if stopped. | Keep consumption evidence; release only by a separate future policy. | High; current refund path has no evaluation disposition; likely additive workflow/audit model and migration. |
| **H1 — selected: preserve and show completed result** | Retain result/audit and allow historical learner viewing after course-content access ends. | Academic traceability and learner access to completed work. | Result visibility must be separated from course-content authorization. | No new reversal by itself. | Immutable historical meaning maintained. | Consumed link retained. | Medium authorization review; migration not apparent solely for historical display. |
| **H2 — not selected: hide completed result** | Retain staff/audit record but restrict learner display. | Stronger post-refund access boundary. | Can impair learner rights and dispute handling. | No new reversal by itself. | Records still retained; presentation changes only. | Consumed link retained. | Medium; current display paths need review; migration not apparent unless exception history is required. |

## Approved Policy

**APPROVED PRODUCT POLICY — RF1 BRANCH IMPLEMENTATION, MERGE PENDING.** For a finalized full refund, end future course-content access at the **next protected server authorization check after `InternallyRecorded`** for provably attributable grants. This applies to permanent and time-bounded access, including learners who have not started, are in progress, or have completed the course. Keep the Enrollment and history. Do not change access for `Requested`, `ProviderProcessing`, `ProviderVerified` without completed internal accounting, `ProviderResultUnknown`, or `ProviderFailed`. An independent valid grant continues to justify access. Legacy unattributed grants are preserved pending reconciliation.

For a partial refund, the **approved default** is a price concession: course access and included-credit state stay unchanged. Course-line and proportional partial-refund policies are not approved. After a finalized full refund, revoke available/unused included credits tied to that Payment; retain consumed credit links without recreation or revocation, and let an already committed review continue. Preserve completed evaluation results and allow the learner to view those historical results even after course-content access ends.

## RF1 Implementation Evidence

`CourseAccessGrant` records stable source identity, optional Payment, validity, and refund revocation. `CourseAccessQueries.ActiveEnrollments` is the shared server predicate used by the course player, content reads, learner writes, practice, private resources, and the current-access projection. `CommerceService` creates grants during trusted payment confirmation; `RefundService.FinalizeInternalAccountingAsync` revokes only the refunded Payment's grants, together with unused-credit disposition and accounting in its existing transaction. Focused integration tests cover direct purchase, package, membership, course subscription, duplicate confirmation/refund, independent access, legacy ambiguity, consumed/unused credit, PostgreSQL concurrency, and migration from empty and previous schemas. The existing focused PayTabs unused-credit test verifies successful persistence; no live provider behavior is inferred.

## Historical Academic Data Policy

**Approved policy:** a refund must not physically erase `Enrollment`, lesson/content progress, Learning Aim Practice attempts, Final Unit Practice submissions/outcomes, evaluation submissions/evidence, feedback, completed results, assessment audits, or review history merely to block future course use. Financial reversal and academic-history preservation are separate concerns. `RefundService.FinalizeInternalAccountingAsync` currently touches none of those entities; `EvaluationRequest` links evidence/feedback/results/audits (`backend/src/Betcco.Domain/Evaluations/EvaluationEntities.cs`). Preserve historic staff/audit access and learner viewing of historical completed evaluation results even after course-content access ends. Implementation must distinguish result history from protected course content.

## Included Evaluation Entitlement Policy

**Current fact:** only available credits linked to the refunded Payment are revoked; consumed credits are not (`RefundService.RevokeUnusedIncludedEvaluationCreditsAsync`). **Approved policy:** after successful full-refund internal finalization, revoke an available/unused credit tied to that Payment. Never recreate or revoke a consumed credit; preserve its consumption relationship. An already committed `PendingAssignment` or active review may continue (**C1**). Preserve completed results and learner historical viewing (**H1**). A Draft evaluation has not consumed the credit; retain its Draft/evidence history while its unused credit is revoked. The database check constraint disallows both consumed and revoked timestamps. A separately paid evaluation has its own Payment and is not implicitly refunded by a course-payment refund. Pause/cancel (**C2**) is not selected.

## Multi-Course Payment / Refund Policy

**Approved policy:** no unrelated Enrollment or credit may lose access because another course was refunded, and another valid independent grant must preserve course access. RF1 revokes only grants whose `PaymentId` matches the fully refunded Payment and whose course appears in its trusted sale allocations. The approved partial price-concession default changes no course access or credit; a course-line partial-refund policy remains unapproved. Mutable `Enrollment.PaymentId` is not a complete grant history and is not used alone for attribution. Pre-migration legacy Enrollments remain unattributed and retain their access pending reconciliation. Do not infer a refund line from an amount alone.

## Partial Refund Policy

**Current implementation:** supported internal CourseCart partial refunds finalize accounting as a price concession and leave course access and included-credit state unchanged (**P1**). PayTabs partial execution remains disabled. Course-line termination (**P2**) and proportional access shortening (**P3**) are **not approved** and require a separate future policy.

## Concurrency / Race Conditions

RF1 tests concurrent full-refund finalization, an independent grant added during refund processing, and credit consumption competing with refund on PostgreSQL. The grant revocation, financial reversal, and unused-credit disposition share the refund's serializable transaction. **Approved cutoff:** the next protected server authorization check after `InternallyRecorded` denies refunded access unless another valid grant justifies it. A content request authorized before that commit may finish. In-flight streaming and every academic workflow interleaving have not been exhaustively tested; the existing transaction and database constraints are not proof of all possible races.

## Audit Requirements

RF1 records course-grant creation, source-specific refund revocation, and legacy reconciliation in existing `AuditLog` entries. The revocation event includes the actor, Payment, Refund, student, course, grant, source, old/new state, effective UTC, reason, policy version, and whether an independent grant preserved access. Existing `RefundStatusTransition`, `PaymentStatusTransition`, and credit refund links retain financial and entitlement evidence. A manual exception and legacy reconciliation workflow is still unresolved; audit records alone do not establish it.

## LENOVO / Resit Boundary

LENOVO owns future Resit Activation/`EvaluationRequest` lifecycle. It must coordinate if a refunded course loses access while a Resit authorization or new request remains pending or active, including evidence upload, result visibility, and separately paid service treatment. This document does not set Resit pricing or activation rules and changes no Resit/Retake/ASSESS code (`docs/WORKSTREAM_COORDINATION.md`, LENOVO section).

## Database / Migration Impact

RF1 adds `CourseAccessGrants` with restrictive Course, Payment, and Refund foreign keys, source uniqueness, access/refund lookup indexes, and source/validity/revocation constraints. The migration inserts unattributed Legacy grants for pre-existing non-deleted Enrollments and neither deletes nor rewrites their rows. Its `Down` intentionally refuses to discard provenance. Applying the migration to a real database still requires a backup and a review of unusual legacy data; local PostgreSQL tests cover both an empty migration chain and upgrade from the previous schema. No production migration has been run.

## Validation Matrix and Remaining Gaps

The cases below are the policy acceptance matrix. RF1 has focused local coverage for payment source creation, full and partial internal refunds, independent grants, legacy safety, available/consumed credit, PayTabs verified/unknown/failed states, PostgreSQL races, and migration. Live provider behavior, production migration, learner notice, and a dedicated completed-result-after-refund API test remain unverified.

1. Full internal and verified PayTabs refund: sole permanent/timed grants, before use/in progress/completed, access denial at the next protected read/write/stream authorization check after internal finalization, history retained.
2. Requested, provider-unknown/failed, replay, and concurrent finalization: no early/duplicate access action, credit change, ledger reversal, or audit transition.
3. Available/consumed/revoked/no-credit cases, including Draft, PendingAssignment, active review, Completed, same-Unit credits from two Enrollments, and checkout-versus-refund races.
4. Multi-course payment, package, independent later purchase/renewal, overwritten Enrollment `PaymentId`, and manual/legacy Enrollment: unrelated valid access retained.
5. Approved partial price concession: financial/tax and wallet effects follow a future approved allocation while access and credits remain unchanged. Test course-line or proportional behavior only if separately approved later.
6. Transaction failure/recovery and audit evidence; learner/staff historical result visibility; repeat callbacks. Use relevant PostgreSQL constraint/integration tests as well as controller access tests.
7. The focused PayTabs full-refund test with an unused included credit now confirms grant revocation and credit disposition on PostgreSQL. Live PayTabs behavior remains unverified.

## Still Unresolved

- Manual reconciliation of ambiguous legacy Enrollments, including overwritten `Enrollment.PaymentId`; RF1 does not infer historical Payment ownership.
- Learner notice and manual exception process. An in-flight request authorized before the refund transaction commits may finish; the next protected check after commit uses the revoked grant state.
- Any course-line partial-refund or proportional access-reduction policy; neither is approved. Partial price-concession financial allocation, discounts, tax, and provider execution still need implementation design.
- Live PayTabs provider behavior remains unverified. The focused PostgreSQL unused-credit persistence test succeeds; ambiguous provider results do not change access.
- Resit commerce/access interaction and separately paid service handling with LENOVO. No Resit pricing or activation policy is decided here.

## Explicitly Out of Scope

RF1 does not change payout, Resit/Retake/ASSESS activation or pricing, AI/RAG, PayTabs partial execution, or production deployment. The original policy-only PR #80 made no runtime changes; RF1 is the subsequent implementation branch.
