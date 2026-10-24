# UI-D01-15 / Slice 5 — Finance Commission Settings

**MOCKED UI-CONTRACT EVIDENCE.** This is one working slice label under the
existing UI-D01-15 roadmap entry, not another official roadmap ID.

Base: `f7b87b4fb6e7132cb30d57a6cd48c2219745e559` (PR #211 merged).
Roadmap: `UI-DEEP-01-Modernization-Roadmap.md:188–196`; exact owner at line 191,
one module/archetype per slice at line 195. Only Commission Settings production
code and its private CSS are adopted. Eleven paired EN/AR factual copy additions
are inside the existing `commerceCatalog` namespace; every original value is
unchanged.

The two forms now distinguish server value, unsaved local draft, the local
Teacher Share preview, explicit Save/native confirmation, independent query
state and correctly owned mutation feedback. Query failures never fabricate
backend defaults. Real cached data remains visible on refresh error. Opaque
panels, dividers, semantic state/action pairs, 44px controls, 3px focus with 2px
offset, LTR numeric inputs and routine weights 400/500/600/700 use the existing
locked design system. No shared tokens, wallet UI or other module was migrated.

## Frozen financial contracts

- Commission: `["platform-commission"]`; GET/PUT
  `/admin/commerce-catalog/commission`; PUT body `{ platformCommissionPercent }`.
- Sales Tax: `["sales-tax"]`; GET/PUT `/admin/commerce-catalog/sales-tax`;
  PUT body `{ salesTaxPercent }`.
- No query option, API path/method, response, payload, authorization, payment,
  entitlement, backend, audit, AI/RAG, dependency or JOD contract changed.
- Draft ownership remains `draft ?? serverValue.toString() ?? ""` independently
  for each form. No query refresh overwrites a local draft; no persistent cache
  or optimistic financial update was added.
- Finite inclusive 0..100 validation, native required number inputs,
  min 0/max 100/step 0.001/dir LTR and exact pending/validity action guards stay.
- Teacher Share stays `valid ? 100 - value : commission.data?.teacherSharePercent`,
  formatted with exactly three decimals. It is never a PUT field or editable
  setting. Presentation suppresses the preview when neither query data nor a
  local draft exists; it does not create a financial fallback.
- Submit → existing validation/pending guard → exact translated `window.confirm`
  → mutation. Cancellation produces zero writes. No autosave or Save all.
- Commission success clears only its draft and invalidates only
  `["platform-commission"]` and `["admin-wallet"]`. Tax success clears only its
  draft and invalidates only `["sales-tax"]`. Failures preserve drafts.
- The existing shared notice string is retained. Additional presentation
  metadata identifies the callback's setting and success/error tone, preventing
  one setting's failure from being displayed as the other setting's success.

## Validation

See `manifest.json` for the final exact source hashes and retained original logs.

| Check                                              | Result                                 |
| -------------------------------------------------- | -------------------------------------- |
| Clean preflight-equivalent baseline                | 428/428, 9 files                       |
| Complete corrected focused batch                   | 579/579, 11 files                      |
| Full frontend `pnpm test --maxWorkers=2`           | 3450/3450, 135 files                   |
| Existing backend commerce/wallet tests             | 11/11, EF InMemory                     |
| External actual-controller probe                   | 53/53 checks, EF InMemory              |
| Browser matrix                                     | 12/12, 29 captures each, 348 originals |
| Format / ESLint zero warnings / TypeScript / build | PASS                                   |
| `git diff --check`                                 | PASS                                   |

The direct frontend tests independently compare pre-edit executable contracts,
validate endpoints/keys, no fan-out/autosave, both boundary values, out-of-range
and non-finite values, exact precision, preview formatting/fallback, native
confirmation ordering/cancellation, pending guards, payloads, draft independence,
exact invalidations, error ownership, cold query failures and cached refresh
failures. Mutation probes reject drift. Historical baseline fixtures remain
byte-identical. Only two existing test/support files receive exact fail-closed
Commission owner/copy/guard projections; no broad exemption or baseline hash
replacement was introduced.

EN/AR × light/dark × 1440×900, 834×1112, 390×844 covers both settings loaded,
independent loading/error, valid/invalid drafts and boundaries, derived preview,
both native confirmation accept/cancel flows, pending/success/retained-draft
failures, cached refresh errors, real long Arabic catalogue copy, keyboard focus
and half-width (minimum 320px) reflow proxy. Numeric fields remain LTR. Actual
native `confirm` type/message/decision/write ordering is recorded in each
scenario's `contracts.json`: 96 native dialog events including 24 dismissals.
Screenshots show the underlying real route after accept/dismiss, not OS dialog
pixels; no fake custom confirmation modal exists.

Full-route original PNGs, scenario JSON, dialog records and logs are retained at:

`C:/Users/user/Documents/Codex/2026-10-17/files-pasted-by-the-user-device/outputs/UI-D01-15-Slice5/`

The four committed contact sheets are labeled cropped/resized previews of the
target bounds. They are not replacements for the original full-route evidence.
Manifest hashes bind every original screenshot/record, preview and validated
source to the containing commit without an impossible self-referential SHA.

## Original failures and limits

All original failure logs remain in the evidence directory and manifest:

1. The initial baseline command overlapped unfinished dependency installation
   and subsequent edits: 20 failed/408 passed. It is rejected as pristine
   baseline evidence. The existing clean Slice 4 checkout's tree was verified
   identical to preflight main and its full nine-file batch passed 428/428.
2. The first focused batch had 8 failed/571 passed. New test code matched both
   a form and input by label and asserted async query notification too early.
   Input scoping and explicit DOM waiting fixed the harness; the full corrected
   batch passed 579/579, without a production workaround.
3. The external probe initially failed CS0246 because its namespace import was
   missing. Only the external probe was corrected; all 53 checks then passed.
4. The first browser pilot passed 2/2 but visual inspection found sticky shell
   overlap in tall element screenshots. The first full matrix was deliberately
   interrupted, not counted. Full-route scroll-top capture and exact target
   bounds corrected the capture method; pilot 2/2 and complete matrix 12/12 pass.

Existing backend tests have no direct Commission/SalesTax cases. The separate
external probe executes the actual unchanged controller and checks fallback
30/0, complement, bounds, invariant `0.###` storage and audit metadata using EF
InMemory. Neither that probe nor browser interception proves HTTP authorization,
PostgreSQL persistence, invoices, payments, JOD settlement or wallet accounting.
Existing NU1902/NU1903 cryptography restore warnings and two nonfatal jsdom
navigation diagnostics are retained. The local `pnpm start` standalone-output
warning is not a deployment result. No full WCAG or production-readiness claim.

Qualification creation's missing frontend `SpecializationId` remains separate
known debt and unchanged. Previous UI-D01-15 slices, other Finance/Commerce
surfaces, Student/Teacher/Admin Home/Assessment, AI/RAG, backend, dependencies and
#190 remain frozen. Remote CI must be reported only for the final pushed head.

Handoff boundary: **ONE DRAFT PR; NOT READY; NOT MERGED; no Slice 6.**
