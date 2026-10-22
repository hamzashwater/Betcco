# UI-D01-15 / Slice 2 — People Account Identity Management

**MOCKED UI-CONTRACT EVIDENCE**

Device: LENOVO. Parent roadmap entry: **UI-D01-15 — Refine reusable back-office archetypes**. Owner-selected module: **People → Account Identity Management**. Archetype: **Compact Identity List + Inline Account Actions + Explicit Destructive Confirmation**. This working slice label is not a new official roadmap ID. Requested settings: GPT-6.1 Sol / EXTRA HIGH / FAST MODE OFF; runtime settings are not independently exposed for verification.

## Roadmap and preflight

Roadmap gate: **PASS**. The authoritative local `outputs/UI-DEEP-01-Modernization-Roadmap.md`, lines 188–196, explicitly lists `account-identity-management.tsx` at ownership line 191. This is one module/archetype; no other owner is needed. The only production changes are that owner and a CSS module used solely by it.

Reference and fetched preflight main: `27e0a502fb3efe810f76ee2c7f6d7797f04f0a0c`. PR #208 was confirmed MERGED, with this exact merge commit contained in main. A fresh worktree `C:/Dev/Betcco-UI-D01-15-AccountIdentity` and branch `fix/ui-d01-15-account-identity-archetype` were created from it. The sole pre-existing open PR was #190, head `ae0cac509c9d2565e17370d5f02f46dfb490cd66`, touching only `frontend/package.json` and `frontend/pnpm-lock.yaml`. Overlap: none. Both files and #190 are untouched.

The final handoff records latest main, exact local/remote/PR head, Draft PR URL and new-head CI separately. The manifest pins final source content hashes, avoiding a self-referential commit hash. Audit Log Slice 1 remains unchanged; no Slice 3 work is included.

## Implemented presentation

- `frontend/src/features/admin/account-identity-management.tsx`: compact identity ledger, factual status priority, role selection and inline actions. The email workflow is a native disclosure whose form remains mounted, preserving per-user drafts. Existing loading/empty/error/notice ownership uses the unchanged shared QueryState/MutationOutcome components. Pending actions expose aria-busy alongside the original disabled guards.
- `frontend/src/features/admin/account-identity-management.module.css`: private opaque canvas/panels, contiguous divided rows, aligned desktop identity/status/action columns, full wrapping of raw names/emails, and responsive secondary controls. Freeze/reactivate remains the context action; resend/email are secondary and revoke is a distinct quiet danger action. Controls remain at least 44px. Focus uses a 3px outline/2px offset; disabled roles have no opacity reduction. Approved EN/AR type variables and routine weights 400/500/600/700 preserve DC03. No decorative avatars, glass, KPI cards, shadows or new motion.

Ordinary desktop rows are measured in browser metadata. English rows target 64px; Arabic optical metrics can require about 67px. Longer content and smaller viewports expand without clipping. The action column accommodates Resend + Reactivate together; final browser assertions cover the first three ordinary SupportAdmin status/action combinations, not just the first row.

## Unchanged behavior and security boundaries

All executable setup before JSX, query/options, five mutations, refresh/success handling, record types, event handlers, disabled guards and native validations are directly frozen against the pre-edit main source. Exact source projection is separate from those independent executable invariants.

- Query remains `["managed-identities", role, page]`, GET `/admin/users` with only role/page. Teacher and SupportAdmin choices, server order and page semantics remain unchanged. No search, sorting, filtering, new fan-out, placeholder option or reload persistence is introduced.
- Invite remains POST `/admin/users/support-admins/invite` with `{ displayName, email }`; required name limits 2/160 and email type/required/320 remain. Only invite fields clear on successful response; success notice and invalidation remain. Failure retains fields.
- Email change remains POST `/admin/users/{id}/email-change/request` with `{ newEmail: newEmails[id] }`. Only the successful user's draft clears. Inputs/actions retain `mustChangePassword || !emailConfirmed` guards.
- Resend remains bodyless POST `/admin/users/support-admins/{id}/resend-activation` under the exact current three conditions: SupportAdmin, unconfirmed email and must-change-password. No additional eligibility is inferred from other fields.
- Freeze/reactivate remains POST `/admin/users/{id}/freeze` with `{ frozen: !user.isFrozen }`. Revoke remains a separate bodyless POST `/admin/users/support-admins/{id}/revoke-authority`. Both original `window.confirm` call sites, cancellation behavior and confirmation-before-mutation timing remain; revoke copy still includes the raw display name. No custom dialog or bulk action was introduced.
- Status priority remains Frozen → Awaiting activation → Active; mustChangePassword does not invent another status. Previous remains disabled at page === 1; Next at page × 25 >= totalCount. Role switching still resets page 1.
- Existing generic load/invite/action errors and success semantics remain factual. No 401/403 inference, new user field, identity-policy change, backend mutation rule, authorization/permission, payment/tax/entitlement or assessment change.

Only the six existing ManagedUser fields are consumed. IDs remain routing/keys rather than prominent visible data. AI/RAG, backend, dependencies, all other roadmap owners, Student/Teacher/Admin Home/Assessment Operations and Audit Log remain frozen. Catalogues are unchanged; existing `adminWorkspace.accountIdentities` copy is reused, so EN/AR parity and T7 stay clean.

## Test/support files and historical alignment

