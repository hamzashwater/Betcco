# UI-D01-15 / Slice11 — Content Studio

**All required local gates passed. Draft PR handoff only.** Historical BLOCKED records below remain preserved as checkpoint evidence; current results are in [mobile-recovery/validation-current.json](mobile-recovery/validation-current.json).

The existing publishing owner now has five persistent sections: articles, teacher public profiles, packages, live sessions and attendance. Section changes retain drafts; each operation has independent pending/error/success feedback. Read failures remain distinct from successful empty results and retain usable cached records on refresh failure.

## Mobile recovery

The four original390px long-course cases were reproduced before a production change, with full DOM/computed CSS, parent/child/neighbor rectangles, width metrics and screenshots. Package course labels inherited21px/22.5px line heights while text fragment boxes measured29px/32px. The text consequently extended beyond line/row bounds and collided vertically. Widths fit in all four cases. The earlier grid-only hypothesis did not explain this font/line-box mismatch.

The sole production change in this recovery is `.courseList .toggle { line-height: 2.25; }` in the private CSS module. EN/AR now compute31.5px/33.75px; first-row heights63px/67.5px. All14 original labels fit their full text at mobile and desktop. No font, size, text, markup, accessible name, transport or attendance logic changed.

The four exact assertions retain identical fixtures, expected counts, viewports and tolerance. A TypeScript AST audit confirms every original assertion call remains and the primary12-case matrix source bytes are unchanged. Four added cases exercise complete unbroken English/Arabic names at320,360,390,834 and1440, with text/checkbox collision checks, full accessible names, minimum44px label targets, native Space toggling/focus and no horizontal viewport overflow.

[Investigation](mobile-recovery/investigation.md) · [Complete four-case DOM/CSS measurements](mobile-recovery/dom-css-evidence.json) · [Assertion audit](mobile-recovery/assertions-audit.json).

## Current verification after the final source change

| Gate | Result |
| --- | --- |
| `focused` | 692/692 |
| `exact-four` | 4/4 original cases |
| `narrow-stress` | 4/4, five widths each |
| `full-frontend` | 4931/4931,148 files,zero skips |
| `guards` | 2159/2159,30 files |
| `full-browser` | 22/22 |
| `format` | Passed |
| `eslint-corrected` | Passed,zero warnings |
| `typescript` | Passed |
| `production-build-final` | Passed,fresh build |
| `backend` | 5/5 unchanged InMemory/pure tests |
| `diff-check` | Passed |

Counts overlap: focused/guard cases are part of the full frontend suite. E2E is separately run. These are new post-fix results; earlier4931 passes remain historical. Exact commands, durations, exits and retained log hashes are recorded in the current validation JSON.

The first full ESLint invocation encountered only unpacked generated vendor JS from the simultaneously running Playwright trace collector. After that run's normal cleanup, the identical full command passed with zero warnings. No ignore rule, threshold, source exclusion or dependency was changed. First failures and corrected results remain in [failure-history.md](failure-history.md).

## Browser evidence

**MOCKED UI-CONTRACT EVIDENCE.** Chromium, fresh standalone production build, synthetic intercepted HTTP.

- 12 primary cases: EN/AR ×light/dark ×1440x900/834x1112/390x844;35 captures each.
- 4 original stress cases with14 courses, long bilingual names, public profile, exact package POST and native attendance keyboard correction;8 captures each including geometry evidence.
- 4 additional unbroken-name cases, five widths each;20 captures.
- 2 unchanged original residual browser cases also passed. Total22 browser tests;472 new captures across20 screenshot scenarios. Every PNG decoded/nonblank/dimension/SHA checked; every scenario has an empty page-error list.

The [manifest](manifest.json) records the current source/CSS hashes and all originals. Four current scaled overviews show the five primary workspaces at each required width: [EN light](contact-en-light.png), [EN dark](contact-en-dark.png), [AR light](contact-ar-light.png), [AR dark](contact-ar-dark.png). Cropped before/after scroller comparisons: [EN light](mobile-recovery/course-rows-en-light.png), [EN dark](mobile-recovery/course-rows-en-dark.png), [AR light](mobile-recovery/course-rows-ar-light.png), [AR dark](mobile-recovery/course-rows-ar-dark.png). Full raw images/gallery are retained in the local handoff and reproduced by the focused E2E spec.

The independent reviewer inspected16 corrected originals and scored its sole course-label finding resolved: [limited verdict](mobile-recovery/finish-verdict.md). This is a verdict on that one fix, not a new whole-surface audit. [System comparison](mobile-recovery/design-comparison.md) preserves incumbent tokens, controls, breakpoints and system files; the private line height is not a shared typography rule. Original review is retained in [finish-review.md](finish-review.md).

