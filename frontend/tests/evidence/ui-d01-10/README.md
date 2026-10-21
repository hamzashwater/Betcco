# UI-D01-10 — evaluation, revision and Resit presentation

**MOCKED UI-CONTRACT EVIDENCE.** Actual production Next 16.3.6 app, native
Chromium controls and CSS/fonts; intercepted synthetic data and writes. No live
backend persistence, authorization, payment settlement, PayTabs integration,
deployment, production-readiness or whole-site WCAG proof.

## Scope and semantics

The exact roadmap entry is heading 134 / fields 136–142, immediately after
UI-D01-09. Base main: `fe84a0c6a580d9cdaa8c7a7a910964e6c2bf53a5`.

- Wizard preparation remains separate from a saved evaluation lifecycle. Until
  credit is known, the preparation rail names the submission route without
  guessing Included Evaluation versus payment. Original readiness/checkout
  guards, payloads and ordering are unchanged.
- A lifecycle snapshot contains one actual current saved stage and the real
  Standard / separate Resit / historical Retake branch. It is not a fabricated
  list of completed stages. Unknown status stays unknown, including inherited
  JavaScript object-key names. There are no inferred grades or eligible actions.
- Existing related-request IDs retain their original shortened display. Actual
  feedback order and supplied timestamps remain intact. Resubmission remains on
  the same request; effective revision deadlines come from the original field.
- Workflow completion does not declare a passing grade. Existing BETCCO advisory
  results and disclaimers remain distinct from an official school/awarding-body
  grade. Zero price does not identify funding source. No new Retake creation or
  Resit revision route is added.
- Valid cached history and standard Draft data keep rows and mutable work
  mounted during refresh failure, with a factual error. Cold errors expose no
  unknown submission workflow. Original payment-credit error guards remain.
- The list query/pagination hook, all APIs/query options, transport/mutation
  expressions, payment/idempotency, permissions, formal-assessment policy,
  dependencies, AI/RAG and the merged UI-D01-07/08/09 work stay protected.

## Validation and captures

Final browser matrix: **148/148 passed**, no failed/skipped/flaky/retried case.
There are 74 new evaluation scenarios and 96 new screenshots, plus 74 existing
player, formative-practice and Resit regression scenarios run on this branch.
No screenshots from previous roadmap tasks were reused as current evidence.
Four cached-error cases additionally pass a focused capture run, showing both
the error notice and the retained editable work in separate native viewports.

New/resumed preparation: EN/AR RTL, Light/Dark, 1440×900 / 834×1112 / 390×844.
State and workflow cases cover actual academic selection, evidence, files and
authenticity; Included Evaluation and synthetic paid-session responses; checkout
failure; ordinary results and NeedsRevision/effective deadline; authorized Resit,
Draft/payment/review/result and historical Retake; unknown, loading, cold error,
empty and cached refresh failure; appeal failure; native keyboard focus, reduced
motion and horizontal overflow. Ordinary completed results gain no Resit-only
detail link. The 720×450 CSS viewport is a ~200% reflow proxy, not browser/OS zoom.

The native theme toggle is verified after each relevant navigation. Existing
theme-bootstrap behavior is not changed. Tall native captures may include fixed
shell chrome; no masking or shell redesign was used. Cache tests retain the
original provider's 30-second staleTime, advance the browser clock beyond it,
then reconnect. They do not change production query options.

- [Preparation matrix](preparation-overview.png)
- [Results and branches](results-branches-overview.png)
- [Workflow and error states](workflow-states-overview.png)
- [Source and screenshot hashes](browser-evidence.json)

The manifest pins production source hashes (including the unchanged paging
owner), native screenshot hashes and case results. Raw captures are available
at its `rawScreenshotRoot`; overview contact sheets are for navigation.

## Reproduce

From `frontend`: `pnpm install --frozen-lockfile`, `pnpm build`, then
`pnpm start --port 3021`. In a second PowerShell terminal:

```powershell
$env:PLAYWRIGHT_PORT = '3021'
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3021'
pnpm exec playwright test tests/e2e/evaluation-workspace.spec.ts tests/e2e/student-resit.spec.ts tests/e2e/student-player-workspace.spec.ts tests/e2e/formative-practice-clarity.spec.ts --workers=2
```

The task used an external config/output directory to keep raw captures/logs
outside the checkout. Each new case writes `scenario.json` and native PNGs.

Direct component tests additionally cover raw grades and branch routes, real
cached-error retention, same-request revision ordering/duplicate prevention,
appeal selection/payload/pending/error behavior, and unknown statuses. Existing
scoped wizard, revision, Resit/idempotency, pagination and Retake tests are kept.

## Source protection

An independently pinned main fixture reverses only exact reviewed presentation
seams. Missing, modified or duplicated seams fail closed. Original complete
API/query/mutation/navigation expressions are independently compared. All old
T7/UI source hashes remain; new-layer seams are reversed before historical
negative checks, and each new seam has its own negative tests. Copy projection
accepts only the exact new namespace, with exact locale-specific paired values.
There are no broad source/translation exemptions and no replaced historical hashes.
