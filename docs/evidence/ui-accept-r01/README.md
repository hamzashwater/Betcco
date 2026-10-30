# UI-ACCEPT-R01 — Persistent theme under CSP

Local theme remediation evidence, 2026-10-30. Baseline and freshly fetched `origin/main`: `8ba977e96c9a5861de62141a2668bacfdf775ea6`. The ASUS final audit remains insufficient for final product acceptance; this report addresses its theme defect only.

## Preflight and confirmed cause

The audit checkout was preserved. A clean dedicated worktree and `fix/ui-accept-r01-theme-restoration-csp` branch were created after inspecting every open PR and its changed files. Only #219 (Next) and #220 (Zod) were open; both touched `frontend/package.json` and `frontend/pnpm-lock.yaml`, with no file overlap. Neither PR was modified. A second fetch before handoff confirmed the same main SHA and open PR set.

**Confirmed, high confidence:** the production response required a request nonce, but both root layouts omitted it from their existing inline theme initializer. In Chromium, all four EN/AR × desktop/mobile baseline cases stored `light`, returned raw HTML without `data-theme`, hydrated with no theme attribute, and lost Light after reload. Each emitted one enforced `script-src-elem` violation blocking `inline`. The baseline production regression failed 4/4 cases; nonce unit regressions failed for both locales and the default root.

The nonce-only correction restored hard reloads, but actual client locale navigation exposed a second part of the defect: Next replaced `<html>` attributes without rerunning its inline initializer. `ThemeRestoration` now reapplies the same stored preference in a layout effect when the locale changes. It renders no UI. Moving it outside the translation provider also preserves the existing historical layout seam and its mutation guards.

## Correction and security review

- Both root layouts read the request's `x-nonce` with the version-pinned asynchronous `headers()` API and authorize only the existing initializer. Its payload and Dark fallback are unchanged.
- The null client component restores Light/Dark before painting on locale changes; denied storage or invalid values use Dark without rewriting the preference.
- `src/proxy.ts` and its CSP construction are unchanged. Actual before/after policies match after replacing the random nonce with a placeholder. No fixed nonce, `unsafe-eval`, script `unsafe-inline`, unrestricted bypass, authentication change, color/token change or backend change was introduced. Existing `style-src-attr 'unsafe-inline'` remains exactly as before.
- The browser verified fresh nonces after reload, replacement of a forged incoming `x-nonce`, and blocking of both missing-nonce and wrong-nonce parser scripts. The negative check uses an isolated context with service workers blocked solely to guarantee HTML interception; ordinary persistence checks retain normal PWA behavior.
- Reading request headers makes the default `/` layout dynamic. The existing 307 redirect to `/ar` remains; its redirect response does not contain the initializer. Root nonce/fallback behavior is therefore additionally verified at the layout unit boundary.

## Final observed matrix

Chromium `151.0.7922.34`, production standalone build, real HTML/CSP/storage/navigation. Theme scenarios intercept only synthetic guest API responses; no database writes or backend service were required.

| Starting locale | Viewport | Fresh default | Light reload / locale switch | Dark reload / locale switch | Invalid value | Hydration / normal CSP errors |
| --------------- | -------- | ------------- | ---------------------------- | --------------------------- | ------------- | ----------------------------- |
| EN              | 1440×900 | Dark          | Light / Light                | Dark / Dark                 | Dark          | None                          |
| EN              | 390×844  | Dark          | Light / Light                | Dark / Dark                 | Dark          | None                          |
| AR              | 1440×900 | Dark          | Light / Light                | Dark / Dark                 | Dark          | None                          |
| AR              | 390×844  | Dark          | Light / Light                | Dark / Dark                 | Dark          | None                          |

All four cases use native keyboard activation for the theme control and locale link. Light was already active while framework JavaScript was withheld, remained active after hydration, and remained Light in the sampled paint frames through client locale navigation. Screenshots before/after hydration and reload were captured; representative desktop and Arabic mobile captures were inspected. Raw server HTML still has no `data-theme`: the authorized parser script reads browser storage before paint.

## Validation actually run