## Preserved contracts and scope

Eight query families and five mutation functions remain exact: endpoints, methods, nullable fields, price/date conversions, selected IDs, query enablement, success resets and invalidation. The independent unprojected AST comparator and runtime transport tests passed. Attendance remains server authoritative with Present/Late/Absent/Excused, exact `{studentUserId,status}` PUT and selected-session invalidation; no synchronization logic changed in this recovery.

All567 protected paths remain unchanged: earlier owners, backend, dependency/lock files and CI. All60 old adminContent EN/AR leaves remain unchanged with exactly29 paired additions from the existing Slice11 implementation. TSX/messages and all non-evidence files other than private CSS/E2E are byte-identical to the32-file protected recovery checkpoint. No global CSS, new routes, dependencies, backend, payments/refunds/entitlements or AI/RAG change.

Historical test projections accept only exact approved owner/message/helper seams, fail closed for unknown bytes and are backed by independent unprojected contract comparison. They were not broadened in mobile recovery.

## Source/test inventory

| File | Reason |
| --- | --- |
| `frontend/src/features/admin/content-studio.tsx` | Existing complete owner: five sections, independent feedback/read states, draft preservation, attendance ledger. |
| `frontend/src/features/admin/content-studio.module.css` | Private semantic-token responsive styles; mobile recovery adds only scoped line-height2.25 for complete long course labels. |
| `frontend/messages/en.json` | 29 paired `adminContent` display-copy additions; old values preserved. |
| `frontend/messages/ar.json` | Matching Arabic display-copy additions and exact key parity. |
| `frontend/tests/admin-content-studio-residual-translation.test.tsx` | Existing assertions activate the relevant persistent section and observe asynchronous feedback. |
| `frontend/tests/content-studio-archetype-contract.test.ts` | Exact source/message seams, unprojected contracts, mutation rejection and protected paths. |
| `frontend/tests/content-studio-archetype-states.test.tsx` | 34 query-state, independent draft/feedback and attendance cases; recovery corrects live-render timing only. |
| `frontend/tests/content-studio-archetype.test.tsx` | Five workflow component contracts, forms, draft retention, pending/errors and exact transport. |
| `frontend/tests/content-studio-attendance-synchronization.test.tsx` | New four EN/AR diagnostics/regressions proving the twelve recovery requirements and optional synthetic timelines. |
| `frontend/tests/e2e/content-studio-archetype.spec.ts` | Primary workflow matrix and original assertions retained; full DOM/CSS diagnostic evidence and additional narrow/unbroken-name coverage. |
| `frontend/tests/fixtures/content-studio-archetype.ts` | Synthetic bilingual data for the five workflows and eight query families. |
| `frontend/tests/fixtures/content-studio-original.txt` | Exact pinned pre-slice owner for independent contract comparison. |
| `frontend/tests/fixtures/ui-d01-15-content-studio-baseline.json` | Exact approved hashes/seams, original copy and protected-path inventory; recovery whitespace only. |
| `frontend/tests/helpers/academic-catalogue-projection.ts` | Chains the exact Content Studio presentation seam through previous guards. |
| `frontend/tests/helpers/admin-final-i18n-audit.ts` | Reads the exact approved owner seam for historical i18n source freeze. |
| `frontend/tests/helpers/content-studio-contracts.ts` | Unprojected AST extraction of query, mutation, domain, initial-state, date and selection contracts. |
| `frontend/tests/helpers/content-studio-projection.ts` | Fail-closed exact approved owner/copy/helper seams; unknown bytes remain visible. |

Evidence files in this directory document the implementation and both recovery checkpoints. Original attendance investigation/timelines and previous failure summaries remain historical; current mobile results take precedence.

## Limits

Synthetic browser/component traffic does not establish live persistence, authorization, provider integration, payments, deployment, Pearson approval or whole-site WCAG. Chromium only.720CSSpx reflow is approximate, not native200% browser zoom; screen readers and complete contrast measurements remain unverified.

Relevant unchanged backend coverage is three EF InMemory package/blog controller tests plus two pure provider-catalog tests. No teacher/session/attendance PostgreSQL persistence or live authorization claim follows; this is not a statement that PostgreSQL is unavailable. Existing NU1902/NU1903 Pkcs/Xml10.0.11 warnings and frontend certificate mock-query warnings are retained out of scope.

The incumbent computed Tajawal/Noto Sans Arabic stack differs from the older Inter/IBM direction note; no font/system change was authorized or made. PRODUCT/DESIGN/config/sidecar remain absent, disclosed without creating a new system.

Stop at one Draft PR and initial CI snapshot. No Ready, merge, Final UI Audit or next roadmap task.
