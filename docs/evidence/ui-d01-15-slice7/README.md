# UI-D01-15 / Slice 7 — Governance Security Incident Management

**MOCKED UI-CONTRACT EVIDENCE.** Slice7 is a working label under the existing
UI-D01-15 roadmap entry. Base `31db23f6001c4df4ccb316d092c8b98d596bee7a` includes
merged PR#213. Roadmap entry line188, twelve-owner list line191, one-module rule
line195. Only `security-incident-management.tsx`, its private CSS and paired
messages change production. No Slice8 or dependency PR#190 work.

The owner now presents a restricted register, separate creation workbench,
compact server-ordered rows, explicit50-row page scope and server totalCount,
selected saved facts, editable human-review draft, recorded immutable Article20
decision, deadline ledger/external-action notes and controlled closure. Native
forms/labels,44px targets, visible focus, non-color selected/status/severity cues,
logical RTL, long-text wrapping, opaque panels/dividers and routine400/500/600/700
weights reuse the locked design roles. No shared tokens or dependency change.

## Preserved contracts and scoped view-state corrections

- Query key `["security-incidents", status]`; GET
  `/security-incidents?pageSize=50` plus exact optional`&status={status}`;
  `retry:false`. No search/sort/new client filter/priority algorithm. Returned
  order and server totalCount stay authoritative.
- Four raw statuses Open/Assessing/Contained/Closed and four raw severities
  Low/Medium/High/Critical remain unchanged. Selection defaults Open to Assessing
  draft, otherwise preserves status; loads exact server assessment/reason/closure,
  resets deadline notes and original mutation states. No identity fan-out.
- Create POST has only title.trim(),summary.trim(),reasonCode.trim(),severity
  and the checked potentialPersonalDataImpact boolean. Defaults/limits, pending
  prevention, retained failed draft and exact server-result adoption/reset/refetch
  remain. Severity is intentionally not reset on success, preserving prior behavior.
  Create impact now has independent local state: opening/editing a new incident
  cannot change the selected review's immutable legal fields. No wire shape change.
- Review PUT retains exactly status,impact,trigger,confirmation,trim/null legal
  summary,trim/null closure summary and trimmed reason. Failure keeps drafts;
  success adopts the exact server incident and refetches queue. Server transitions,
  containment timestamps and closure requirements remain authoritative.
- Article20 impact, human notification decision and recorded confirmation stay
  separate. No automatic inference/rationale/risk score. Recorded confirmation or
  Closed actually disables all four legal controls. The original trigger guard
  still requires impact; impact never automatically enables a positive decision.
- Only server-returned due/recorded/contained timestamps are displayed. Backend
  generates +24h AffectedIndividuals and +72h RegulatoryAuthority after a positive
  recorded human decision. No frontend deadline calculation or fabricated fact.
- Deadline POST retains exact incident/deadline path and only `{note}`:
  trimmed/nonempty/max1000. Pending prevents duplicates; failure retains notes.
  Success still GETs selected incident, selects exact response, then refetches
  queue. Accepted POST and failed selected GET now have separate factual feedback;
  unresolved re-read blocks duplicate recording, with bounded GET-only retry.
  No notification is sent. Recorded deadlines have no second action.
- Closure draft appears only for Closed draft, max2000; server conflicts remain
  factual. Actual Closed is final: no Save Review, legal edit, Record or Reopen.
  No frontend closure eligibility claim or client transition engine was added.
- Cold pending/error, successful empty, populated and actual cached rows plus
  refresh error remain distinct. Background queue failure preserves usable rows
  and unsaved review work. Errors remain in their owning create/review/deadline
  section; no generic authentication inference.
- Thirty-two exact paired EN/AR leaves under adminWorkspace.securityIncidents;
  old wording and raw server/user values remain unchanged. The two existing
  Privacy test-only projection consumers compose exact reviewed fail-closed seams;
  no Privacy production or historical fixture rewrite/broad exemption.

## Final verification

| Check                                                       | Result                             |
| ----------------------------------------------------------- | ---------------------------------- |
| Before-production focused baseline                          | 628/628,10 files                   |
| Final focused contracts/behavior/i18n/previous Slice guards | 844/844,12 files                   |
| Full frontend `pnpm test --maxWorkers=2`                    | 3792/3792,139 files                |
| Existing unchanged SecurityIncidentsControllerTests         | 4/4, EF InMemory                   |
| External unchanged actual-controller probe                  | 36/36, fresh EF InMemory contexts  |
| Isolated EN long queue / AR deadline / combined             | 1/1,1/1,2/2                        |
| First complete corrected browser matrix                     | 12/12,56 states each               |
| Final complete matrix on fresh production build             | 12/12,672 original full-route PNGs |
| Format / ESLint zero warnings / TypeScript / fresh Build    | PASS                               |
| `git diff --check`                                          | PASS                               |