| Check                                                                                                       | Final result                                                        |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Frozen pnpm install (`pnpm@11.19.0`, Node 24.19.0)                                                          | Passed; no dependency/lock changes                                  |
| Focused nonce/layout/toggle/restoration/projection tests                                                    | Passed within the full suite; focused checkpoints 179/179 and 59/59 |
| Complete frontend unit/contract suite                                                                       | **4,976/4,976**, 150 files                                          |
| Production browser theme/security matrix                                                                    | **4/4**                                                             |
| Production public, locale semantics, brand hydration, locale routing, auth copy and shared shell regression | **23/23**, combined production run **27/27**, no retries/flakes     |
| Prettier check / ESLint `--max-warnings=0` / TypeScript                                                     | All exit 0                                                          |
| Fresh production build after final source correction                                                        | Exit 0                                                              |
| Complete diff and CSP comparison                                                                            | Reviewed; no unintended policy weakening                            |

The four historical E2E failures were not changed: the three account-experience cases were outside the selected regression set, and the known stale mobile locale-selector case was explicitly excluded. New production theme tests exercise mobile locale navigation using the current accessible name. No Firefox/WebKit, backend/database/payment or deployed-production verification is claimed. Synthetic guest 401 console entries and existing jsdom/certificate-fixture warnings are retained in raw logs.

## First failures and corrections

| Attempt                       | First failure                                                                                                      | Correction / final evidence                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline focused tests        | 34 passed, 3 nonce failures                                                                                        | Request nonce wired in both layouts                                                                                                    |
| First corrected focused proof | 107 passed, 2 historical full-source proof failures                                                                | Exact bounded projection for reviewed additions; original hashes retained                                                              |
| First complete suite          | 4,962 passed, 2 root layout hash failures                                                                          | Apply the same bounded projection to the default root                                                                                  |
| Baseline production matrix    | 4 failures, initial theme absent                                                                                   | Preserved as regression-before proof                                                                                                   |
| Nonce-only production matrix  | Desktop client locale navigation lost Light; mobile test taxonomy fixture had an invalid shape                     | Locale layout effect; correct synthetic taxonomy arrays, without changing navigation code                                              |
| First final complete suite    | 4,975 passed, 1 historical seam mutation no longer matched the inserted component                                  | Move the null component outside the old contiguous provider seam; unchanged mutation test passes                                       |
| Negative CSP probe            | DevTools-created scripts did not exercise the intended parser path; then PWA forwarding bypassed page interception | Parser-inserted HTML probe in a fresh worker-blocked context; assert interception and real response policy; 2 scripts blocked per case |
| Broader browser regression    | 21 passed, 2 canonical-origin mismatches (build default 3000, test server 3108)                                    | Set `NEXT_PUBLIC_APP_URL` / `APP_PUBLIC_URL` to the actual test origin, fresh build; 27/27 pass                                        |
| Capture/formatter tooling     | Initial mobile capture locator/fixture attempts and Windows command-wrapper quoting failed                         | Correct capture helper and invoke Prettier directly for paths with parentheses; all first logs retained                                |

## Reproduction and artifacts

From `frontend`, use the frozen lockfile, run `pnpm test`, `pnpm format:check`, `pnpm exec eslint . --max-warnings=0`, and `pnpm typecheck`. Build with `NEXT_PUBLIC_APP_URL=http://localhost:3108` and `APP_PUBLIC_URL=http://localhost:3108`. Copy `public/` contents to `.next/standalone/public/` and `.next/static/` contents to `.next/standalone/.next/static/`, then start `.next/standalone/server.js` with `PORT=3108` and `HOSTNAME=127.0.0.1`. Against that running production server, set `BETCCO_THEME_PRODUCTION=1`, `PLAYWRIGHT_PORT=3108`, `PLAYWRIGHT_BASE_URL=http://localhost:3108` and run `pnpm exec playwright test tests/e2e/public.spec.ts --grep @theme-csp`. Existing Quality CI runs the new matrix in its production public smoke suite.

[Compact actual before/after evidence](evidence.json) records CSP headers, script attributes, storage/theme values, paint/hydration results and blocked scripts. Full first-attempt/final logs, JSON, screenshots and traces are retained in the task output `outputs/UI-ACCEPT-R01/evidence/`; `production-theme-evidence.json` contains all four browser attachments. This evidence supports the scoped remediation only and does not supersede the authoritative design contract or establish final UI acceptance.

Handoff boundary: exactly one **Draft PR**, no Ready transition, no merge, no next acceptance task.
