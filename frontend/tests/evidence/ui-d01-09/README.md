# UI-D01-09 — formative Aim / comprehensive practice

**MOCKED UI-CONTRACT EVIDENCE.** Current task production source, actual Next
16.3.6 build and native Chromium controls, with intercepted synthetic responses.
This does not prove backend integration, persistence, authorization, payments,
deployment, production readiness or whole-site WCAG.

## Scope

- Aim content, practice and teacher review are separate ordered checklist rows.
  Final practice retains the actual completed-Aim ratio and server-owned status.
- A received review is distinct from a completed training path. Formative P/M/D
  remains distinct from formal BTEC assessment. Existing latest/best feedback,
  attempts, history, timestamps and file links retain their server meaning/order.
- Unknown status remains unknown. Missing configuration is factual. No action
  eligibility, attempts, inferred deadline, completion or official grade is added.
- Pending/cold-error submission data cannot expose submission actions. Valid
  cached units/submissions and editing controls survive a refresh error, alongside
  the existing factual error message. Draft comments/files remain mounted.
- Existing start/save-note, sequential upload and submit calls, parameters,
  payloads, invalidations and disabled conditions are unchanged. File scanning or
  rejection is displayed only as the raw server error; there is no new scan-state
  model and no claim that an uploaded file is safe or reviewed.
- The shared file picker, teacher implementations, player, AI/RAG, dependencies,
  authorization, payment and formal assessment workflows are unchanged.

## Current-run evidence

`browser-evidence.json` pins the five production/catalogue source hashes, all
80 new screenshot hashes and 38 new successful scenarios. It also records 41
successful existing player/practice regressions: **79/79 passed**, no skipped,
failed, flaky or retried cases. All captures were regenerated on this branch.

The native viewport matrix covers EN / AR RTL, Light / Dark and 1440×900,
834×1112, 390×844. State cases cover locked/missing configuration, unfinished
content, Draft, Submitted, reviewed-not-achieved, confirmed training completion,
improvement allowance, exhausted attempts and ordered history. Workflow cases
cover selected files, pending upload, raw scan/rejection errors, retry, submit,
and cached-refresh errors with editable drafts. Keyboard disclosures, visible
focus, reduced motion and horizontal overflow are checked. The 720×450 CSS-pixel
viewport is an approximate 200% desktop reflow proxy, not browser/OS zoom.

- [Layout matrix](layout-overview.png)
- [Server states and history](state-overview.png)
- [Draft/upload/query/focus states](workflow-overview.png)

The overviews are contact sheets; inspect full raw captures at the manifest's
`rawScreenshotRoot`. Tall element captures include existing fixed mobile shell
chrome where it overlaps the captured viewport. No shell redesign or masking
was used. Existing theme bootstrap behavior is unchanged; scenarios select and
verify the native theme toggle before capturing.

## Reproduction

From `frontend`, install with `pnpm install --frozen-lockfile`, run `pnpm build`
and start the built app on an available isolated port, for example
`pnpm start --port 3020`. In a second PowerShell terminal:

```powershell
$env:PLAYWRIGHT_PORT = '3020'
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3020'
pnpm exec playwright test tests/e2e/formative-practice-clarity.spec.ts tests/e2e/student-player-workspace.spec.ts tests/e2e/learning-aim-practice.spec.ts tests/e2e/comprehensive-practice.spec.ts --workers=2
```

The existing config reuses the server on that port. Default evidence goes under
Playwright's output directory; each new case writes `scenario.json` and PNGs.
The task used an external config to keep raw evidence/logs outside the checkout.

Targeted regression tests include `formative-practice-clarity.test.tsx`,
`formative-practice-contract.test.ts`, the existing practice suites, player
workspace/contracts, Student continuity/state and bilingual typography coverage.
The final broader suite, format, zero-warning lint, TypeScript, build and diff
results are reported separately; mocked screenshots do not establish CI status.

## Source protection

The main reference is `4e49df5c52a749055508964917759c95bd18abac`. The independently
pinned fixture reverses only exact approved UI-D01-09 seams to that main's full
source hashes. Missing, duplicated or modified seams fail closed. Every original
query/mutation/API/invalidation expression is compared independently. Previous
T7 and UI-D01-08 hashes are retained; negative checks run at their own projection
layer, with new-layer negative checks guarding every new seam. Catalogue
projection accepts only the exact seven paired leaves; existing catalogue
values and unrelated raw server/user copy remain protected.
