# PayTabs full-refund pending-state classification — ASUS-09A

**Decision (2026-09-27):** Keep a PayTabs refund with a non-final or unrecognized status recoverable. This change applies only to the existing full-refund path. PayTabs partial-refund execution remains disabled (`PARTIAL_REFUND_PROVIDER_EXECUTION_DISABLED`, ASUS-08C2 NO-GO).

## Evidence and classification

`PayTabsPaymentProvider.ToRefundTransaction` previously classified every non-`A` status as a definite failure. That could send a pending refund through `RefundService.RecordProviderFailureAsync` into `ProviderFailed` before provider settlement was known.

The official [PayTabs response-status reference](https://support.paytabs.com/en/support/solutions/articles/60000711358) defines `A` as Authorized, `P` as Pending **for refunds**, `H` as Hold, `D` as Declined, `E` as Error, `X` as Expired, and `V` as Voided. Its code `600/P` description explicitly includes manual refunds processed by the finance team. PayTabs also describes manually operated refunds as [on hold](https://support.paytabs.com/en/support/solutions/articles/60000717971-step-5-native-ios-sdk-handle-the-payment-response). These are provider documentation facts; no PayTabs sandbox call was made for this change.

For refund responses with successful HTTP transport, the adapter now reports `A` as successful, `D`/`E`/`X` as definite non-success, and `P`/`H` as non-final. `V` and unknown statuses remain non-final for this full-refund workflow because the general `V` definition does not establish a safe refund-specific failure transition. An HTTP error is inconclusive even when its payload contains a final-looking status. The existing `IsSuccessful` and `IsDefiniteFailure` booleans express these states without a new contract field. Checkout/payment classification is unchanged.

## Full-refund behavior and limits

`RefundService` routes `P`, `H`, and unknown responses to `ProviderResultUnknown`, retaining a returned refund reference for later `VerifyRefundAsync` queries. Repeated queries may remain unknown, reach `A` and then pass the existing trusted verification and internal accounting checks, or reach a definite failure. There is no ledger or wallet reversal, payment refund status, included-credit revocation, or access change while the provider outcome is unknown. Local idempotency prevents a repeated request with the same key from creating another refund; no blind provider create retry was added.

ASUS-09B adds [conservative cart-ID reference discovery](paytabs-refund-recovery-reconciliation.md) for a create timeout without a usable refund reference. Query by refund reference still requires a safely recovered reference. Neither slice claims provider-side idempotency, sandbox verification, or support for partial PayTabs refunds. The separate [partial-refund contract decision](paytabs-partial-refund-contract-verification.md) remains NO-GO.
