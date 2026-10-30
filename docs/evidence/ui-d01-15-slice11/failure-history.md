# Slice 11 first-failure history

## Discovery command, before implementation
- Original: rg reported Windows error 123 for positional frontend/tests/*archetype*.
- Cause: PowerShell did not expand this wildcard directory argument.
- Correction planned: use rg -g file globs against the literal frontend/tests directory.
- Rerun: corrected -g discovery passed; no repeated wildcard failure. No test ran or failed in this discovery command.

## Backend discovery filenames
- Original: two guessed filenames (AdminContentTests.cs and LiveSessionTests.cs) did not exist.
- Cause: discovery should have enumerated actual filenames first.
- Correction: rg --files found CoursePackageAdminControllerTests.cs and LiveSessionProviderCatalogTests.cs; search remaining tests by symbols.
- Result: actual file enumeration passed; no tests changed or run by this command.

## Local guide availability probe
- Original: Get-ChildItem of the assumed Next docs directory did not find the path while dependency installation was active.
- Cause: attempted guide discovery before confirming the install completed and before enumerating its real location.
- Correction planned: wait for install, enumerate docs with rg --files, then read the actual matching guide.
- Result: installation completed; rg --files located the actual use-client.md and 11-css.md guide paths.

## Guide file read from frontend cwd
- Original: Get-Content used a frontend/ prefix while its workdir was already frontend, so both guide reads failed.
- Cause: duplicated relative path prefix, separate from the completed dependency-availability discovery.
- Correction planned: read the two enumerated files with absolute paths.
- Rerun: both absolute guide reads passed. No validation/test failure.

## Translation inspection encoding
- Original: Python read_text defaulted to Windows cp1252 and failed decoding a smart punctuation byte in en.json.
- Cause: omitted explicit UTF-8.
- Correction: use encoding=utf-8 and UTF-8 stdout for all subsequent scripts.
- Rerun: explicit UTF-8 inspection passed. No source or test failure.

## Existing regression first run: 2 failed / 12 passed
- Command: pnpm exec vitest run admin-content-studio-residual-translation content-studio-date-formatting --maxWorkers=2 --reporter=dot. Original: existing-first.log/json.
- EN attendance: getByLabelText(Live session) matched both the new form accessible name and the attendance session selector. Cause: added form label reused the singular field label.
- AR attendance: findByRole(status) captured a transient query-loading DOM node; React subsequently reused it for the successful empty-list message before the mutation feedback assertion. Cause: the old test assumed only a single global feedback status existed.
- Correction planned: name the session form with the distinct sessions navigation label and wait for the expected operation failure text, preserving all original endpoint, method, payload, invalidation and fallback assertions.
- Rerun: pending; recorded before correction.

## New focused tests first run: 19 failed / 635 passed
- Command: pnpm exec vitest run content-studio-archetype admin-content-studio-residual-translation content-studio-date-formatting --maxWorkers=2 --reporter=dot. Original focused-first.log/json.
- 18 state assertions: text queries include intentionally mounted hidden panels; tests incorrectly expected their preserved pending/error text to be absent. Cause: draft-preservation architecture keeps all panels mounted.
- One source guard: the forbidden fetch regex matched the substring in the approved refetch() retry handle. Exact AST transport comparison itself passed.
- Correction planned: assert hidden feedback is not visible, allow multiple hidden matches, and anchor direct fetch with a word boundary; no behavior/transport assertion removed.
- Rerun: pending, recorded before correction.

## Type check first run
- Command: pnpm exec tsc --noEmit. Original types-first.log/json.
- Cause: added Testing Library role options copied Playwright's exact:true property, which ByRoleOptions does not support. Errors were test-only TS2769; no production type error was reported.
- Correction planned: remove the unsupported test option; string role names already match exactly. No any, suppression or type weakening.
- Rerun: pending, recorded before correction.

## Query-provider discovery
- Original: an assumed src/app/providers.tsx path did not exist.
- Cause: provider location was guessed instead of enumerated.
- Correction: enumerate *provider* files and search QueryClient configuration in actual component/lib directories.
- Result: discovery only; no test or implementation correction.

## New query-state suite first run: 12 failed / 22 passed
- Command: pnpm exec vitest run content-studio-archetype-states --maxWorkers=2 --reporter=dot. Original states-first.log/json.
- Eight empty-text assertions saw mounted hidden panels; two package-error cases saw duplicate visible query alerts. Causes: test text scope was global; package query state was rendered in both editor and records aside.
- Two row synchronization assertions: the mocked server returned the same mutable fixture array; mutating it changed the QueryClient cached object in place, so no network-equivalent replacement/render was observable.
- Correction planned: scope queries to the active section, render package query feedback once, and clone mock response data to match JSON transport identity. Also place the course fieldset legend first for native semantics.
- Rerun: pending; recorded before correction.

## First browser pilot
- Command: pnpm exec playwright test tests/e2e/content-studio-archetype.spec.ts --grep "en light 1440" --workers=1 --reporter=line. Original browser-pilot-first.log/json and retained trace.
- Failure: expected light theme, observed dark at the first capture. Cause: with data-theme initially absent (existing CSP theme-init behavior), the real toggle's first click initializes dark; the harness incorrectly assumed one click would reach light. No screenshot passed this guard.
- Configuration issue: this invocation omitted PLAYWRIGHT_PORT/BASE_URL and used the test config's development server on 3000. It is not production-build evidence.
- Correction planned: initialize an absent theme through the existing toggle then select the requested theme; explicitly bind the corrected run to the fresh production server on 127.0.0.1:3232 and retain output in a distinct directory.
- Rerun: pending; recorded before correction.

## Correction outcomes and mandatory stop
| Original record | Corrected result |
| --- | --- |
| Discovery glob, filename, availability and encoding probes | Corrected discovery/read commands passed; no test outcome was inferred from these probes. |
| Existing residual translation regression: 2 failed / 12 passed | existing-corrected: 14/14 passed. |
| New focused suite: 19 failed / 635 passed | focused-corrected: 654/654 passed. |
| Test-only TS2769 | types-corrected: passed; unsupported exact option removed without any or suppression. |
| New query-state suite: 12 failed / 22 passed | states-corrected: 32 passed / 2 failed; same row-synchronization assertion repeated in EN and AR. **BLOCK.** |
| First browser pilot | Theme/server configuration corrections written but **not rerun** because the local repeated-failure stop was reached. First pilot remains failed and is development-only evidence. |

### Repeated failure, preserved before any further correction
Command: pnpm exec vitest run content-studio-archetype-states --maxWorkers=2 --reporter=dot.

Exact tests: retains attendance cache on refresh failure and resets row drafts on a server status or session change (en), and the same test (ar).

Original states-first.log and corrected states-corrected.log both observe expected Late, received Excused immediately after client.refetchQueries. The corrected suite passes the other 32 states. The mock response cloning correction did not eliminate the failing observation, so it is not a proven complete root cause. Source inspection shows row keys include attendanceSessionId, record ID and server status. Whether the remaining mismatch is notification timing in the test or actual UI synchronization is UNVERIFIED; no further test, source correction or rerun was attempted after this repeated result.

The production build already in progress completed successfully (build-current.log); it does not override the failing integration assertion. Full frontend, full browser matrix, ESLint, full format check, finish review and publication remain incomplete. No Commit, Push or Draft PR was created.

---

# Slice 11 recovery first-failure history

## Investigation discovery
- Original: rg could not read a guessed top-level node_modules/@tanstack/query-core/src/notifyManager.ts path.
- Cause: query-core is a transitive pnpm dependency and is not linked at that top-level path.
- Correction planned: enumerate the installed @tanstack+query-core package directory and read actual source paths.
- Result: actual pnpm source discovery/read succeeded, with query-core 5.102.0 scheduler and react-query subscription inspected. No test or source change.

## Confirmed original blocker before correction
- Original assertions: original states-first.log and states-corrected.log, expected Late / received Excused in EN and AR.
- Independent diagnostic: diagnostic-first, 4/4 passed against unchanged production owner.
- Confirmed cause: refetchQueries resolves fetched cache data before scheduled observer notification commits React. The test synchronously captures the previous DOM node; the current status/session/id key correctly replaces it when React commits. Timelines show cache Late / rendered Present / draft Excused immediately after refetch; after commit the live selector is Late, Update disabled, old node disconnected and still Excused.
- Correction planned: re-query selector inside waitFor with the unchanged Late expectation, then capture the live node for the next action. No production change, arbitrary delay, scheduler override, retry, timeout increase, or weakened assertion.
- Rerun: pending; recorded before correction.

## Targeted correction result
- Original two exact scenarios: exact-two passed EN and AR (2 targeted; remaining 32 filtered only in that invocation).
- Full original query-state file: focused-34 passed 34/34, zero failures/skips.
- New independent lifecycle regressions: synchronization-regression passed 4/4 (both locales).
- Existing translation/date: original-translation-date passed 14/14.
- Production delta since verified backup: none. One existing test changed; one new required synchronization regression test added. No source regeneration or key/effect change.

## Pre-run browser query scope alignment
- Evidence: the prior state-suite failure documented duplicate query text in intentionally mounted hidden panels. The prepared browser cold/empty assertion still used page-wide getByText, which also matches hidden panels.
- Narrow correction before the browser run: scope that existing unchanged expected-text assertion to the active Content Studio section. No new UI behavior, relaxed assertion, backend/mock success change, retry or timeout change.

## Full Format Check first failure
- Command: pnpm format:check. Original format-check.log/json.
- Exact warning: tests/fixtures/ui-d01-15-content-studio-baseline.json.
- Cause: the preserved pre-recovery fixture was last serialized by json.dumps after the owner approval-hash update; it was not in Prettier canonical whitespace format at the blocked checkpoint.
- Correction planned: Prettier this fixture only, compare the complete parsed JSON including property order before/after, then rerun full format check. No hash/baseline value, source seam, assertion, or production change.
- Rerun: pending; recorded before correction.

## Pre-run browser refetch protocol alignment
- Installed query-core 5.102.0 OnlineManager starts online=true and notifies only on state changes; a lone online event cannot trigger the prepared stale-cache scenario. FocusManager listens to window visibilitychange and calls onFocus for the current visible document.
- Narrow harness correction: dispatch the existing window visibilitychange focus event after the unchanged 31-second test-clock advance, and scope attendance/status/alert assertions to the active owner panel. Expected messages, status values, transport, production code and query settings remain unchanged.
- The full frontend suite excludes E2E files; its 4931/4931 result is unaffected. Recheck the changed browser file with formatter/ESLint and full TypeScript before running it.

## Recovery gate outcomes
- Full frontend: 4931/4931 across 148 files passed, no skipped tests.
- Corrected full format: passed; format-semantic-audit.json confirms every baseline value and property order unchanged.
- ESLint full frontend: passed, zero warnings.
- TypeScript and fresh production build: passed.
- Existing unchanged backend suite: 5/5, zero skipped; InMemory/pure provider evidence only, no PostgreSQL claim.

## Browser diagnostic console encoding
- Original: printing an already-preserved browser log raised UnicodeEncodeError in the Windows cp1252 stdout stream.
- Cause: the diagnostic Python snippet omitted UTF-8 stdout configuration; file reads/copy had succeeded.
- Correction: configure diagnostic stdout UTF-8 before printing multilingual logs. No test, production, trace or assertion changed.

## Fresh production browser pilot: first new selector failure
- Command: browser-pilot-corrected.log/json, en light 1440 on the verified standalone server, output test-results/s11-r-pilot. Trace and partial screenshots preserved in browser-pilot-failure-1 before correction.
- Exact failure: getByRole(form, Live sessions).getByLabel(English title) matched both the Related course select (whose option contains "Synthetic course with a long English title") and the intended English-title textbox. The accessibility snapshot shows both controls with their correct distinct roles/names.
- Confirmed cause: Playwright's non-exact label-text lookup matched nested option text in a wrapping Field label. This is separate from the historical theme initialization failure, which this run passed.
- Correction planned: use exact native textbox/combobox role-and-name lookups for the ambiguous title and select controls; preserve long fixture copy, field values, payload/status/visibility assertions, pending gates and timeouts. No production change.
- Rerun: pending; recorded before correction.
## Browser correction and completion results
- Exact role/name selector pilot: passed, en light 1440, all 35 captures, no errors.
- Remaining 11 matrix cases plus 2 original residual browser cases: 13/13 passed.
- Primary matrix total: 12/12, EN/AR x light/dark x 1440x900/834x1112/390x844; 420 captures, no scenario errors.
- Supplementary stress: 4/4 passed, EN/AR x light/dark with 14 courses, public teacher profile, long bilingual names, package POST, native attendance keyboard selection; 24 additional captures, no errors.
- Format, ESLint (zero warnings) and full TypeScript rechecked after browser harness changes: passed.


## Evidence packaging first failure
- Command: python work/slice11_package.py.
- Exact failure: ModuleNotFoundError: No module named 'PIL' on importing Pillow; no test or source file was changed by the failed invocation.
- Cause: the shell's default Python lacks the optional image-inspection dependency.
- Correction planned: locate the bundled workspace Python/library runtime and run the identical packaging/verification script with that runtime; no installation or repository dependency change.

- Packaging correction result: identical script passed using bundled Python/Pillow; all 444 PNGs decoded, nonblank, correct dimensions, SHA-256 recorded. 12 primary plus 4 supplemental scenarios, all errors empty.

## Read-only report search path probe
- Original: rg outputs/slice11/*.md was issued with repository cwd, while reports live in projectless outputs. That operand returned path-not-found; the independent E2E operand succeeded.
- Cause: wrong cwd for the report operand. No source/test change or validation result; subsequent report reads use explicit roots.

## Visual inspection filename probe
- Original: view_image attempted 01-package-create-many-courses-mobile.png; missing path. The preceding three requested images opened successfully.
- Cause: screenshot filename was inferred instead of selecting the exact generated manifest entry.
- Correction planned: read actual supplemental capture asset entries and open the exact listed package filename. No capture, source or test changes.
- Visual filename correction result: manifest selected 01-packages-create-many-courses-mobile.png opened successfully; all source captures remained unchanged.

## Finish-review agent first interruption
- The first fresh reviewer inspected desktop/tablet inputs, then returned an account usage-limit error before a verdict/report. Its partial messages are not a completed review.
- No source fix follows that interruption. The required one fresh retry was dispatched with the same review inputs and is completing all required screenshots; no tests were rerun or weakened.

## Optional report filename probe
- gh api --help successfully confirmed --paginate/--slurp. A following optional Get-Content of an inferred outputs/recovery/open-prs.json path did not exist and left that shell invocation nonzero; no GitHub or test result was inferred from it.
- Current complete open-PR evidence was instead obtained with the connected GitHub API: page1 has PR219/220, page2 empty; each full paginated file list has only frontend/package.json and frontend/pnpm-lock.yaml. Actual git fetch confirms main d48261ac94156b38ed837ec4fa45077002a9e494. No owner overlap.

## Independent finish review: first rendered course-list defect
- Evidence: full-resolution synthetic stress screenshots en-light-stress/01-packages-create-many-courses-mobile.png and ar-dark-stress/01-packages-create-many-courses-mobile.png, captured before any CSS correction. Reviewer observed adjacent long course-name/currency text overlapping vertically at 390px.
- Source candidate: content-studio.module.css .courseList uses display:grid with max-height:20rem and implicit auto rows; .toggle has min-height:44px. This is a real readability defect in the required many-course state, separate from the fixed attendance test timing.
- No production correction applied at this record. Preserve original 444-capture evidence and verify actual row/text geometry before selecting a minimal correction within the existing private course-list styles. Keep all API/state contracts frozen.

## Read-only course geometry diagnostic: first environment failure
- First invocation course-geometry-first failed before reaching the new geometry assertion: expected 14 course checkboxes, found 0. Trace/error-context preserved in course-geometry-first-artifacts.
- Log confirms the prior standalone server no longer listened after the interrupted session; Playwright automatically started next dev on3232. Snapshot retained the initial Articles view after clicking Packages and pending queries; dev log records blocked cross-origin dev resource/HMR requests. This is not fresh production-build or row-geometry evidence.
- Correction planned: restore a verified standalone production server from a fresh build and prevent any dev fallback for the diagnostic. Do not alter production config/allowedDevOrigins, fixture counts, selectors, timeout or geometry expectations.

## Confirmed row geometry before CSS correction
- Fresh production-build-diagnostic passed; managed CI-mode standalone server prevents development fallback. The unchanged 14-checkbox expectation passed.
- course-geometry-production then failed the new complete-text containment assertion on 13/14 course labels. Raw geometry and trace preserved in course-geometry-production-artifacts before correction. Example bounds: label top 17.71875, bottom 61.71875; rendered text top 14.71875, bottom 64.71875.
- Confirmed mechanism: implicit grid rows in the bounded course scroller compress below the full wrapped text height. Minimal correction selected: content-sized implicit rows plus start alignment in .courseList only; retain20rem bounded scrolling, 44px minimum controls, exact text/IDs/data and all attendance/transport code.
- This repairs the originally required many-course mobile validation in the already authorized Slice11 private CSS owner. It adds no feature, route, workflow or other owner. Production TSX/messages stay byte-identical; the sole new production delta will be two private CSS declarations. Reviewer's scope caution is retained verbatim in its report and disclosed in handoff.

## Repeated course row failure after the one targeted correction — BLOCK AGAIN
- Correction: only .courseList grid-auto-rows:max-content and align-content:start. No TSX/message changes.
- Fresh production-build-course-fix passed; all692 directly related component/contract/synchronization tests passed; full format check, final changed E2E ESLint0 and TypeScript passed.
- course-fix-browser: 4/4 stress scenarios failed the unchanged newly added full wrapped-text containment assertion after the CSS correction. Raw rows, traces and error-context files preserved in course-fix-failure-artifacts; counts in course-fix-failure-summary.json. The repeated visual/geometry gate is NOT PASSED.
- Mandatory stop: no second CSS correction, no expectation/tolerance weakening, no rerun, no Commit/Push/PR. Attendance synchronization remains verified; full original matrix420 and earlierstress24 captures are historical pre-fix evidence, not clearance of this new gate. The repeated-failure stop in the original Slice11 brief is honored.

## Remaining cause and scope classification at stop
- Confirmed fact: the rendered label boxes still do not reserve their measured text extents. After the attempted correction, EN example remains44px box versus50px text; AR example45px box versus54.5px text. 13 of14 labels fail in each of four locale/theme cases.
- Correction to the earlier mechanism statement: implicit grid-track compression was a source-based hypothesis, not a complete proven cause. The two grid declarations did not resolve the measured defect. The exact winning layout/line-box/font interaction remains unverified; it requires further computed-style/inline-box investigation in a separately resumed recovery. No second correction was attempted.
- Reviewer noted the narrow attendance recovery scope caution. The parent treated the originally mandated many-course validation failure in the explicitly allowed private CSS owner as a Slice11 finish blocker and attempted only two declarations. That attempt is unverified and remains uncommitted; TSX/messages and all567 protected paths are preserved. No new feature or owner was added.
- A final report-read probe repeated the known cwd mistake for outputs/recovery/course-fix-browser.log; source and stop-condition reads succeeded. This probe is not a validation result; all logs are retained under the explicit projectless outputs root.
- User original brief section23, lines1104-1108 verified: Repeated local failure after correction: BLOCK. No Commit, Push or PR. This stop applies now; no further correction or test rerun follows.

---

# Mobile layout recovery failure history

## Protected checkpoint
- Original32 files byte-identical to prior blocked inventory; full ZIP/patch saved before test instrumentation. Production files unchanged during investigation.

## First exact four-case reproduction, before production correction
- before-four: all4 existing stress cases failed the unchanged full wrapped-text containment assertion. Added evidence collection/screenshot only; expectations/fixtures/viewports/tolerances were not weakened. Screenshots,14-row DOM/CSS/neighbor/child/width metrics, raw geometry and traces preserved in before-four-artifacts.
- All pages390x844, EN/AR x light/dark, Chromium. Document scrollWidth=clientWidth=390. Failure is vertical; no horizontal viewport overflow. All original14 checkboxes and full bilingual names are present.
- Specific element: package fieldset course-list label (.toggle), not native live-session select or existing-item summary. label display:flex, align-items:center, min-width:auto; text white-space:normal, overflow-wrap:anywhere; input flex-shrink:0. Child width fits and neighboring control widths remain inside the row.
- Confirmed property: inherited course-label line-height21px at14px font in EN and22.5px at15px in AR. Actual text fragment rectangles are29px and32px high with the inherited Tajawal/Noto Sans Arabic stack. Consecutive text lines advance less than their rendered extents, protrude above/below row bounds and collide vertically. Grid max-content sizing uses those undersized line boxes, so the prior grid-only correction did not address the cause. No RTL-only/native-select/breakpoint/unbreakable-width cause is supported.
- One correction selected before any production edit: scoped .courseList .toggle line-height2.25. This yields31.5px EN/33.75px AR, exceeding measured29/32px fragment heights while preserving fonts, complete text, natural wrapping, input dimensions, bounded scroller, payloads and attendance. No truncation/overflow concealment or tolerance changes.
- Validation pending; no success inferred before rerun. If any original case fails after this correction, BLOCK with no speculative second patch.

## One correction result
- exact-four passed4/4 on corrected fresh standalone production build; no assertion, fixture, viewport or tolerance weakened. EN line-height31.5px, AR33.75px; measured full text stays inside every original14 row boxes at mobile and desktop. All exact payload, keyboard and interaction assertions also passed.692 focused tests including both attendance locales passed. Broad regression is still pending.

## Narrow and cross-size validation
- narrow-stress passed4/4 locale/theme cases, each at320/360/390/834/1440px with unchanged full long unbroken English/Arabic names. Full text containment/no checkbox collision, min44px targets, full accessible names, native Space key toggling/focus and no horizontal viewport overflow all passed. No further production correction. Full frontend, previous guards and complete browser matrix are running on final CSS.

## Full ESLint first invocation: generated live trace resources
- Full eslint . --max-warnings=0 failed2242 problems (10errors/2232warnings). Every reported file is inside the active full-browser run's test-results/s11-m-full/.playwright-artifacts-*/traces/resources JS bundles; exact paths saved in eslint-first-diagnostic.json, original full eslint.log preserved.
- Confirmed cause: running the full lint traversal while Playwright was creating temporary unpacked vendor trace resources. The changed source/test-file ESLint already passed; no source file is in this first full-run diagnostic.
- Correction planned: let the required browser run finish and its own normal trace-resource cleanup complete, then rerun the identical full ESLint command. No source/config ignore, warning threshold, exclusion, test suppression, deletion or dependency change. Do not report full lint passed before the rerun.

## Audit helper path first failure
- Scope prechecks passed through exact CSS-only delta/unchanged TSX and messages, then the audit helper computed the wrong parent for work/slice11_mobile_assertions.cjs and Node returned MODULE_NOT_FOUND.
- Cause: parent-index path arithmetic pointed one level above this task. No application/test assertion ran or changed.
- Correction planned: resolve the helper as a sibling of the running audit script using __file__, then rerun the same audit.


## Broad regression results
- Full frontend4931/4931 across148files, previousguards2159/2159, full productionbrowser22/22 all passed after the final scoped line-height change. No tests skipped. Backend unchanged tests5/5 passed.
- Audit helper sibling-path correction passed;48 original AST-printed assertion calls all retained (59 now), primary12-case matrix source bytes unchanged. All567 protected paths unchanged; recovery production delta exactly one scoped private CSS rule; TSX/messages unchanged.
- Full ESLint same-command rerun after normal browser cleanup and final fresh production build are pending; no final clearance claimed yet.

## Final gate results
- Identical full ESLint rerun after Playwright cleanup passed, zero warnings, no source/config change; final fresh production build passed. The first generated-trace failure remains preserved. All required application regression gates are green.
