# PayTabs partial-refund contract verification — ASUS-08C1

**Date:** 2026-09-27. **Baseline:** `origin/main` `c7df4659c31b1824631316bb1bc0e6a9efb0c221`. **Decision: NO-GO / REMAIN DISABLED** for ASUS-08C2 PayTabs partial-refund execution. This is an evidence review, not a provider integration or authorization to send refunds.

## Environment and evidence boundary

- Official PayTabs documentation was reviewed on 2026-09-27. PayTabs Test/Sandbox was **not exercised**: no matching PayTabs credential variables or local `.env` were available to this workspace. **Sandbox result: BLOCKED — CREDENTIALS NOT AVAILABLE.** No PayTabs API request, test charge, or refund was sent.
- Existing BETCCO tests use scripted in-process HTTP, not a PayTabs server. PostgreSQL regression tests use a disposable local database, not a provider environment.
- PayTabs capabilities can vary by merchant profile, acquiring bank, region, payment method, merchant balance, and transaction limits. The [transaction-type documentation](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/Request-Response-transaction-type/) states profile and acquirer restrictions. Documentation-only findings do not prove this merchant's JOD behavior.

## Official contract and request/query shape

PayTabs documents a refund as `POST {region-domain}/payment/request`, with `tran_type: "refund"` and the original successful Sale/Capture reference in request `tran_ref`. Its hosted API example includes `profile_id`, `tran_class: "ecom"`, `cart_id`, `cart_currency`, `cart_amount`, and `cart_description`; no refund callback is shown as required. The [refund API article](https://support.paytabs.com/en/support/solutions/articles/60000807026-7-4-hosted-payment-page-apis-refund-transaction) and [technical refund manual](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Invoices-APIs/Invoices-Step-7-Manage-Transactions/Invoices-Step-7-Refund-Transaction/) supply this shape. The technical manual lists the Jordan endpoint as `https://secure-jordan.paytabs.com/payment/request`; the configured region endpoint still must be checked against the actual Test profile.

Illustrative request with **invented identifiers only**, never a captured provider request:

```json
{
  "profile_id": "<TEST_PROFILE_ID>",
  "tran_type": "refund",
  "tran_class": "ecom",
  "cart_id": "BETCCO-REFUND-<REFUND_GUID>",
  "cart_currency": "JOD",
  "cart_amount": 25.123,
  "cart_description": "BETCCO refund",
  "tran_ref": "<ORIGINAL_SALE_OR_CAPTURE_REFERENCE>"
}
```

The [refund response sample](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Invoices-APIs/Invoices-Step-7-Manage-Transactions/Invoices-Step-7-Refund-Transaction/) includes a new `tran_ref`, `previous_tran_ref` pointing to the parent, `tran_type`, `cart_id`, `cart_currency`, `cart_amount`, and `payment_result.response_status`/`response_code`. It is a **structural example, not an amount-fidelity test**: its example request and response amounts differ. The [previous-reference documentation](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/Response-Previous-Tran-Ref/) also describes the parent link for refunds.

PayTabs documents `POST {region-domain}/payment/query` by `{ "profile_id": ..., "tran_ref": "<REFUND_REFERENCE>" }` for one transaction, or `{ "profile_id": ..., "cart_id": "<REFUND_CART_ID>" }` for an array of matching transactions. The [query article](https://support.paytabs.com/en/support/solutions/articles/60000806381-7-1-hosted-payment-page-apis-query-transaction) shows amount, currency, type, reference and status in query examples. It does not demonstrate a real partial JOD refund query, guarantee a `previous_tran_ref` in that query, or specify how soon a just-created refund becomes queryable. Searching by the *original payment's* cart ID is not documented as an API that enumerates all child refunds; dashboard history is described in the [transaction-type article](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/Request-Response-transaction-type/).

The [PayTabs status reference](https://support.paytabs.com/en/support/solutions/articles/60000711358) lists `A` authorized, `P` pending **for refunds**, `H` hold, `E` error, and `D` declined, among other states. A successful HTTP response alone cannot prove final refund success. It does not define a bounded transition time from `P` to a final state.

## Capability matrix

`VERIFIED` here means demonstrated by existing local code/tests only where explicitly labelled. No provider behavior is sandbox verified.

| Capability | Classification | Evidence and remaining limit |
| --- | --- | --- |
| Partial amount smaller than captured amount | **DOCUMENTED BUT NOT SANDBOX VERIFIED** | [PayTabs refund instructions](https://support.paytabs.com/en/support/solutions/articles/60000691210-how-to-refund-a-transaction) explicitly call an amount below the original a partial refund; API refund `cart_amount` supplies the refund amount. Merchant/profile support is untested. |
| Multiple partial refunds against one original | **DOCUMENTED BUT NOT SANDBOX VERIFIED** | [PayTabs error 118 example](https://support.paytabs.com/en/support/solutions/articles/60000908139--e-118-amount-greater-than-available-balance) has a 100 sale, a successful 60 refund, and a rejected next refund of 50. This shows follow-up requests after a partial, but not the exact 20/30/66 JOD sequence on this profile. |
| Cumulative limit and over-refund | **DOCUMENTED BUT NOT SANDBOX VERIFIED** | The same error 118 example says the second 50 exceeds remaining 40. Merchant available balance may separately reject a refund with code 342, per the [refund-balance article](https://support.paytabs.com/en/support/solutions/articles/60000711814-refund-error-342-refund-balance-exceeded-). Exact equality at 116.000 JOD and concurrent requests remain untested. |
| Separate refund reference, stability, query by returned reference | **DOCUMENTED BUT NOT SANDBOX VERIFIED** | [Refund instructions](https://support.paytabs.com/en/support/solutions/articles/60000691210-how-to-refund-a-transaction) say a new linked refund transaction/reference is created; [query by `tran_ref`](https://support.paytabs.com/en/support/solutions/articles/60000806381-7-1-hosted-payment-page-apis-query-transaction) returns the requested transaction. Stability across timing and real refunds remains untested. |
| Exact refund amount/currency/type/status in query | **DOCUMENTED BUT NOT SANDBOX VERIFIED** for fields; **UNVERIFIED** for exact JOD fidelity | Query examples contain these fields, but not an actual 25.123 JOD refund. The refund request/response example has mismatched sample amounts and cannot prove exact echo. |
| Original transaction linkage in provider response/query | **DOCUMENTED BUT NOT SANDBOX VERIFIED** for response `previous_tran_ref`; **UNVERIFIED** for query | The [refund manual](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Invoices-APIs/Invoices-Step-7-Manage-Transactions/Invoices-Step-7-Refund-Transaction/) includes `previous_tran_ref`. The inspected [query examples](https://support.paytabs.com/en/support/solutions/articles/60000806381-7-1-hosted-payment-page-apis-query-transaction) do not establish this field for a queried refund. |
| Enumerate all refunds from original payment | **UNVERIFIED** | `cart_id` query returns matches for that same cart ID; BETCCO uses a distinct cart ID per refund. No reviewed API contract promises child-refund enumeration by original reference. |
| Full refund after earlier partials | **UNVERIFIED** | The same `refund` transaction type is documented; a final remainder equal to available amount and its equivalence to a one-shot full refund are not demonstrated. No separate full-refund operation was found in the reviewed API. |
| JOD amounts `0.001`, `1.234`, `25.123`, `115.999` | **UNVERIFIED** | PayTabs lists JOD as a currency in its [Laravel configuration manual](https://docs.paytabs.com/manuals/Backend-Web-Packages/Laravel/Laravel-Configure-the-integration-method/), but the generic [`cart_amount` parameter](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/Request-Response-cart-amount/) states a `0.01` minimum and gives two-decimal examples; it supplies no JOD-specific scale or exact echo guarantee. `0.001` is below that published generic minimum. Merchant limits can differ. |
| `1.2345` JOD provider behavior | **UNVERIFIED** | No reviewed official source specifies accept/reject/round/truncate for four decimal places; no sandbox call was made. Existing local adapter tests only show it sends the value unchanged. |
| Provider-side idempotency/duplicate prevention | **UNVERIFIED** as an idempotency contract | The official [`cart_id` documentation](https://docs.paytabs.com/manuals/PT-API-Endpoints/Integration-Types-Manuals/Request-Response-Parameters/Request-Response-cart-ID/) describes a duplicate error for identical `cart_id`, amount, currency and profile **within less than two minutes**. Its applicability to refund follow-up requests is not shown. It does not promise permanent uniqueness, return the earlier transaction on replay, or cover later retries. No separate refund idempotency key was found in the reviewed refund request. |
| Timeout recovery without a returned refund reference | **UNVERIFIED** | Query by merchant `cart_id` is documented and is a candidate recovery path. Its behavior for a timed-out refund, pending transactions, duplicate matches, and eventual visibility is untested. **Blind retry is unsafe.** |

### Bounded 116.000 JOD matrix

| Scenario | Provider result |
| --- | --- |
| Test Sale/Capture 116.000 JOD | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| First partial 20.000 JOD | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| Exact 25.123 JOD partial and query comparison | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| Query first refund by returned reference | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| Second partial 30.000 JOD | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| Final partial 66.000 JOD (cumulative 116.000) | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| Cumulative over-refund and four-place `1.2345` JOD | **BLOCKED — CREDENTIALS NOT AVAILABLE** |
| Safe transport timeout and recovery without replay | **BLOCKED — CREDENTIALS NOT AVAILABLE** |

## BETCCO implementation evidence and gaps

- `PayTabsPaymentProvider.CreateRefundAsync` in `backend/src/Betcco.Infrastructure/Services/PaymentProviders.cs` constructs the documented shape with `request.Amount` as `cart_amount` and the original reference as request `tran_ref`; it does not validate the amount's scale or retry. `VerifyRefundAsync` queries by a known refund reference. ASUS-09B adds a separate server-owned refund cart-ID discovery query and retains optional `previous_tran_ref`; this is for full-refund recovery only. Existing adapter tests use scripted HTTP, not provider acceptance.
- `RefundService.IsExpectedProviderTransaction` in `backend/src/Betcco.Infrastructure/Services/RefundService.cs` compares profile, refund `tran_ref`, refund cart ID, currency, amount, type and successful status; ASUS-09B also checks original-payment linkage **when PayTabs returns it**. Automatic cart-ID reference recovery requires that linkage, while ordinary reference verification still accepts its documented absence. This does not establish consistent linkage on this merchant's real queries for future partial execution. `InitiatePayTabsRefundAsync` creates only `payment.Total` refunds, rejects an existing partial record using `PARTIAL_REFUND_PROVIDER_EXECUTION_DISABLED`, and does not expose a partial amount via `InitiatePayTabsRefund` in `backend/src/Betcco.Application/Commerce/CommerceContracts.cs` or `RefundsController` in `backend/src/Betcco.Api/Controllers/RefundsController.cs`. `RecordInternalRefundAsync` blocks direct PayTabs internal recording with `PAYTABS_PROVIDER_VERIFICATION_REQUIRED`.
- **Historical full-refund limitation resolved by ASUS-09A:** At this document's original baseline, `ToRefundTransaction` treated every non-`A` status as `IsDefiniteFailure` even though PayTabs calls `P` pending. ASUS-09A corrected the full-refund classification; real profile behavior remains untested.
- A create timeout can leave no `ProviderRefundReference`. ASUS-09B now permits conservative full-refund cart-ID discovery through `RefundService.VerifyPayTabsRefundAsync`, requiring a single matching result with original-transaction linkage before a reference is bound. Missing/ambiguous results remain unknown. Local idempotency keys protect BETCCO's refund row, but they do not prove PayTabs deduplication or make a second external send safe.
- The [internal JOD contract](jod-money-contract.md) rejects nonrepresentable requested amounts such as `1.2345`, and ASUS-08B's provider-agnostic accounting is on `main`. Neither proves PayTabs's JOD precision or authorizes provider partial execution.

## Decision and next evidence

**NO-GO / REMAIN DISABLED.** Official documentation establishes a partial-refund concept, the refund request shape, separate refund references, a query endpoint, and an illustrative cumulative-limit error. It does not establish this merchant's exact JOD three-decimal behavior, `1.2345` handling, provider visibility and linkage after an unknown create result, safe duplicate behavior beyond the two-minute window, or the 116.000 JOD sequence. ASUS-09A corrected pending-state classification and ASUS-09B added conservative full-refund reference discovery, but neither proves the merchant-specific partial-refund contract required for ASUS-08C2.

The next verification step is a controlled PayTabs **Test-profile** matrix with securely supplied test credentials and PayTabs-supported test transactions, including exact query comparisons, `previous_tran_ref`, cart-ID lookup after an unknown result, pending-state handling, and duplicate behavior. No production credentials, customer charges, blind retries, logging of secrets, or provider partial enablement are authorized by this report. If the test environment cannot establish the unknown-result/idempotency contract, request written PayTabs confirmation and keep execution disabled. Internal partial accounting remains available for supported non-PayTabs paths.

## Local validation and change scope

- Focused `PayTabsPartialRefundAdapterTests`, `PayTabsRefundProviderTests`, `RefundFoundationTests`, and `PartialRefundAccountingTests`: **43 passed, 0 failed**. PostgreSQL tests targeted newly created databases in a disposable local PostgreSQL container; they did not connect to an existing application database.
- `MoneyPolicyTests`: **4 passed, 0 failed**. `dotnet build backend/Betcco.sln -c Release`: **passed, 0 warnings/errors**.
- `dotnet format backend/Betcco.sln --verify-no-changes --no-restore` and staged `git diff --check`: **passed**.
- No production runtime, provider route, accounting implementation, database schema, migration, dependency, or lock file was changed. This document is the sole deliverable in ASUS-08C1.
