# Taxed Full Refund Accounting Policy

## Status

**APPROVED INTERNAL ACCOUNTING POLICY — NOT IMPLEMENTED.** The user approved the rules in this document for a future ASUS-06 runtime change. This ASUS-05 slice changes documentation only. PR #84 remains Draft, and its ASUS-04 PostgreSQL reproduction remains intentionally failing. Approval here does not establish statutory tax treatment or tax-authority reporting correctness.

## Repository Baseline and Evidence

- On 2026-09-27, `origin/main` was `a2624c58134a84e1bbeae7b790dc60182c94b77e`; the clean ASUS branch was `fix/taxed-full-refund-accounting` at `45ad23dffd7cfcc4e0ff1d60ee205ce5e2e04d7c`. PR #84 was the only open PR and changed only `backend/tests/Betcco.IntegrationTests/PayTabsRefundProviderTests.cs`. The intervening LENOVO pagination merge did not change the Commerce, Refund, or financial entity files cited here.
- `backend/src/Betcco.Infrastructure/Services/CommerceService.cs` — `CreateCourseCheckoutAsync`, `CalculateTaxAsync`, `RecordCourseRevenueSplitAsync`, and `BookPaidCourseSaleLedgerAsync` establish the persisted Payment tax/total and tax-exclusive course revenue, commission, wallets, and ledger entries.
- `backend/src/Betcco.Infrastructure/Services/RefundService.cs` — `InitiatePayTabsRefundAsync`, `VerifyPayTabsRefundAsync`, `FinalizeInternalAccountingAsync`, `BookFullCourseSaleRefundAsync`, `AddWalletReversals`, and `RevokeUnusedIncludedEvaluationCreditsAsync` establish the current full-refund path.
- `backend/src/Betcco.Domain/Commerce/CommerceEntities.cs` — `Payment`, `Refund`, `RefundStatusTransition`, `CourseSaleAllocation`, `LedgerTransaction`, `LedgerEntry`, and `WalletTransaction` define the stored evidence. `backend/src/Betcco.Domain/Common/Enums.cs` — `LedgerAccountCode` contains only `CourseSaleClearing`, `PlatformCommission`, and `TeacherEarningsPayable`.
- `backend/src/Betcco.Infrastructure/Services/CommercialDocumentService.cs` — `IssueCreditNoteAsync` requires an internally recorded full refund matching the original invoice total and sets the internal CreditNote amount to `Refund.Amount`.

## Current Verified Behavior and ASUS-04 Reproduction

`CommerceService.RecordCourseRevenueSplitAsync` uses `Payment.Total - Payment.Tax` as revenue after discount. It distributes that amount across `CourseSaleAllocation.NetAmount`, calculates `PlatformCommission` and `TeacherEarning` from each net allocation, and books a balanced revenue-only sale ledger. The sale ledger does not book tax. `RefundService.FinalizeInternalAccountingAsync` currently requires `Sum(CourseSaleAllocation.NetAmount) == Refund.Amount`; a PayTabs full refund uses `Refund.Amount == Payment.Total`. These are **current code facts**, not the approved replacement rule.

`PayTabsRefundProviderTests.Verified_PayTabs_full_refund_of_taxed_course_finalizes_accounting` created a real PostgreSQL course checkout and paid sale through `CommerceService`, with simulated successful PayTabs sale and refund responses. The persisted Payment had `Subtotal = 100 JOD`, `Tax = 16 JOD`, and `Total = 116 JOD`; its valid CourseSaleAllocation had `NetAmount = 100 JOD`. The full `Refund.Amount` was `116 JOD`. PayTabs refund creation and separate query verification succeeded in the test, but `RefundService` returned `REFUND_ALLOCATION_POLICY_REQUIRED`. The Refund persisted as `ProviderVerified` with its provider reference; the Payment remained `Paid`, with no refund ledger or wallet reversal and no unused-credit revocation. Calling the current verification method again returned `PAYTABS_REFUND_REQUIRES_REVIEW`. **Result: defect/policy gap confirmed against simulated provider responses; no live PayTabs refund was executed.**

## Approved Monetary and Allocation Rule

For a full course-payment refund, use the **persisted** Payment and Refund snapshots:

