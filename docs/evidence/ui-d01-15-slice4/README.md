# UI-D01-15 / Slice 4 — Governance Platform Rating Moderation

**MOCKED UI-CONTRACT EVIDENCE**

Working slice under UI-D01-15, not a new roadmap ID. Roadmap ownership confirmed at line 191 of the external UI-DEEP-01 modernization roadmap; rule at line 195: one module/archetype per slice. Preflight base: `30322f0d73f6ad390025cb4b5e29447d336288dd`, merged PR #210. Independent #190 owns package/lock files and remains untouched.

Only `frontend/src/features/admin/platform-rating-moderation.tsx` and its private CSS module adopt this archetype. Nine paired factual presentation leaves are added to `adminWorkspace.platformRatingModeration`; every old catalogue value is retained. No other production owner migrates.

The workspace uses a small authoritative summary, one opaque review list, divider rows and inline moderation controls. Each row preserves the exact comment, updated date, four independent scores and original localized one-decimal average. Publication and public-display consent are separate labeled facts. A legacy published/no-consent combination shows both facts and still disables Publish. No reviewed/approved/rejected lifecycle or learner identity is invented. Text areas wrap the same optional per-review reason draft, with the unchanged 500-character limit and payload normalization.

## Contracts

- Ratings: `GET /admin/platform-ratings`, key `["admin-platform-ratings"]`.
- Summary: `GET /admin/platform-ratings/summary`, key `["admin-platform-ratings-summary"]`. No added query options, parameters, fan-out, local sorting/filtering, pagination or bulk action.
- The old loaded `!isPublished` count was removed from presentation. All platform totals and average come directly from the independent summary. The list explicitly identifies its server order and 200-entry bound; it is not represented as a complete platform dataset.
- The mutation remains `POST /admin/platform-ratings/{id}/moderation` with exactly `{publish, reason: reasons[id]?.trim() || null}`. An untouched stored reason is not implicitly sent as a new local draft.
- Keep Private requires no consent or reason. Publish is disabled only by the existing `moderate.isPending || !rating.allowPublicDisplay`; being already published does not add a new guard. The single pending mutation disables actions globally across rows.
- Success invalidates exactly ratings, summary and public `["platform-ratings"]`. No reason draft is reset. Failure preserves drafts, with the original Error.message/fallback ownership.
- Initial pending, cold error and successful empty are distinct. Summary failure does not hide usable reviews. Actual cached rating/summary data can remain with factual refresh errors; no query-option change supplies invented cache data.

The independent fixture pins pre-edit query/mutation setup, DTO types, every interaction property, average arithmetic and date/number calls directly. Exact owner, locale and historical test-alignment projections fail closed on changed/missing/duplicate seams. Earlier baseline JSON files and hashes are unchanged; 53 protected files remain frozen.

The historical moderation translation test's loaded-count expectations were replaced with stronger server-summary and publication assertions, including absence of the misleading loaded badge. Its existing payload, consent, error, formatting, maxLength and invalidation assertions remain. Successful empty now uses factual returned-list copy while preserving the nonzero independent-summary assertion.

## Validation and browser evidence

The manifest records final source hashes, build identity, request records, scenario outcomes, original PNG byte hashes and dimensions. EN + AR/RTL × light + dark × 1440×900, 834×1112 and 390×844 each capture 25 states: 300 full originals. The long-list fixture has 15 rows in supplied order; consent, inconsistent flags, comments, scores, optional/whitespace/existing reasons, actions, global pending, errors, cache and independent-query cases are represented.

Every capture verifies app theme and page overflow. Keyboard focus is exercised on reason, Keep Private and Publish. Reflow uses half CSS viewport width, with a 320px minimum (720/417/320); this is a proxy, not native browser zoom. Four labeled contact sheets are selected cropped previews. All original full-page PNGs and logs remain external to Git at `captureRoot` in [manifest.json](manifest.json).

The existing `PlatformRatingsControllerTests` passed **4/4** unchanged. These are direct controller tests using EF InMemory. Source inspection also confirms the public `IsPublished && AllowPublicDisplay` condition, server consent rejection, student-edit moderation reset, summary definitions, ordering and 200-row bound. This is not PostgreSQL persistence or HTTP authorization evidence. Restore emitted existing NU1902/NU1903 cryptography-package warnings; dependencies remain frozen.

## Original failures

- First focused batch: **1 failed, 514 passed** across ten files. The whole-Admin auditor passes an absolute path; the new projection initially recognized only a relative path. Added the same exact owner suffix match and an absolute-path regression. The complete ten-file batch passed **515/515** after correction.
- First two-case browser pilot failed before capture because the test opened `/admin/platform-ratings`, which falls back to the Admin dashboard. Inspected `AdminArea`, corrected the test URL to the existing `/admin/ratings`, and both complete pilot cases passed. No production route changed. The full final-build matrix was then run together.
- First full format check rejected line wrapping in the new direct test file. The diff changed whitespace only. Prettier write/debug-check and the subsequent full format check passed. The original file/log remain external.

Failures are retained in the manifest and logs; corrected results do not erase them. Next's local standalone/start warning, Node's color-environment notice and any jsdom navigation diagnostics remain documented nonfatal output.

## Limits and stop boundary

Synthetic evidence does not prove real moderation persistence, consent legality, database correctness, authorization, public publication, deployment, production readiness or complete WCAG compliance. No real backend moderation write was performed. The known Qualification Registry `SpecializationId` integration debt remains unchanged and requires a separately authorized fix.

Audit Log, Account Identity, Qualification Registry, all other UI-D01-15 owners, Student/Teacher/Admin/Assessment production owners, public/student rating production, backend and AI/RAG are frozen. Handoff is one Draft PR only: not Ready, not merged, no auto-merge, no force push and no Slice 5.
