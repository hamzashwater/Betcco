# JOD Money Contract

## Status

**APPROVED INTERNAL MONEY CONTRACT — PARTIAL REFUND EXECUTION STILL DISABLED.**

This decision establishes the monetary precision rule for new supported financial operations. It does not approve partial refund accounting, PayTabs partial execution, or partial CreditNotes.

## Contract

- JOD has a scale of three decimal places and a minor unit of `0.001m`.
- Monetary values use .NET `decimal`; no binary floating-point conversion is part of this contract.
- Calculated JOD amounts use `Math.Round(value, 3, MidpointRounding.AwayFromZero)`, including negative ledger or wallet calculations.
- Externally supplied or requested JOD amounts must already be numerically representable at three decimals. `1.2340m` is representable; `1.2345m` and `0.0001m` are not. Representability is separate from positivity and other business validation.
- Requested refund amounts are rejected when not representable. They are never silently rounded into a different requested amount.
- Only JOD is configured in `MoneyPolicy`. A non-JOD currency needs an explicit future configuration and review of its scale; this contract does not infer one.

`backend/src/Betcco.Domain/Common/MoneyPolicy.cs` is the centralized application rule. `RefundService.RecordInternalRefundAsync` checks the matched payment currency and request amount before creating a `Refund` or calculating a refundable balance. An unsupported currency returns `REFUND_CURRENCY_UNSUPPORTED`; a JOD amount with excess precision returns `REFUND_AMOUNT_SCALE_INVALID`. The existing positive-amount, currency-match, balance, and partial-allocation guards continue to apply.

## Storage and historical evidence

The EF/PostgreSQL `numeric` storage scale is not the authoritative validation boundary. This decision adds no schema constraint or migration and does not rewrite or normalize historical Payment, Refund, allocation, ledger, wallet, Invoice, or CreditNote snapshots. ASUS-08B must treat historical JOD amounts with more than three decimal places as review-required rather than silently changing persisted evidence. It must use this same policy for new calculated tax, revenue, allocation, commission, and teacher-split targets.

## Provider boundary

The PayTabs adapter remains a provider primitive and continues to serialize a supplied `1.2345m` unchanged. Its local simulated-HTTP capability does not authorize partial refund execution. The live/sandbox PayTabs partial-refund amount contract, acceptance, and retry behavior remain unverified. `PARTIAL_REFUND_PROVIDER_EXECUTION_DISABLED` and `PARTIAL_REFUND_ALLOCATION_POLICY_REQUIRED` remain active guards.