```text
Refund.Amount = Payment.Total
expectedRevenueAmount = Payment.Total - Payment.Tax
Sum(CourseSaleAllocation.NetAmount for the Payment) = expectedRevenueAmount
```

The provider/customer refund includes the original persisted `Payment.Tax`. `CourseSaleAllocation.NetAmount` remains post-discount, tax-exclusive course revenue and must **not** be required to equal `Payment.Total`. Do not recalculate historical tax from the current `SalesTaxPercent`, course prices, or coupon settings. The same summed-allocation rule applies to a full refund of a multi-course Payment; it does not authorize a course-line or partial refund.

Tax must not contribute to `PlatformCommission`, `TeacherEarning`, teacher wallet earnings, or course revenue allocation proportions. It remains separate in the Payment/Refund monetary snapshot. The current revenue ledger has only `CourseSaleClearing`, `PlatformCommission`, and `TeacherEarningsPayable`. Full-refund accounting reverses the **same tax-exclusive revenue split actually booked at sale time**: each allocation's `NetAmount`, `PlatformCommission`, and `TeacherEarning`. This policy adds no `TaxPayable`/VAT account and does not portray the revenue ledger as a complete statutory general ledger.

Wallet reversals remain revenue-only: platform commission, unassigned course revenue where applicable, and teacher earnings. No tax amount enters platform or teacher earning wallets. After trusted provider verification and successful internal finalization, the Payment becomes `Refunded` and the Refund becomes `InternallyRecorded`. Unused included evaluation credits follow the already-approved refund entitlement policy in `docs/decisions/refund-course-access-policy.md`; this decision does not change course access.

## ProviderVerified Recovery

**Approved recovery policy, not current behavior:** a Refund already in `ProviderVerified` may resume **local internal accounting** when its stored PayTabs verification evidence is valid. The future implementation must verify the persisted provider reference, verification timestamp/status, and matching append-only `RefundStatusTransition` evidence against the same Refund and Payment. Missing or inconsistent evidence requires review, not an invented success.

Recovery must never create another provider refund or call PayTabs `CreateRefund` again. It must preserve the original provider refund reference and existing transition history, add only the missing controlled internal-finalization evidence/effects, and be idempotent under retries and concurrent workers. A Refund already `InternallyRecorded` returns idempotent success without another ledger reversal, wallet reversal, or credit revocation. Financial reversal and state transitions must commit atomically or remain safely retryable.

## Validation Guards for Future Implementation

Reject for review rather than infer amounts or fabricate accounting when any of these conditions holds:

- `Payment.Tax < 0` or `Payment.Total < Payment.Tax`.
- `Refund.Amount != Payment.Total` for the full refund.
- Any allocation currency differs from Payment currency.
- The Payment has no course allocations, or their `NetAmount` sum differs from `Payment.Total - Payment.Tax`.
- PayTabs finalization/recovery lacks required trusted provider verification evidence.

Use persisted financial values and the Payment's entire allocation set. Preserve append-only refund/payment transitions, refund audit evidence, and existing idempotency protections. A failed validation must not mark Payment `Refunded`, book a partial reversal, or revoke included credits.

## Internal Commercial Documents and Statutory Boundary

The internal Refund and, when issued, CreditNote continue to represent the **total** refunded amount, including the persisted tax component. This engineering rule says nothing about a jurisdiction's tax liability, tax adjustment, fiscal document format, or authority submission. JoFotara and any statutory/general-ledger tax model require separate verified requirements and design. No historical tax-ledger backfill or new tax account is approved here.

## ASUS-06 Acceptance Evidence

The existing ASUS-04 PostgreSQL test must turn green without weakening its sale or refund assertions. Focused tests should also cover zero-tax full refunds, multi-course summed allocations, discount snapshots, invalid tax/total/amount/currency/evidence guards, local `ProviderVerified` recovery without another provider refund, concurrent/replayed recovery without duplicate financial or entitlement effects, and total-valued internal CreditNote behavior where applicable. These are future tests; ASUS-05 adds none.

## Explicitly Out of Scope

Partial, proportional, and course-line refunds; a `TaxPayable`/VAT ledger account; statutory tax reporting; JoFotara behavior changes; historical general-ledger backfill; Refund → Course Access implementation; payout; Resit/Retake/ASSESS; and AI/RAG. No runtime, test, database, or migration change is made by this document.
