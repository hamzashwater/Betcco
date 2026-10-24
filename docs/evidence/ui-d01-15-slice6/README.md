# UI-D01-15 / Slice 6 — Governance Privacy Request Management

**MOCKED UI-CONTRACT EVIDENCE.** One working slice label under the existing
UI-D01-15 roadmap entry, not a new official roadmap ID. Base:
`dc248acdb4b9dc960b273a0140827d219039ffc6`; PR #212 merged. Roadmap entry line 188,
exact twelve owners line 191, one-module rule line 195.

Only `privacy-request-management.tsx` and its private CSS adopt this archetype.
Twelve exact paired EN/AR factual additions use `adminWorkspace.privacyRequests`;
all old legal/privacy wording is preserved. Other Governance/Privacy execution
and previous Slice production files remain unchanged.

The workspace presents an explicit one-page scope, server totalCount, compact
ordered queue, keyboard selection with text/check/aria-pressed, selected request
facts, review drafts and recorded verification/resolution timestamps. Raw server
descriptions are not translated, interpreted or parsed as HTML. Cold loading,
cold failure, successful empty, filtered empty, actual cached rows with refresh
failure, pending/error/success review remain distinct. Opaque panels, dividers,
logical RTL, wrapping, 44px controls, visible focus and allowed routine weights
reuse existing design roles. No shared token or dependency change.

## Frozen review contracts

- Query key `["admin-privacy-requests", status]`; GET
  `/privacy/admin/requests?pageSize=50` plus exact `&status={status}` when set;
  `retry: false`. No pagination/search/sort/client filtering/detail fetch/fan-out.
- Returned order is retained. TotalCount is not derived from loaded rows. The
  original six filter statuses, seven request types and four staff targets stay.
- Selecting a request preserves the exact selected object, defaults Submitted
  to InReview, otherwise retains status, loads its exact summary/verification
  fact and calls `review.reset()`. No effect/remount/automatic selection added.
- PUT `/privacy/admin/requests/{selected.id}` contains only
  `{ status: nextStatus, resolutionSummary: resolutionSummary.trim() || null,
markIdentityVerified: identityVerified }`.
- Success adopts the exact server result, resets summary/identity from that
  result and calls `query.refetch()`. It does not change nextStatus, optimistically
  update rows or synthesize timestamps. Failure retains all selected/draft state.
- Completed/Rejected/Cancelled remain final; status, note and identity controls
  stay disabled and no Save/Reopen action exists. The original disabled select
  with four staff targets is hidden in final mode; a read-only server status is
  displayed instead. This prevents native unmatched Cancelled from appearing as
  IdentityVerificationRequired without adding Cancelled as a review target.
- Recorded identity disables the checkbox; only its request timestamp is shown.
  Identity verified does not mean completion eligible. No client transition
  matrix, completion gate or fulfillment inference was added. Server conflicts
  remain exact errors. Save remains disabled only by its original pending guard.
- PrivacyAdmin, all backend policies/transitions/identity/fulfillment/audit rules
  remain unchanged. No owner name/email/profile/verifier identity, bulk action,
  erase/export/fulfillment execution, portability/retention integration or new
  destructive operation exists.

## Validation

| Check                                                         | Final result                         |
| ------------------------------------------------------------- | ------------------------------------ |
| Baseline before production edits                              | 526/526, 9 files                     |
| Final focused batch                                           | 676/676, 11 files                    |
| Full frontend `pnpm test --maxWorkers=2`                      | 3600/3600, 137 files                 |
| Existing PrivacyController + sensitive-read audit tests       | 9/9, EF InMemory                     |
| External unchanged actual-controller probe                    | 24/24 checks, EF InMemory            |
| Final browser matrix                                          | 12/12; 31 states each; 372 originals |
| Format / ESLint zero warnings / TypeScript / production build | PASS                                 |
| `git diff --check`                                            | PASS                                 |

