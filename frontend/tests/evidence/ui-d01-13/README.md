# UI-D01-13 — Turn Admin home into an operational launch surface

**MOCKED UI-CONTRACT EVIDENCE**

Authoritative owner roadmap: `outputs/UI-DEEP-01-Modernization-Roadmap.md`, heading 168, fields 170–176, immediately after UI-D01-12. Exact row confirmed/reported before production edits. Base `03bdc8f84342309832e887c36376b95e379f83c5` includes merged #205. Branch `fix/ui-d01-13-admin-operational-home`.

## Implemented boundary

Admin home now orders the existing supplied operations before compact current context, period analytics and compact destination rows. All 18 original destination paths remain present; the existing historical Retake destination is intentionally added. Evaluations has two distinctly labeled rows using the same existing destination for assignment and under-review context. No new queue filter, eligibility, count, sorting or action is invented. No support/backlog count is displayed.

Only `AdminDashboard`, `AdminAnalyticsTrend` and private `AdminLink` presentation changed in `admin-area.tsx`, plus scoped CSS and ten paired EN/AR leaves. The role shell, other Admin functions, Teacher authoring/workload, Student owners, API producer, shared primitives and dependencies remain unchanged.

The period controls keep their original state initialization, seven values, UTC encoding/input bounds and disabled-query condition. An uncached invalid range now keeps the existing controlled fields and validation visible instead of showing a misleading loading state. Correcting it resumes the original enabled query. Pending, cold errors/restrictions and valid cached refresh behavior retain their previous contracts.

## Metric meanings verified from the unchanged producer

`backend/src/Betcco.Api/Controllers/AdminDashboardController.cs` supplies these meanings; no backend file is modified:

| Display group      | Supplied values                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Current operations | Course approvals (`SubmittedForReview`); formal evaluations awaiting assignment (`PendingAssignment`); formal evaluations currently `UnderReview`; coursework/formative submissions `Submitted`. No sum or inferred passing grade. |
| Current context    | Students, teachers, unfrozen active teachers, courses/published courses, Units, enrollments, assignments, overall enrollment completion, currently active subscriptions. These do not use the selected window.                     |
| Selected period    | Active students from lesson activity, orders, refunds, paid revenue; original date-ordered revenue/paid-order/lesson-activity trend.                                                                                               |

The existing producer uses the Admin policy. LeadIV/coordinator-only home evidence deliberately returns 403; their original shell destination sets and navigation behavior are verified without manufacturing successful Admin data or changing permissions. Browser mocks are not authorization proof.

## Verification

- Baseline before edits: 111 focused tests passed.
- Post-change focused: 151 tests passed; the strengthened actual-source copy check was rerun separately (6 passed).
- Full frontend: `pnpm test --maxWorkers=2`, **2910/2910**, **123/123** files. Production source did not change afterward.
- New browser scenarios: **38 verified**. 34 original matrix cases passed; four period cases were revalidated after scoping the validation alert to `main`, excluding Next's separate route announcer. Two zero cases have extra initial-operation captures. No production workaround.
- Relevant browser regressions: 113/114 passed initially (Admin dashboard, role navigation and Teacher workload). The unchanged Teacher EN keyboard case passed isolated recheck after an initial computed outline-offset mismatch (`0px` versus expected `-3px`). No assertion, timeout, Teacher test or Teacher production change was made. The transient failure is retained in the logs; its underlying timing cause is not established.
- Format, ESLint zero warnings, TypeScript, production build and diff checks are reported in the Draft PR handoff for the exact commit. No previous head's CI is reused.

`admin-home-contract.test.ts` pins the independently captured main source and exact reviewed seams. It compares actual state/query/API/mutation calls, mechanical props, supplied metric fields and all unrelated statements. Display-only MetricCard props are separately checked by behavioral label/value assertions. It protects 24 previous owners/dependency files and the backend producer. Missing/altered/duplicate new seams fail closed. Historical source hashes and catalogue values are not replaced; their helpers reverse only these exact new seams/copy. The actual new source is also checked for hardcoded visible text and locked weights/tokens.

## Rendered evidence

Production build on isolated `localhost:3024`; user port 3000 unchanged. 104 full viewport captures across EN/AR, Light/Dark, 1440×900 / 834×1112 / 390×844; populated, zero, pending, 401/403/503, cached refresh, seven period choices, invalid custom range/correction, Admin/LeadIV/coordinator, keyboard/reduced motion and reflow proxy.

The manifest records 38 successful scenarios, every capture's dimensions/SHA-256, 15 source/test hashes and four sheet hashes. Full captures/logs live in this task workspace `outputs/UI-D01-13/`; only contact sheets and manifest are committed. Sheet names: `home-matrix`, `context-and-destinations`, `periods-and-validation`, `states-and-roles`.

Reproduce against an isolated production server:

```powershell
$env:PLAYWRIGHT_PORT = '3024'
pnpm exec playwright test tests/e2e/admin-home.spec.ts
```

## Limits

Synthetic UI-contract evidence does not prove backend persistence, authorization, payments, entitlements, database behavior, deployment or whole-site WCAG. 720×450 is a CSS viewport reflow proxy, not native browser zoom. No whole-project production-readiness claim. No next roadmap row, Ready transition, merge or auto-merge is authorized by this handoff.
