# Slice 9 failure ledger

1. **First focused contract run** — `pnpm exec vitest run tests/academic-catalog-management-archetype-contract.test.ts --maxWorkers=1 --reporter=dot`: 112 passed, 3 failed.
   - Original failure A: optional trailing commas added by formatting caused equivalent object literals in onChange handlers to print differently. Correction: AST transformer canonicalizes only object-literal NodeArray trailing punctuation, preserving property names/values. Rerun: contract equivalence passed.
   - Original failure B/C (EN/AR): a negative test appended `changed` after the exact seam, leaving the seam itself unchanged; the projection correctly continued matching it. Correction: mutate a character inside the seam instead. Rerun: both negative tests passed.
2. **Second focused run — STOP TRIGGER** — `pnpm exec vitest run tests/academic-catalog-management-archetype-contract.test.ts tests/admin-academic-catalog-management-translation.test.tsx --maxWorkers=2 --reporter=dot`: 126 passed, 1 failed; duration 2.90s.
   - Failure: prohibited pattern `/...|fetch\(/` matches `refetch(` in the authorized query retry callback.
   - Cause confirmed directly in owner line 75: `onClick={() => void query.refetch()}`. No direct `fetch` call was added.
   - Correction: **not applied**. The task explicitly says “Repeated local failure: BLOCK”. No further test rerun, implementation correction, commit, push or PR.

Other command/discovery issues, retained rather than erased:

- An early `pnpm test -- tests/admin-academic-catalog-management-translation.test.tsx --reporter=dot` forwarded a literal separator and did not produce a bounded focused result; it started many workers and emitted jsdom navigation notices. Interrupted. No full-suite success inferred. Later used explicit `pnpm exec vitest run` with bounded workers.
- One inline Python edit attempt failed in PowerShell parsing (`Missing property name after reference operator`). It did not edit files. Replaced by an explicit apply_patch edit.
- Discovery attempts used an absent `frontend/e2e` directory, Windows wildcard operands, a guessed `.mdx` docs extension, an absent guessed audit-test filename, and one doubled `frontend/frontend` prefix. These were read-only path failures. Actual paths were found through `rg --files` / directory inventory and used for subsequent reads.
- An initial fetch in the older C:/Dev/Betcco checkout returned slowly but ultimately succeeded. The active task used a verified fresh worktree from C:/Dev/Betcco-LENOVO. Existing user changes in the older checkout were not modified.

Successful checks actually completed:

- `pnpm install --frozen-lockfile --offline`: success; dependency files unchanged; installed cached locked dependencies. Installed pnpm 11.25.0 reported itself; packageManager declaration remains 11.19.0.
- `dotnet restore backend/Betcco.sln`: success with existing NU1902/NU1903 advisories for System.Security.Cryptography.Pkcs and System.Security.Cryptography.Xml 10.0.11. No dependency upgrades performed.
- `dotnet test backend/tests/Betcco.IntegrationTests/Betcco.IntegrationTests.csproj --no-restore --filter 'FullyQualifiedName~AcademicProgrammeAuthorityTests|FullyQualifiedName~AcademicCatalogueTests|FullyQualifiedName~QualificationRegistryServiceTests|FullyQualifiedName~TaxonomyTrackDetailsTests' --logger 'trx;LogFileName=academic-contracts.trx' --results-directory <outputs>/backend`: 19 passed, 0 failed, 0 skipped.
- Explicit formatter write ran on touched TSX/CSS/translation/test/helper/fixture files. This is not a repository format:check pass.
- Latest focused component runtime tests: 12 passed; new contract tests: 114 passed, 1 failed.
- `git diff --check`: passed.

Required outstanding checks: new exhaustive workflow and state component tests; all previous UI-D01-15 and localization regressions; completed full frontend suite; browser matrix EN/AR light/dark across 1440×900, 834×1112, 390×844 and reflow/focus/stress states; format:check; ESLint zero warnings; TypeScript; fresh frontend production build; complete final diff/finish review; post-push CI (only after authorized success path becomes eligible).

# Recovery / completion history

The preceding block is the original blocked handoff retained verbatim. Its outstanding-check list records that historical checkpoint, not the final recovered result.

- Before modification: reproduced `/fetch\(/.test("query.refetch()") === true`; separate TypeScript CallExpression scan found zero fetch calls in the production owner.
- Correction: remove only the fetch substring alternative from the existing prohibited-pattern assertion; independently require `directFetchCalls(source)` to be empty. Detection uses exact AST callee/member/computed-string names in the existing TypeScript helper. No production changes.
- Positive regression cases: fetch, window.fetch, globalThis.fetch, globalThis["fetch"], parenthesized fetch, comments before the argument list, optional member/call syntax, non-null call. Negative cases: query.refetch, refetch, prefetch, prefetchQuery, fetchRecords, myfetch, text strings and comments.
- Formerly failing test: PASS. Focused verification: 143/143. Previous/boundary guards: 1248/1248. Complete frontend suite: 4122/4122. Format, ESLint zero warnings, TypeScript, fresh production build and diff whitespace checks passed. Backend 19/19 unchanged evidence retained and TRX verified.
- A local Python log-print wrapper hit Windows cp1252 UnicodeEncodeError after TypeScript itself had exited 0 and its result JSON was saved. Corrected wrapper stdout encoding to UTF-8. Final TypeScript rerun passed with clean wrapper output. No compiler error was hidden.
- Initial browser pilot: all assertions passed. Image inspection found element screenshots placed the top behind the sticky shell header. Interrupted the preliminary matrix, retained its files/log, corrected screenshot-only code to full-document capture from scroll top, and reran all twelve scenarios plus three existing integration tests. Final 15/15 passed; 228 accepted final captures. This did not change production UI or weaken assertions.
- System Python lacked Pillow. Used the desktop-provided bundled Python/Pillow runtime for screenshot validation/contact sheets; no frontend dependency changed.
- One recovery read attempted a nonexistent providers path; actual path was discovered through rg --files. One status read was accidentally issued from the projectless output directory and failed; final audits ran in the explicit worktree. Neither operation edited files.
- No local test failure repeated after the recovery correction. Original failures remain visible; no retry, skip or assertion deletion was used to turn a failing product behavior green.
