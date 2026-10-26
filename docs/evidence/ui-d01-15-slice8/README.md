# UI-D01-15 / Slice 8 — Academic Delivery Planning Workspace

**MOCKED UI-CONTRACT EVIDENCE.** Slice 8 is the owner's working label inside UI-D01-15, not a new roadmap ID. Base/preflight main is `a4d3cdecdf7e00cc8ed3037b15ae22683d672b89`, after merged PR #214. Roadmap: `UI-DEEP-01-Modernization-Roadmap.md`, entry line188, twelve-owner list line191, one-module rule line195. The owner selected Delivery Planning. Only this production owner, its private CSS and37 paired EN/AR leaves change.

The workspace gives academic context a compact year rail, separate selected/editing states, a term register and bounded editor, version-derived specialization/grade creation, a scannable plan list, and a selected plan's ordered unit sequence. It uses opaque panels/dividers, logical RTL, existing type families, routine400/500/600/700 weights, real disabled semantics,44px controls, non-color selection/status and visible focus. No shared owner, token, navigation or dependency redesign.

## Preserved academic and transport contracts

- Eight unchanged queries: years/versions pageSize100; defensive array-only grades/specializations; year-bound terms/plans; selected plan ID; selected plan's exact version units. Same keys, URLs, enabled options and inherited retry/stale behavior. No inferred latest version or active year. Selected year/plan fallbacks use the first returned item; add-entry term uses the selected active term or first active returned term.
- Year POST/PUT retains exactly code/startDate/endDate/isActive, native2–64 code limits and required dates, raw client values, actual saved ID selection, exit-edit/reset and existing invalidation. Selecting a year and editing a year remain distinct. Existing draft/context reset semantics are unchanged.
- Term POST/PUT retains code/dates/numeric sortOrder/isActive/currentYearId and0–10000 limits. Backend remains the date containment/overlap/association authority. Failures retain the draft and map factual backend meanings.
- Plan creation retains only qualificationVersionId/academicYearId/gradeId. Version options require active+specialization; grades require visibility and the selected specialization's track. Version changes clear grade. Loaded duplicate version+grade guard and actual saved.plan.id selection remain.
- Activation PUT sends only {isActive}; no publish/archive/finalize state. Add is unavailable and term reassignment/reorder/removal are really disabled on inactive plans. The saved raw term remains visible even if historical/inactive; a hidden disabled native select cannot misleadingly display a different active option as saved fact.
- Add-entry POST retains only unitDefinitionId/academicTermId, active-unused same-version unit options, first-active-term fallback, cleared unit selection after success. No optimistic fabricated IDs.
- Reassignment PUT sends only {academicTermId}. Reorder PUT sends the complete current ID array with the original adjacent swaps and first/last guards. DELETE targets the plan entry only, with no body; text explicitly says Remove from plan.
- All eight mutations retain the global pending write guard and the four existing invalidation prefixes: years/terms/plans/plan. No extra domain invalidation, API fan-out or silent write retry.
- Cold pending/error, successful empty, local terms/plans/selected/units feedback, operation-owned failure/success and actual cached refresh errors remain factual. Cached query data preserves rows/context/drafts and valid cached actions. No failure becomes a fabricated empty list.
- Existing InvalidCode, date, overlap, duplicate, association/immutable, active-usage, inactive-plan and generic meanings are unchanged.
- No backend production, authorization, payment/entitlement, assessment/enrollment, server ordering, AI/RAG, package/lock or #190 changes. Separate Qualification Registry SpecializationId creation debt remains untouched.

## Verification

| Check                                                         | Result                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Frozen install                                                | PASS, no dependency/lock modification                              |
| Pre-edit focused baseline                                     | 741/741,12 files                                                   |
| Independent Delivery source/transport and prior guard batch   | 899/899,13 files                                                   |
| New direct EN/AR component suite                              | 41/41                                                              |
| Resumed Delivery/Qualification/previous UI-D01-15 guard batch | 833/833,12 files                                                   |
| Academic/localization regressions                             | 101/101,4 files                                                    |
| Full frontend                                                 | 3991/3991,141 files                                                |
| Existing unchanged DeliveryPlanningTests                      | 7/7 including actual PostgreSQL constraints/model/concurrency case |
| Final browser matrix                                          | 12/12;55 states each;660 original screenshots                      |
| Final format / ESLint zero warnings / TypeScript              | PASS                                                               |
| Fresh production Build / git diff --check                     | PASS                                                               |

