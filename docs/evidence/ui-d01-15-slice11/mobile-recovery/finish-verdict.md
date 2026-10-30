## verdict

1. **Resolved — sole material fix from `../recovery/finish-review.md`: package course-label collision.** The new 390px EN/AR light/dark originals visibly separate the bilingual course names and price lines that previously collided; courses 10–12 in EN and the repeated AR currency/name lines now occupy their own rows. The four 1440px desktop originals preserve separated course choices, the bounded list and surrounding form/record layout. The eight additional 320px/834px originals show long unbroken Arabic/English names wrapping without text/checkbox collision and retain visible checkbox focus. This closes the listed responsive package-composition finding; no new defect hunt was performed.

All 16 required AFTER originals were inspected at original resolution, rather than inferred from the parent's account. Each exists, is readable, shows the document top and claimed package state, and has no missing/black/blank render region. Exact filenames were confirmed against each case's `scenario.json`. Paths below are relative to this mobile-recovery directory:

- `exact-cases/{en-light,en-dark,ar-light,ar-dark}/02-packages-create-many-courses-mobile.png` — four 390px originals.
- `exact-cases/{en-light,en-dark,ar-light,ar-dark}/08-packages-many-courses-desktop.png` — four 1440px originals.
- `narrow-cases/{en-light,en-dark,ar-light,ar-dark}/unbroken-course-320.png` — four 320px originals.
- `narrow-cases/{en-light,en-dark,ar-light,ar-dark}/unbroken-course-834.png` — four 834px originals.

Supporting retained evidence agrees with the visible correction. `before-summary.json` records the four reproduced 390px cases with inherited line heights of 21px EN / 22.5px AR against measured text-fragment heights of 29px / 32px and first-row heights of 44px / 45px. The AFTER `exact-cases/{case}/course-layout-mobile.json` files record line heights of 31.5px / 33.75px and first-row heights of 63px / 67.5px. A read-only calculation over all 14 rows in each of the eight mobile/desktop metric files found zero text fragments outside their own row and zero intersections with the checkbox; document scroll width equals 390px or 1440px respectively. This is 112 measured rows across eight datasets, not 112 distinct courses.

Each `narrow-cases/{case}/scenario.json` supplies measurements at 320, 360, 390, 834 and 1440px, with zero reported `outside` and `hitsInput` rows and an empty page-error list. Long text remains in the scrolling course list; its viewport-edge clipping is ordinary internal scrolling, not truncation of the course name. The inspected CSS scopes `line-height: 2.25` to `.courseList .toggle` at `frontend/src/features/admin/content-studio.module.css:208`; existing content-sized grid rows and the bounded scroller remain. `exact-four.json`/`exact-four.log` and `narrow-stress.json`/`narrow-stress.log` retain successful command exits and 4/4 results in each run. These are recorded runs, not reviewer reruns.

Fix-induced regressions visible in the inspected package-composition region: none.

## remaining

Clear for the one scored fix. **This ship disposition covers the scored fix only, not the whole surface.** The original five-section review is preserved verbatim. No browser, detector, production source edit, new design work or unrelated verification occurred in this verdict pass. Full-suite, scope-audit, publication and CI gates remain the parent's separate responsibility and are not approved by this report.

**MOCKED UI-CONTRACT EVIDENCE:** synthetic intercepted HTTP in Chromium. No live persistence, authorization, deployment, payment, external-provider or complete WCAG claim follows.

disposition: ship
