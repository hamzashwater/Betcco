# UI-D01-11 — Teacher work before statistics

**MOCKED UI-CONTRACT EVIDENCE.** Actual Next 16.3.6 production application and native Chromium controls/fonts, with intercepted synthetic responses. This is not proof of live backend persistence, authorization, database behavior, payment settlement/PayTabs, deployment, production readiness or full WCAG compliance.

Exact roadmap: heading 146 / fields 148–154 immediately after UI-D01-10.
Base main: `f6ffbf533a4037b9a2625d6130e5cdfaea59e269` (merged #203).

## Scope

Teacher dashboard order is review/follow-up, own-course work, compact context, utilities. The existing four repeated launch cards are removed; one Create Course link remains on the dashboard, including the successful-empty state. The dedicated courses page retains its single Add Course link.

The analytics count remains coursework/formative submissions awaiting review. It does not become a formal Evaluation assignment count. No assigned-evaluation request is added to the dashboard. Preview rows remain the first four supplied students in server order, with the supplied total and bounded-preview disclosure.

The formal Evaluation queue keeps only the returned assignments, their raw statuses/notes/branches, exact links and server ordering. Search/status controls filter this array locally and disclose that scope; there is no new server search, pagination, priority, bulk grading or eligibility rule. Standard / Resit / historical Retake remain distinct using their existing server fields.

Course search/status/sort logic is unchanged and explicitly local to the loaded list. Student follow-up search/attention/reason/sort and page size 10 remain server-owned with the exact original URL/query identity. Cold failure, pending, successful empty and cached refresh failure remain separate. Valid cached course/assignment rows and local filter selections survive refresh failure with a factual error. No mutation occurs in these new flows.

## Evidence

The manifest records the exact final browser matrix, current production source hashes, native screenshot hashes/dimensions, and protected regressions. All new captures come from this branch's production app. The additional dashboard capture run verifies all seven compact metric weights and captures context below the own-course rows.

- [Dashboard matrix and context](dashboard-overview.png)
- [Queues, follow-up and courses](queues-courses-overview.png)
- [States, cached errors and controls](states-controls-overview.png)
- [Native case results and hashes](browser-evidence.json)

Coverage: EN/AR RTL; Light/Dark; 1440×900 / 834×1112 / 390×844; populated workload, a 55-row assigned queue, pending/cold-error/empty/cache failures, course filters, follow-up server filtering and paging, unknown status, keyboard focus and reduced motion. The 720×450 CSS viewport approximates 200% reflow; it is not browser/OS zoom. Full-size raw captures are at the manifest's `rawScreenshotRoot`; contact sheets are navigation aids.

Theme controls are selected and verified natively after navigation. Existing theme bootstrap remains unchanged. Cached-error tests advance past the existing provider's 30-second staleTime and reconnect; query options remain unchanged. Tall/scrolled native captures can include the existing fixed shell. No masking or shell redesign is used.

## Source / workflow protection

An independently pinned main fixture reverses only exact reviewed presentation seams, with missing/modified/duplicate negative checks. Actual current API/query/mutation/navigation expressions are also compared independently to main. Original Teacher routing, wallet and formal-review functions are frozen separately, as are all prior Student/player/practice/evaluation owners, authoring editors, shared primitives and package/lock files.

Historical UI/T7 hashes are retained. Six exact obsolete launch-card catalogue leaves remain unchanged for compatibility and are explicitly accounted for by the copy audit; no broad unused-key or source exemption is introduced. Every new presentation leaf is paired EN/AR and used through the catalogue.

## Reproduce

From `frontend`: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm start --port 3022`. Then in another PowerShell terminal:

```powershell
$env:PLAYWRIGHT_PORT = '3022'
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3022'
pnpm exec playwright test tests/e2e/teacher-workload.spec.ts tests/e2e/teacher-area-translation.spec.ts tests/e2e/teacher-assignments-review-translation.spec.ts tests/e2e/evaluation-workspace.spec.ts tests/e2e/student-resit.spec.ts tests/e2e/student-player-workspace.spec.ts tests/e2e/formative-practice-clarity.spec.ts --workers=2
```

The task used an external config/log/raw-output directory to preserve the checkout. Each new case emits `scenario.json` with the explicit mocked-evidence label and its actual result.
