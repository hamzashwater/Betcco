# UI-D01-15 / Slice 1 — Governance Audit Log — Filterable List Archetype

**MOCKED UI-CONTRACT EVIDENCE**

Device: LENOVO. Parent roadmap entry: **UI-D01-15 — Refine reusable back-office archetypes**. Owner-selected module: **Governance → Audit Log**. Archetype: **Compact Filterable List + Expandable Detail**. This is a working slice label, not a new roadmap ID. Requested model/settings: GPT-6.1 Sol / EXTRA HIGH / FAST MODE OFF; runtime settings are not independently exposed for verification.

## Authorization and preflight

Roadmap gate: **PASS**, authoritative local `outputs/UI-DEEP-01-Modernization-Roadmap.md`, lines 188–196 (source ownership at line 191). Its exact twelve owners are:

1. `frontend/src/features/admin/admin-area.tsx`
2. `frontend/src/features/admin/academic-catalogue.tsx`
3. `frontend/src/features/admin/academic-catalog-management.tsx`
4. `frontend/src/features/admin/qualification-registry-management.tsx`
5. `frontend/src/features/admin/delivery-planning.tsx`
6. `frontend/src/features/admin/account-identity-management.tsx`
7. `frontend/src/features/admin/audit-log.tsx`
8. `frontend/src/features/admin/privacy-request-management.tsx`
9. `frontend/src/features/admin/security-incident-management.tsx`
10. `frontend/src/features/admin/content-studio.tsx`
11. `frontend/src/features/admin/platform-rating-moderation.tsx`
12. `frontend/src/features/admin/commission-settings.tsx`

Audit Log is explicitly listed. This slice satisfies one module/archetype per slice; no other module migration is required. Only `audit-log.tsx` plus its dedicated presentation CSS are authorized production changes.

Reference main, actual fetched preflight main and latest fetched main before commit: `f361f5c79c41f547d690cad08815d26e7562c0a4`. PR #207 is MERGED into that commit. A fresh worktree and branch `fix/ui-d01-15-audit-log-archetype` were created from it. The only pre-existing open PR was #190, head `ae0cac509c9d2565e17370d5f02f46dfb490cd66`, touching only `frontend/package.json` and `frontend/pnpm-lock.yaml`. Overlap: none. #190 and both dependency files remain unchanged. Exact pushed head, Draft PR URL and head-specific CI status are in the final handoff; the manifest uses source content hashes to avoid a self-referential commit hash.

## Production changes and preserved contracts

- `audit-log.tsx`: compact header/filter/list/detail structure; raw four-way outcome presentation; native disclosures; shared QueryState for factual loading/empty/error notices; valid cached rows remain visible during fetch and cached refresh errors. A previous empty placeholder is not described as the new applied request's empty result. Full identifiers and raw JSON remain accessible.
- `audit-log.module.css`: local opaque canvas/panels, compact ledger rows, semantic success/danger/warning/neutral pairs, logical RTL, wrapping identifiers/JSON, 44px controls and summaries, 3px focus outlines with the approved 2px offset, opaque disabled roles without opacity reduction, and responsive layouts. Approved label/body/data/meta variables preserve EN/AR optical metrics; compact icons use 18px/16px with stroke 2. No new animation. Routine weights are 400/500/600/700; DC03 PASS. Existing Inter + IBM Plex Sans Arabic delivery is untouched.

The complete setup before JSX, record types, handlers, values, disabled expressions and keys are independently frozen against the pre-edit live-main source. Query key/options, `GET /admin/audit-logs`, page size 25, all filter parameters and UTC boundaries are unchanged. Draft typing never queries. Apply trims exactly the existing three text fields and resets page 1. Clear resets both filter states and page 1. Server ordering remains authoritative; no client filtering/sorting/pagination was added.

CSV still uses `GET /api/v1/admin/audit-logs/export` with applied filters, credentials include and cache no-store, server filename/fallback, original error precedence, and the same Blob/object URL/anchor/revoke lifecycle. Pagination still derives `max(1, ceil(totalCount / pageSize))` and retains both original fetching guards. Forensic content uses only existing returned fields; JSON text is exact and LTR. Unknown outcome text remains raw and neutral.

Business logic, authorization/permissions, audit policy/scope/retention, privacy/legal rules, payment/entitlements, assessment rules, backend, API/payload contracts, AI/RAG, dependencies, shared components, catalogues, Student, Teacher, Admin home and Assessment Operations are unchanged. No new storage, identity inference, metadata request, public link or automatic data copying. EN/AR catalogues are byte-for-byte unchanged; T7 remains clean.