Direct tests preserve exact query/options, server order/count, endpoints/payloads,
selection/reset, legal immutability, note validation/pending/error/success,
POST→GET selected→adopt→refetch sequence, closure conflicts/finality, actual cache
semantics, minimization and keyboard behavior. Independent AST invariants and
mutation probes protect transport/business contracts separately from exact
presentation projections;74 pre-edit paths and old fixture pins remain frozen.

Backend source/tests are unchanged. Existing tests and the external probe retain
positive/rejected human decisions, immutable recorded fields/audit, exact24/72h
server deadlines, valid/invalid/same/final transitions, record trim/duplicates,
closure prerequisites and external-action audits. EF InMemory does not prove
PostgreSQL persistence/concurrency or HTTP authorization.

EN/AR×light/dark×1440×900,834×1112,390×844 covers queue/50-row order/filter/empty/
loading/cold/cache error, create states/severities, four statuses, impact/trigger/
reason/confirmation drafts, recorded immutable decisions, zero/one/two recorded
deadline states, exact notes/mutations, selected refresh pending/error/GET-only
retry, closure conflicts/final locks, long bilingual data, keyboard selection/
focus, half-width minimum320 reflow proxy and320px stress. Theme, no horizontal
overflow and visible44px control targets are checked. This is not a full WCAG audit.

## Browser recovery and retained failures

All first failures remain retained; subsequent passes do not erase them:

1. First focused batch11 failed/809 passed: ambiguous filter/review Status,
   whitespace-sensitive new source checks, missing queue wait and keyboard focus
   on disabled empty-note Record. Distinct filter label and corrected test
   normalization/waits/input fixed the batch;820/820 then final844/844 passed.
2. First browser pilot0/2: missing xpath= prefix in evidence bounds selector.
   Corrected in harness. Second pilot0/2: exact Severity label text included
   SELECT options. EN/AR DOM proves valid implicit association, accessible
   combobox Severity/الخطورة, enabled Medium default. Exact semantic role/name
   fixes Severity/Status; no production markup edit. Diagnostics2/2 pass.
3. Recovery pilot0/2: controlled Closure textarea changes full wrapping-label
   text after typing; accessible name and draft remain correct. Exact textbox
   role/name fixes it; extended DOM/ARIA diagnostics2/2 pass.
4. Later EN reload/50-row timeout: traced full-load action spans28435478.223ms
   (~7h54m), not50-row render latency; only initial queue GET existed. Physical
   host interruption cause is not independently established. Harness now waits
   for DOMContentLoaded plus exact queue response/50 rows; no timeout increase,
   sleep or reduced fixture. Isolated50 unique rows render in949ms, order and
   row49 keyboard selection preserved.
5. Later AR record assertion saw previous expected PUT, without observing the
   new POST. A disabled/pending mutation can precede dispatch while existing
   antiforgery awaits. Gated synthetic handshake proves pending with writes[];
   releasing it produces exact record POST/note. Observers now register before
   every asserted mutation with exact method/path/IDs; await route capture/gate.
   No locale-specific workflow/API change. Corrected AR1/1 and combined2/2 pass.
6. First isolated AR diagnostic0/1 used idle Record text after pending renamed
   the same button. Unique button role in exact audience plus initial text
   assertion fixes it; promise lifetime remains scoped. No positional selector.
7. First matrix's initial two EN cases failed on Contained matching status chip,
   fact term and option. Run interrupted after systematic ambiguity was found.
   Semantic term/definition plus exact formatted server timestamp strengthens
   the check. Full EN1/1, complete12/12 and final fresh-build12/12 pass.

The original two BLOCKED handoffs, logs, traces, error snapshots and partial
captures remain outside Git. One initial read-only gh flag combination failed
before implementation and was corrected using raw paginated open pulls/files.
Two optional local documentation/library path lookups were absent; installed
guide discovery and actual DOM evidence resolved them. No production workaround.

## Evidence binding and limits

`manifest.json` binds13 final source hashes,12 passed scenario records,672 original
full-route screenshot hashes and four labeled cropped/resized contacts to the
containing commit without a self-referential SHA. Full originals/logs/probe source:

`C:/Users/user/Documents/Codex/2026-10-17/files-pasted-by-the-user-device/outputs/UI-D01-15-Slice7/`

Contact sheets are previews, not replacements for original screenshots. Mocked
browser evidence proves no legal compliance, external notification/regulator or
affected-person receipt, authorization, real database persistence, deployment or
production readiness. Half-width is a reflow proxy, not actual200% browser zoom.
Existing restore advisories, jsdom navigation/color/standalone-start warnings are
retained; no dependency change. Qualification SpecializationId debt is untouched.
CI status must be reported for the exact new pushed head separately.

Handoff: **ONE DRAFT PR — NOT READY — NOT MERGED. No Slice8.**