- `tests/account-identity-archetype.test.tsx`: direct real-query tests for requests/roles/pagination, raw ordering/status/eligibility, all endpoints/payloads, native confirmation timing/cancellation, pending/errors/notices, isolated mounted drafts and invite validation/field ownership.
- `tests/account-identity-archetype-contract.test.ts`: independent setup/type/interaction freeze, negative transport/eligibility mutations, exact projection sensitivity, 45 protected owners, actual visible-copy and DC03/semantic-style checks.
- `tests/fixtures/account-identity-archetype.ts`: deliberately unsorted synthetic data covering every factual status, activation flag combination and long Arabic name/email.
- `tests/fixtures/ui-d01-15-account-identity-baseline.json`: independent pre-edit main snapshot, original hash, eight exact reviewed presentation seams and 45 protected file hashes.
- `tests/helpers/account-identity-contracts.ts`: direct executable/validation/interaction extraction without presentation projection.
- `tests/helpers/account-identity-projection.ts`: reverses only exact unique reviewed seams for the exact Account Identity owner path; altered/missing/duplicate seams fail closed, other owners remain unprojected.
- `tests/e2e/account-identity-archetype.spec.ts`: production-browser matrix with synthetic intercepted HTTP, actual native confirmation events, all action categories by keyboard, raw transport/draft/eligibility checks, density and reflow.

Four existing test files were narrowly aligned:

1. `tests/admin-users-source-audit.test.ts` and `tests/admin-final-i18n-residual-audit.test.ts`: layer the exact Account Identity presentation projection. All original assertions/baselines remain. Their old frozen trees included DOM/presentation; the independent live-main executable fixture and negative tests preserve behavior/transport protection. Audit Log's helper/fixture/tests are untouched.
2. `tests/admin-users-translation.test.tsx` and `tests/account-experience.test.tsx`: add only steps opening native email disclosures before exercising/checking the same fields. No eligibility, request, payload, invalidation, validation, confirmation or translation assertion was weakened.

Baseline checks passed 120/120 before production edits. Final focused checks passed 291/291 across six files. Full frontend tests, final browser matrix, formatter, zero-warning ESLint, TypeScript, production build and complete diff verification are recorded in `manifest.json` and the final handoff. Validation failures, if any, are recorded rather than discarded. Final visual-review adjustments align desktop columns, reduce repeated danger framing and accommodate the eligible Resend + Reactivate pair without changing action behavior.

Final local results on the frozen production source:

| Check                                                    | Result                                         |
| -------------------------------------------------------- | ---------------------------------------------- |
| Focused Account Identity/users/source/i18n/account tests | 291/291, six files                             |
| `pnpm test --maxWorkers=2`                               | 3075/3075, 129 files                           |
| Final browser matrix                                     | 12/12, 264 full-page captures                  |
| `pnpm format:check`                                      | PASS                                           |
| `pnpm exec eslint . --max-warnings 0`                    | PASS, zero warnings                            |
| `pnpm typecheck`                                         | PASS                                           |
| `pnpm build`                                             | PASS                                           |
| `git diff --check`                                       | PASS; complete base-to-HEAD recheck at handoff |

No validation batch failed in this slice. Two non-fatal jsdom navigation-not-implemented messages occurred in the passing full suite and remain in its log. Final source content hashes and all capture/preview hashes are verified before commit and source hashes are checked again against committed HEAD.

## Browser evidence and reproducibility

**MOCKED UI-CONTRACT EVIDENCE** — EN/AR × light/dark × 1440×900, 834×1112, 390×844. Each case exercises 22 captures spanning populated Teacher/Support lists, long identities, all statuses/eligible actions, invite form/pending/error/success, isolated drafts/disabled email, mutation pending/action error, freeze/reactivate/revoke confirmations, pagination, keyboard, reflow, empty, pending and load error.

The manifest records source SHA-256 hashes, build ID, scenario contracts, every original PNG's byte hash/dimensions, native dialog messages/order, request bodies, zero unexpected mutations/page errors and contact-sheet hashes. Four committed contact sheets are cropped review previews. Original full-page captures remain outside Git at:

`C:/Users/user/Documents/Codex/2026-10-17/files-pasted-by-the-user-device/outputs/UI-D01-15-Slice2/browser-verified/`

The selected app theme is verified for every capture, including reloads. Existing theme initialization is not changed. Full-page captures start at the document top so the fixed role header does not obscure rows at an interaction's scroll position. Native `window.confirm` evidence is recorded from actual browser dialog events; native modal pixels are not replaced with a fabricated UI capture.

From `frontend`, against an owned local production server:

```powershell
pnpm build
pnpm start --port 3027
# In another shell:
$env:PLAYWRIGHT_PORT = '3027'
pnpm exec playwright test tests/e2e/account-identity-archetype.spec.ts --output <fresh-output-directory>
```

Playwright cleans its output root, so use a fresh directory. Reflow is half the CSS viewport width with a 320px minimum, not native browser zoom. The local server emits Next's standalone-output warning; this is not deployment validation. Non-fatal jsdom navigation and Node color-environment diagnostics, when present, remain in logs.

These results prove only the exercised synthetic UI/request contracts. They do not prove backend user mutation, email delivery, authorization, account security, deployment, production readiness or whole-site WCAG compliance. Remote CI on the new pushed head is reported separately; local checks are not green-CI proof.

Authorized endpoint: one Draft PR, NOT READY, NOT MERGED. STOP; no next module/archetype started.