Direct behavior tests cover keys/paths/retry/fan-out, types/statuses/targets,
order/scope/count, selection/reset, exact payload/trim/null/booleans, success
adoption/refetch, retained drafts, pending duplicate-click protection, final and
recorded verification locks, minimization, server authority, cold/empty/cache
distinctions and keyboard flow. Direct AST snapshots are independent of the
historical presentation projection. Mutation probes reject contract drift.
Historical baseline fixtures remain unchanged. Only two existing test/support
files compose exact fail-closed reviewed owner/copy/guard seams; no broad source
exemption or old fixture hash rewrite.

Backend evidence includes existing identity/fulfillment/owner-scoping tests and
audit tests. The separate external probe additionally executes all three final
locks, invalid transitions and identity-verified completion without evidence for
all seven request types. Source inspection confirms Released evidence for
Access/Portability, Applied for the others, CreatedAtUtc/Id descending order,
PrivacyAdmin, human review and no direct erase/export. Backend source/tests are
untouched. InMemory probes do not prove HTTP authorization or PostgreSQL behavior.

EN/AR × light/dark × 1440×900, 834×1112, 390×844 covers populated/50-row queue,
server filters, empty/loading/error, all six selected statuses, description/no
description, identity facts, long notes/Arabic copy, whitespace, pending/error/
success, completion conflict, cached refresh failure with drafts, final locks,
keyboard and half-width/minimum320 reflow proxy. Final source is rebuilt before
final captures. Theme and no horizontal overflow are checked at every capture.

Original full-route PNGs, records and logs are retained at:

`C:/Users/user/Documents/Codex/2026-10-17/files-pasted-by-the-user-device/outputs/UI-D01-15-Slice6/`

`manifest.json` binds 13 final source hashes, 372 original screenshot hashes,
12 scenario records, four labeled cropped/resized contact previews and retained
logs/probe source to the containing commit. Original PNGs are not replaced by the
committed preview sheets. A self-referential commit SHA is not used.

## Original failures and limits

All original logs remain retained; later passes do not erase them:

1. First focused batch: 31 failed/645 passed, one unhandled rejection. New
   comparison treated JSX whitespace as drift; an overbroad new regex matched
   an existing static translation key; multiline matching normalized whitespace;
   internal fetch rejection chained to React act left its scope open and caused
   cascading failures. AST printer comparison, invocation-specific guard, exact
   textContent and awaited public refetchQueries fixed tests only. Complete
   corrected and final eleven-file batches pass 676/676.
2. External probe compiler error: missing enum namespace. Only external probe
   import corrected; 24/24 checks pass. Repository backend unchanged.
3. Formatter rejected the new regenerated fixture layout. Prettier/debug-check,
   parsed before/after equality and 102/102 contracts passed. Final-source full
   validation was rerun after the final-state presentation correction.
4. Initial full suite 3600/3600 and pilot/matrix 2/2 + 12/12 passed but were
   superseded: visual inspection confirmed inherited disabled native Cancelled
   mismatch. Final read-only status presentation was corrected without touching
   its state, four targets or eligibility. New final-source checks/captures are
   separately logged, and the earlier results are not claimed for final source.

One initial read-only preflight rev-list used a mistyped dependency head, failed
and was corrected before implementation; actual state is behind27/ahead1. The
live mergeability was MERGEABLE; the supplied prior false snapshot was stale.

Synthetic evidence proves no actual privacy fulfillment, legal compliance,
identity procedure, data erasure, portability delivery, database persistence,
authorization, deployment, production readiness or full WCAG. Existing
NU1902/NU1903 cryptography restore warnings, two nonfatal jsdom navigation
diagnostics and local standalone-start warning are retained. No dependency fix
or #190 change. Qualification SpecializationId debt remains separate and untouched.
Remote CI must be reported for the exact new head only.

Handoff: **ONE DRAFT PR — NOT READY — NOT MERGED. No Slice 7.**