The independent fixture pins the actual pre-edit source hash
`0460f2f7e2fc7d0dd7b395c7ec4b0d9d7c4d7af82e3da07daa5448491c191d0c`,
16 API expressions,108 critical JSX props,5 filtering predicates,8 queries/8 mutations,85 protected historical/source/test/dependency paths and37 exact paired additions. Optional object trailing-comma punctuation alone is canonicalized; mutations of actual keys/options/payloads/guards/values must fail. Previous Security/Privacy guards compose exact unique reviewed presentation seams; historical fixtures are not rewritten and no broad exemption is added.

The full frontend result was produced after final production and unit-test changes. Resumption changed only the browser harness and evidence. Unit discovery excludes tests/e2e; production and unit source hashes remain bound by the manifest. Focused regressions, format/lint/typecheck and the fresh build were verified on the final source.

Backend evidence uses the unchanged7-case suite against an isolated task-owned PostgreSQL instance of the exact CI pgvector image digest. The test creates/migrates/drops its own generated database; the ephemeral task container is removed. Existing user services are not modified. Synthetic browser intercepts do not establish database persistence or authorization.

## Browser matrix and boundaries

EN/AR × Light/Dark ×1440×900,834×1112,390×844 cover year selection/edit/create, exact writes and pending/success/error, empty terms/plan, dependency/duplicate guards, selected active/inactive plans, saved inactive term, add/used unit, reassignment, first/middle/last full-ID reorder, plan-entry-only removal,24 long bilingual unit rows, keyboard focus, target size, cached refresh errors, cold query states and empty years. Each configuration asserts owner direction; every capture asserts actual theme and no horizontal page overflow, and records document direction. Half-width/320px is a reflow proxy, not actual200% browser zoom or a whole-site WCAG audit.

Observers register exact method/path/ID requests before actions, including the existing antiforgery handshake. Fresh navigation waits for DOMContentLoaded and concrete data/DOM readiness. Cached refresh is real React Query cache: test-only Date advancement beyond the unchanged provider's30s stale interval, then browser offline/online events trigger inherited reconnect refresh. No production query options/cache injection is used.

Contacts are labeled resized previews of selected original captures. The manifest hashes all660 originals and13 final production/test files, records12 finalized scenario results and binds these artifacts to the containing commit without a self-referential commit SHA. Full screenshots, logs, first failures and traces remain locally at:

`C:/Users/user/Documents/Codex/2026-10-17/files-pasted-by-the-user-device/outputs/UI-D01-15-Slice8/`

## Original failures, corrections and recovery

1. Independent AST comparison initially differed on three optional Prettier object trailing-comma flags. Canonicalize only that optional flag; original source hash retained. Corrected comparison passes16 API/108 props/5 filters.
2. First focused run1 failed/898 passed: a direct-fetch prohibition also matched existing refetch(). Word-boundary fetch prohibition fixes it; same batch899/899.
3. First new behavior run8 failed/33 passed: tests counted disabled cache records as active observers, used a nonexistent copy key, and expected two separate alerts for the combined years/versions error banner. Exact active-observer keys, actual qualificationVersion copy and seven scoped owner alerts fix the tests;41/41. No production workaround.
4. A test-file write used a duplicated frontend path and wrote nothing. Corrected relative path. Read-only path/glob lookup errors were resolved against actual files; no source rollback or deletion.
5. Docker initially failed on an inaccessible inference runtime file. Supported stop succeeded, proposed reversible rename failed and no backup was created; the misleading shell success print was explicitly corrected. No factory reset, security change or file deletion. Owner repaired Docker and explicitly resumed.
6. First real PostgreSQL test failed on127.0.0.1:5432 connection refusal before database creation. After owner runtime recovery, isolated CI-image suite7/7 passes unchanged. Original failure log/TRX retained.
7. First browser pilot lacked a stale refresh: provider's30s cache was still fresh. Test-only Date advancement and real reconnect solve it. Requested-light pilot screenshots actually dark are rejected as light evidence. Existing theme control now applies and verifies the actual theme before capture; shared theme/CSP code remains frozen.
8. Second pilot counted seven owner errors plus the external Next route announcer as eight page alerts. Mandated BLOCK honored with no third attempt that turn. After explicit owner resume, scope to the actual owner rather than the whole page. Full resumed pilot1/1 and final matrix12/12 pass.
9. Early evidence status sampled inside finally preceded Playwright's final failure status. Both original pilots remain explicitly FAILED in the historical manifest/logs. New afterEach finalizes each scenario status/errors after the test; final12 records are passed with no errors.
10. Existing backend restore NU1903 advisories, standalone-start/jsdom navigation/NO_COLOR warnings are retained and outside this UI/dependency scope; none is represented as fixed.

Mocked screenshots prove no production database persistence, authorization, deployment, academic compliance, production readiness or full WCAG compliance. Exact new-head remote CI is reported separately.

Handoff boundary: **ONE DRAFT PR — NOT READY — NOT MERGED. No Slice9.**
