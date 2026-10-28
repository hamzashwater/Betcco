# UI-D01-15 / Slice 10 — Academic Catalogue

**MOCKED UI-CONTRACT EVIDENCE.** Owner-selected working label within UI-D01-15, not a new roadmap ID. The UI-DEEP-01 modernization roadmap's UI-D01-15 entry lists `academic-catalogue.tsx` and requires one module/archetype per slice. Preflight main: `84acc7ea50af4d10a5b92552d4e4b1de36cc34d0`, after merged PR #216. A fresh worktree/branch started at this SHA with ahead=0, behind=0. The only pre-existing open PR was #190, independently inspected and touching only package/lock files. No overlap.

The parent now has a compact header and qualification-version context, a divided expandable Unit register, and separate identity/localization, Aim→Criterion, Definition→Scope sections. Definitions and scopes display their active/draft state separately from validation. Validation issues retain precedence over readiness. Only the first Unit opens by default; every Unit keeps native keyboard-accessible disclosure. No search, sorting, bulk operation, student scoring or client validation engine was added.

Slice 9 `AcademicCatalogManagement` remains imported and rendered exactly when `versions.isSuccess`. Its production TSX/CSS bytes are unchanged. The parent CSS targets its own classes and does not style child controls through broad descendant rules. Delivery Planning, Qualification Registry, Content Studio, backend production, package/lock, AI/RAG and previous owners remain untouched.

## Preserved contracts

- Version query `['academic-catalogue', 'versions']`, exact endpoint and retry false; explicit chosen ID → first server-returned ID → empty selection. No active/latest inference.
- Catalogue query `['academic-catalogue', versionId]`, exact endpoint, Boolean(versionId) enablement, retry false and no placeholder content from another version.
- Definition publish and scope activate retain exact POST URLs, exact IDs, no body and zero-server-validation/inactive eligibility. Unit status retains its exact PUT and `{isActive: !unit.isActive}`. Every success invalidates the exact current version query.
- PearsonOfficial-only Arabic display editing retains untrimmed `{arabicTitle}` transport, existing blank/equivalent/pending protection, per-unit drafts, target-only success clearing, immutable official English identity and exact invalidation.
- Original issue map, unknown fallback, state precedence, Unit→Aim→Criterion hierarchy, raw P/M/D bands, per-Unit ID resolution, missing-ID filtering/none, localized Scope Grade/Specialization/Rubric and version distinctions remain intact.
- Two queries/four mutations and all pre-render setup, types, handlers, predicates and mappings are independently compared against the original owner. Eighteen negative contract mutations, exact fail-closed presentation seams and 92 protected-file checks guard drift. Two historical Slice 9 test files have exact test-only alignment seams; earlier baselines and protections remain intact.

Fourteen paired leaves were added under `academicCatalogue`; old copy and all other namespaces remain unchanged. Existing Inter/IBM Plex Sans Arabic, semantic roles, routine 400/500/600/700 weights, opaque panels, logical borders, wrapping, focus and 44px controls preserve the DC03 contract. There is no new animation.

## Verification actually completed

| Check                                              | Result                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Existing Academic Catalogue component tests        | 5/5                                                                                            |
| Focused Slice 10 contract/runtime + existing tests | 136/136 after recorded test corrections                                                        |
| Previous archetype/academic/localization/UI guards | 1379/1379, 24 files                                                                            |
| Complete frontend suite                            | 4253/4253, 144 files                                                                           |
| TypeScript                                         | Pass after recorded test-only option correction; final pass after browser additions            |
| ESLint                                             | Full frontend zero warnings; final browser file checked separately                             |
| format:check / diff whitespace                     | Pass                                                                                           |
| Fresh production build                             | Pass, Next 16.3.6, compilation/TypeScript and 10 static pages                                  |
| Existing unchanged backend tests                   | 17/17, AcademicCatalogueTests and AcademicProgrammeAuthorityTests                              |
| Browser matrix + existing parent integration       | 15/15: 12 matrix scenarios + 3 existing tests                                                  |
| Additional EN/AR keyboard/cached-version recovery  | 2/2 after recorded event-target correction                                                     |
| Screenshot validity                                | All 288 matrix images decoded, nonblank/expected widths checked; four contact sheets generated |
| Impeccable mechanical detector                     | Empty findings array on the owner and CSS                                                      |

Existing jsdom navigation/certificate-fixture warnings and NuGet package advisories are retained in the logs; they were not hidden or fixed through unrelated changes. The backend suite covers definition publication, scope validation/activation, Unit activation and official localization with its existing contexts; it is not new PostgreSQL/concurrency evidence or exhaustive HTTP/authorization/rollback verification.

## Visual coverage and limits

EN and AR/RTL × light and dark × 1440×900, 834×1112 and 390×844. Twenty-four matrix captures per scenario cover populated/empty/loading/error version/catalogue states, chosen version identity, multiple official/custom/unknown Units, active/inactive state, long academic/source/rubric copy, no Aims/Criteria/Definitions/Scopes, P/M/D, valid/invalid/active Definitions and Scopes, unresolved IDs, exact individual mutations with pending/error/success, Pearson localization and isolated drafts, cached catalogue warning, keyboard focus and 720px equivalent reflow. Two extra browser cases cover keyboard traversal of the selector, disclosure, localization input/save, Unit status, publish and scope actions, plus cached-version refresh failure and keyboard retry.

`manifest.json` lists 288 matrix captures plus two supplemental keyboard/cache captures with dimensions and SHA-256, observed reads, write counts and scenario results. Full observed request bodies remain in each raw scenario's evidence.json. Four contact sheets contain scaled original populated screenshots across all three sizes. Raw captures, complete first-failure logs/traces, backend TRX and an interactive gallery are retained at `C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice10/`.

All browser data is synthetic intercepted HTTP on the actual fresh standalone production build. This is not proof of real production persistence, authorization, deployment, Pearson approval, academic compliance, full WCAG, native browser zoom or browser engines beyond Chromium. The reflow capture uses 720 CSS pixels to represent 1440px at approximately 200%. The Slice 9 child remains outside the redesign boundary.

Independent bounded finish review returned **SHIP** after inspecting all twelve base combinations, operation/query state sequences, representative reflow and both final keyboard/cache captures, plus code/contracts and passing logs. It found no material defect requiring correction. Screen-reader behavior, exact computed contrast ratios and every individual state across all captures were not independently audited by that reviewer.

Handoff is exactly one Draft PR only: NOT READY, NOT MERGED, no auto-merge, no force-push, no main push and no Slice 11.
