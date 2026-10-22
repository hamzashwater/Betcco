# UI-D01-14 — Make assessment operations scannable

**MOCKED UI-CONTRACT EVIDENCE**

Authoritative roadmap: `outputs/UI-DEEP-01-Modernization-Roadmap.md` in the task workspace, lines 178–186. The immediately preceding row is UI-D01-13. Gate passed before production edits. Live base: `dd4ecf756716270b65312968d44e21fc2974010f`, merging PR #206. The only preflight open PR was dependency #190; its two manifest/lock files do not overlap this slice and remain untouched.

## Presentation boundary

The existing Evaluations route now has native fragment links to Coordination, Assignment, Resit and the already role-gated Verification region. These links scroll within the same page without replacing route/query context or unmounting controlled forms. All four section owners remain mounted in their original order. Existing IV plan selection now exposes `aria-pressed` and `aria-controls` for its existing candidate detail region. No selection, eligibility or mutation workflow was added.

Seven existing owners adopt one locally scoped CSS module and a small request-message helper: compact divided rows, opaque work panels and insets, restrained heading weights, logical borders, visible focus and controls at least 44px tall. IV retains its desktop list/detail split and stacks the same selected detail after the list on mobile. No global CSS, shared role shell, home layout or font delivery changed. Text is reused from the existing paired catalogues; both complete catalogues are byte-for-byte unchanged after newline normalization.

Cold errors still prevent submission-dependent controls without usable data. Coordination, eligible candidates and the Evaluations parent now preserve actual React Query cached data and controlled drafts through background errors, alongside factual existing error text. Cold 401 and 403 now use existing catalogue sign-in/access-denied text only when an Error carries that actual HTTP status. Unknown errors keep factual generic or raw server feedback. A cached 401 retains factual refresh-error wording and usable rows/actions. Filtered no-match reuses the existing generic catalogue filter message and remains distinct from successful unfiltered empty. IV, appeals, Resit and specialism cached-row behavior remains existing behavior.

## Separate capability map, verified from source

Navigation is presentation, never authorization. This map describes inspected server policies; intercepted browser responses do not validate server enforcement.

| Family                         | Inspected server boundary                                                     | Preserved client/state boundary                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordination / expected target | `AssessmentCoordinationController`: CourseReviewer capability                 | Exact status/target/page query, interval and retry; raw server blockers; same PUT, UTC conversion, trimmed required reason and invalidation order                            |
| Evaluator assignment           | `EvaluationsController`: CourseReviewer capability                            | Actual eligible-evaluator response; mapping/empty/conflict distinctions; exact teacherUserId POST and onAssigned invalidations                                               |
| Resit authorization context    | `ResitsController`: CourseReviewer capability                                 | Authorized / activated / revoked relationships, original and separate Resit request IDs, private reasons, page size and ordering                                             |
| UnderReview verification       | `EvaluationsController`: AssessmentVerifier capability                        | Existing Admin / InternalVerifier / LeadInternalVerifier UI gate and enabled query; calculated results remain provisional; exact approve/revision notes and deadline payload |
| IV planning / samples          | `InternalVerificationPlansController`: InternalVerificationPlanner capability | Existing selected plan, matching candidates, rationale rules and assessor exclusion; server remains authoritative for independence and duplicate selection                   |
| Appeal review                  | `EvaluationAppealsController`: AssessmentAppealReviewer capability            | Existing status, original request audit/PDF links, decision and trimmed rationale; no automatic grade change                                                                 |
| Evaluator Unit specialisms     | `AdminEvaluatorSpecialismsController`: SystemAdmin policy                     | Existing canonical Unit/version IDs, grant/revoke history, exact payloads and invalidation sequence                                                                          |

`PlatformPermissionAuthorization.cs` separately grants CourseReviewer only course review, InternalVerifier assessment verification, and LeadInternalVerifier verification/planning/appeal review. Admin is the existing temporary superuser. The SystemAdmin policy uses ManageUsers. This slice does not unify these capabilities or change any server policy or existing client role filter.

## Invariants and historical guards

`assessment-operations-contract.test.ts` independently pins the live-base fixture, all seven source owners' exact API/query/state/mutation calls and mechanical action props, plus protected backend producers, home, role navigation, Teacher/Student, Gradebook/Retake, dependencies and full catalogues. Each approved presentation seam has negative deletion/duplication/mutation cases. Historical i18n and UI13 audits reverse only these exact reviewed seams; no historical expected hash, eligibility assertion or source baseline was replaced. The existing role-gating component assertion now locates the heading, since navigation intentionally reuses its translated label.

Business logic, HTTP methods, endpoints, query keys/options, DTOs, payloads, mutation order, authorization, finance/entitlements, formal result transitions, reasonable-adjustment rules, fresh evidence/authenticity/independent paid Resit semantics, disabled new Retake, server ordering, AI/RAG and dependencies are unchanged. UI13 dashboard operational counts, current/period distinctions and UTC custom ranges are frozen independently.

## Validation and evidence

Verified final batches: 2954 frontend tests in 125 files; 126 new/adjacent Admin browser cases; 8 protected Teacher/Student browser cases. The previously observed Teacher EN keyboard focus test passed in this EN/AR batch without assertion or production changes; that does not establish a root cause or a permanent fix for the earlier intermittent failure. Focused runs passed 184 existing component tests, 304 state/source contract tests, 84 role-gating/state tests, and the final 141-case state/source gate. Formatter, ESLint with zero warnings, TypeScript, production build and diff checks passed. Initial failed batches below remain disclosed.

See `browser-evidence.json` for exact production/test hashes, synthetic scenario outcomes and PNG hashes. Contact sheets are review previews; complete raw captures and logs remain under the task workspace `outputs/UI-D01-14/` and can be regenerated using the committed Playwright tests against the production build.

The matrix covers EN/AR, light/dark, 1440×900, 834×1112 and 390×844 for all four routes, plus populated/empty/blocker/cold-error/cached-error states, target and effective-deadline detail, independent IV candidates, appeal/Resit relationships, expected assignment conflict, keyboard, 44px controls, reduced motion and a 720×450 CSS viewport reflow proxy. The reflow proxy is not native browser zoom. Adjacent Admin home and existing assessment browser contracts are rerun separately from the new matrix.

Earlier validation failures are retained in the task logs: new test observers needed awaited notifications; a negative seam mutation was initially a no-op; an import path matched the CSS-reference scanner; the existing IV role test's text selector became ambiguous after adding a same-label section link. New browser tests initially used over-exact labels around nested controls and omitted the synthetic antiforgery response. These were test harness defects, corrected with the same assertions retained and full affected batches rerun. Initial type/build failures from incorrect new test catalogue names are also retained. No failed batch is treated as passed because of an isolated retry.

The final state refinement also updated one existing filtered-empty text assertion while retaining its exact bounded API request assertion. A new browser test initially assumed clearing a filter refetched a still-fresh cache key; the actual provider has an unchanged 30-second stale time. Its correction explicitly proves cached row retention on clearing the filter, then obtains a cold successful empty response. Both failed batches remain recorded before their complete reruns. The dark accent and overdue samples additionally pass rendered 4.5:1 contrast checks in all 12 locale/theme/viewport combinations; this is a scoped text check.

Mocked UI evidence does not establish persistence, backend authorization, actual evaluator eligibility, payments/settlement, entitlement correctness, database behavior, deployment, production readiness or whole-site WCAG compliance. No backend lifecycle or database changes were made; real database lifecycle validation is outside this presentation slice.

Handoff remains one Draft PR. No Ready, merge, auto-merge, force push, #190 update or following roadmap row is authorized.
