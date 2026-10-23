# UI-D01-15 / Slice 3 — Academic Qualification Registry

**MOCKED UI-CONTRACT EVIDENCE**

Working slice under UI-D01-15, not a new roadmap ID. Only Qualification Registry adopts the versioned-registry, creation-form and rubric-to-exact-version binding archetype. Preflight main: `e94a2b216c18f293869573768dcdf83fda42dd67` (PR #209 merged). Roadmap ownership: UI-DEEP-01 modernization roadmap, lines 188–196, owner at line 191.

The production changes are confined to `frontend/src/features/admin/qualification-registry-management.tsx` and its private CSS module. Five paired query-state messages were added to each existing locale catalogue; every previous message is preserved.

Header → compact qualification form → compact version form → qualifications with nested versions → rubric binding rows. Opaque working panels, divider rows, local semantic roles, 44px controls, keyboard focus, logical RTL layout and routine 400/500/600/700 weights follow DC01–DC16. Qualifications without versions retain their distinct existing copy. No lifecycle labels, latest-version selection or inferred binding is introduced.

## Contract evidence

- Two independent GETs, exact query keys and `retry: false` remain unchanged.
- Qualification creation posts the exact untrimmed form; version creation retains its exact payload and UTC midnight/end-or-null transformation.
- Binding remains a bodyless POST to the exact rubric-template/version IDs, with the original empty/unchanged/pending guards, local map reset and rubrics-only invalidation.
- Forms stay mounted; success clears only its owning form; failures retain drafts. Current binding depends on both supplied code fields, never on a local selection or an ID alone.
- Raw qualification, nested version and rubric order is preserved, including inactive entries. Cached data remains visible during factual refresh errors; cold query errors never become successful empties.

`qualification-registry-archetype.test.tsx` exercises the real component and React Query with an intercepted API mock. The independent contract fixture records pre-edit setup, DTO types, interaction properties and academic identity expressions directly from live main. Its canonical hash is pinned. Mutation-resistance tests are separate from the presentation projection.

Historical baseline JSON files and hashes were not rewritten. Exact, unique, fail-closed owner seams restore the historical presentation for its source audits. Exact five-leaf locale projections preserve every earlier message. The previous Account Identity guard also freezes the Audit Log test source; two precise guard-alignment seams restore that test's original source for that hash. No historical assertion, transport rule or production owner is removed. The new contract freezes 47 other files.

## Browser evidence

The manifest binds source hashes, build identity, actual intercepted request records, scenario results, screenshot dimensions and original PNG byte hashes. The matrix is EN + AR/RTL × light + dark × 1440×900, 834×1112 and 390×844. Each case captures 27 states, including populated/zero-version/long content, invalid forms, each mutation pending/error/success, local binding changes, keyboard focus, independent cold query states, successful empties and cached refresh errors.

Four labeled contact sheets contain selected cropped previews. All 324 original full-page screenshots and test logs remain outside Git in the exact `captureRoot` recorded by [manifest.json](manifest.json). Crops do not substitute for the original hashes. The half-viewport reflow proxy uses 720/417/320 CSS px; it is not native 200% browser zoom.

## Original failures and corrections

- Initial focused batch: **42 failed, 366 passed**, nine files. The eight historical files passed. New test setup accidentally returned a mock function, which Vitest treated as cleanup; a binding text query also matched both an option and a paragraph. Corrected the test setup and paragraph selector, then reran all nine files together: **408/408 passed**.
- Initial two-case browser pilot failed at the cold-loading scenario: a global status locator briefly matched both independent query regions after reload. Scoped it to the named region and awaited the other query's rows. The full matrix was subsequently run together; its result is recorded in the manifest.
- Initial full format check rejected the new CSS file. Prettier corrected whitespace only; a direct comparison confirmed identical CSS after removing whitespace. Formatting and final-source validation were rerun. Original logs and pre-format CSS are retained externally.
- The local baseline generator initially used a Windows drive path as an ESM import. Corrected to a `file:///` URL before generating the fixture. A preliminary read-only divergence command also referenced a nonexistent branch alias; the calculation was repeated against PR #190's verified exact head SHA and returned main-ahead 21 / PR-ahead 1.

Original failures remain recorded; later passing runs do not erase them. Nonfatal local diagnostics include Next's existing standalone/start warning, Node's color-environment notice and jsdom navigation diagnostics in the full test log.

## Limits

These are synthetic UI/request contracts. They do **not** prove database persistence, Pearson academic correctness, qualification accreditation, authorization, deployment, production readiness or complete WCAG compliance. No real backend write was performed.

A pre-existing integration limitation remains: `QualificationRegistryService.CreateQualificationAsync` requires `SpecializationId`; the frozen frontend qualification form posts only code and Arabic/English names. This slice preserves that payload as explicitly requested. Mocked creation success is therefore not proof that this existing creation workflow succeeds against the backend. No backend, academic rule, permission or seed change was made.

Audit Log, Account Identity, other Academic owners, completed Student/Teacher/Admin/Assessment production owners, AI/RAG, dependencies and PR #190 are unchanged. This handoff is a Draft PR only: not Ready, not merged, no auto-merge and no next slice.