## Tests and historical protection

The existing `tests/audit-log.test.tsx` is unchanged. New files relative to `frontend/`:

- `tests/audit-log-archetype.test.tsx`: raw ordering/IDs/outcomes/JSON/forensic disclosures, pending/offline/cold error/cache/placeholder states, applied-versus-draft CSV and filename/lifecycle, no duplicate export, pagination/reset contracts.
- `tests/audit-log-archetype-contract.test.ts`: independent executable invariants, exact projection with negative mutations, 28 protected owners, local DC03/semantic roles.
- `tests/fixtures/audit-log-archetype.ts`: deliberately unsorted synthetic records with long EN/AR/machine content and all four outcome categories.
- `tests/fixtures/ui-d01-15-audit-log-baseline.json`: original main hash, independent pre-edit setup/types/interaction invariants, exact reviewed presentation seams and protected hashes.
- `tests/helpers/audit-log-contracts.ts`: directly extracts executable invariants; no presentation projection.
- `tests/helpers/audit-log-projection.ts`: reverses only exact, unique reviewed Audit Log presentation seams; fails closed on altered/missing/duplicate seams and never projects another owner.
- `tests/e2e/audit-log-archetype.spec.ts`: actual production browser matrix, server request assertions, no page overflow, raw details, keyboard actions/disclosures, retained data, error and export states.

The sole changed existing test is `tests/admin-final-i18n-residual-audit.test.ts`: layers the exact Audit Log presentation projection before the existing projection. Its immutable original baseline and all assertions remain unchanged. This historical guard froze old DOM as well as behavior; the exact projection accommodates the authorized layout while direct independent invariants continue protecting transport/business behavior. No broad exemption or relaxed business/transport assertion.

Final local validation:

- Focused Audit Log + independent boundary + whole-Admin i18n: **137/137**, after the final production change.
- Full frontend: `pnpm test --maxWorkers=2` — **2996/2996, 127 files**. Includes governance/source/i18n, typography, Admin, Student, Teacher and Assessment regressions.
- Browser final matrix: **12/12**, **168 full-page captures**. EN/AR × light/dark × 1440×900, 834×1112, 390×844. All specified scenario categories covered; extra initial pending and cold-error captures included.
- `pnpm format:check`, `pnpm exec eslint . --max-warnings 0`, `pnpm typecheck`, `pnpm build`, `git diff --check`: PASS, with final artifact formatting/diff verification recorded in the handoff.

Original failures are retained in `manifest.json` and external logs: initial CSS formatting; one browser locator timeout corrected to combobox role; first full run had two new fixture/projection failures because files were updated during the run. Source/invariants were then frozen and the full batch rerun successfully. Final design-contract review also aligned exact focus, disabled, type-scale and icon values; the focused/full suites, build, static checks and complete browser matrix were rerun against those final sources. No assertion was weakened. Two non-fatal jsdom navigation diagnostics occurred in the passing full suite. The local browser server emitted Next's standalone-output warning; no deployment claim is made.

## Browser evidence and limits

`manifest.json` records normalized source SHA-256 values, build identity, every original screenshot's byte hash/dimensions, scenario state, exact captured requests, outcome colors, zero targeted page errors/unexpected writes and contact-sheet hashes. Four committed contact sheets show cropped review previews for every capture and viewport. Full originals (approximately 150 MB, excluded from Git) are retained at:

`C:/Users/user/Documents/Codex/2026-10-17/files-pasted-by-the-user-device/outputs/UI-D01-15-Slice1/browser-contract-final/`

Reproduce against an owned local production server, for example on 3026:

```powershell
pnpm build
pnpm start --port 3026
# In another shell, from frontend:
$env:PLAYWRIGHT_PORT = '3026'
pnpm exec playwright test tests/e2e/audit-log-archetype.spec.ts --output <fresh-output-directory>
```

Use a fresh output directory; Playwright cleans its output root. Full-page captures are taken from the document top to avoid fixing the role header at an interaction's scroll offset. Reflow is half the original CSS viewport width with a 320px minimum, a narrow-content proxy rather than native browser zoom.

This synthetic evidence proves only the exercised presentation/request contracts. It does not establish backend audit correctness, database completeness, authorization, export security, deployment, production readiness or whole-site WCAG compliance. Exact-head remote CI is separate from these local results.

Authorized endpoint: one Draft PR, NOT READY, NOT MERGED. No next UI-D01-15 module/archetype started.
