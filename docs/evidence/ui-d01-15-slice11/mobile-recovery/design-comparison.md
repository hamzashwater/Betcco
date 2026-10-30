# Slice 11 mobile recovery — incumbent design comparison

The finished recovery preserves the incumbent Content Studio extension. The only production change since the protected checkpoint is `line-height: 2.25` on the private `.courseList .toggle` selector. The finish reviewer returned **ship for the sole scored course-label collision fix**; this is not whole-surface approval. No global system documentation or configuration was created or changed.

## Five-line system summary

- **Palette:** existing BETCCO semantic panel/inset, text, border, selection, action and focus roles remain; no color token was added or changed.
- **Type ramp:** existing page, section, item, body and label size roles and 400–700 weights remain; computed course labels retain the Tajawal/Noto Sans Arabic/Segoe UI stack at 14px EN and 15px AR.
- **Controls:** native labeled checkboxes, 44px minimum label/control targets, nonshrinking checkbox dimensions and the 3px semantic focus outline remain.
- **Responsive layout:** five persistent sections, focused editor plus records, logical RTL/LTR spacing, the bounded course scroller, and existing 1100px/600px layout changes remain.
- **Named contracts:** semantic surface/foreground pairings and native control behavior are preserved; the measured course-label line-height exception stays private and is not a shared typography rule.

## Source comparison

The [direction](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/direction.md) requests Operate mode, incumbent semantic surfaces, compact functional navigation, editor/records composition and a divided attendance ledger. The [ContentStudio component](C:/Dev/Betcco-UI-D01-15-ContentStudio/frontend/src/features/admin/content-studio.tsx) retains its five section buttons and the package fieldset structure: each complete Arabic title, English title and localized price stays inside its native checkbox label. The TSX and both message catalogues are byte-identical to [before-inventory.json](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/mobile-recovery/before-inventory.json).

The [private stylesheet](C:/Dev/Betcco-UI-D01-15-ContentStudio/frontend/src/features/admin/content-studio.module.css) still consumes existing tokens from [globals.css](C:/Dev/Betcco-UI-D01-15-ContentStudio/frontend/src/app/globals.css) and [brand-tokens.css](C:/Dev/Betcco-UI-D01-15-ContentStudio/frontend/src/app/brand-tokens.css). Panels remain flat bordered surfaces, with existing 12px panel/navigation and 8px control corners. Page, section, item and body typography retain their existing size/line roles; labels retain their existing size and weight. No imagery, motion, new breakpoint, font declaration or shared primitive was introduced.

The course list retains `grid-auto-rows: max-content`, a 20rem maximum height, vertical scrolling and natural text wrapping. The surrounding editor/records grid still becomes one column at 1100px; existing mobile padding/navigation and attendance stacking rules remain at 600px. A comparison against the CSS in the protected ZIP confirms the added three-line selector block is the complete private CSS delta.

## Evidence for the private exception

The [before summary](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/mobile-recovery/before-summary.json) and [failure history](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/mobile-recovery/failure-history.md) identify a vertical line-box failure in package course labels, reproduced in all four 390×844 EN/AR light/dark cases. Viewport scroll width already equaled client width; horizontal shrinking, native selects and RTL placement were not the demonstrated cause.

| Course-label measurement | EN | AR |
| --- | ---: | ---: |
| Retained font size | 14px | 15px |
| Before inherited line height | 21px | 22.5px |
| Measured text-fragment height | 29px | 32px |
| After private line height | 31.5px | 33.75px |
| First mobile row height, before → after | 44px → 63px | 45px → 67.5px |

Checked all eight `exact-cases/{en-light,en-dark,ar-light,ar-dark}/course-layout-{mobile,desktop}.json` datasets: every original set contains 14 rows, no text fragment falls outside its own row, no fragment intersects the checkbox, and document widths remain 390px/1440px. These are 112 measured rows across eight datasets, not 112 distinct courses. Geometry was checked with the retained 1px tolerance. The exact-case scenario metadata retains the complete names, 14 returned courses and the expected selected-course package payload.

Checked all four narrow-case scenario files: each covers 320/360/390/834/1440px, retains the long unbroken bilingual names, reports zero `outside`/`hitsInput` rows, has a minimum label height of 44px and no page errors. The [browser test source](C:/Dev/Betcco-UI-D01-15-ContentStudio/frontend/tests/e2e/content-studio-archetype.spec.ts) retains all original lines, including text-containment, payload and keyboard assertions; the recovery adds evidence collection and narrow stress coverage. The narrow test checks native Space toggling, focus, complete accessible names and viewport overflow. Recorded [exact-four](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/mobile-recovery/exact-four.json) and [narrow-stress](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/mobile-recovery/narrow-stress.json) runs each pass 4/4 with exit 0. These were not rerun by this documenter.

The [finish verdict](C:/Users/user/Documents/Codex/2026-10-26/files-pasted-by-the-user-task/outputs/slice11/mobile-recovery/finish-verdict.md) records the reviewer's inspection of 16 original-resolution mobile, desktop, 320px and 834px screenshots. It resolves only the listed package-composition collision and reports no visible regression in that inspected region. This comparison checked retained source and measurement evidence; it did not open a browser or begin another defect hunt.

## Preserved system state, drift and limits

`PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json` and `.impeccable/design.json` are absent at both repository and frontend roots. Their absence is preserved. No new world, system change, qualitative interview, comp or global token specification was authorized or needed for this ordinary extension. The shipped documenter definition and full `reference/document.md` were loaded; the ordinary-extension instruction in `reference/new-work.md` governs this comparison.

**Not canonized or repaired:** the direction names Inter/IBM Plex Sans Arabic, and the incumbent token source defines those opt-in families, but the affected labels' computed CSS remains Tajawal/Noto Sans Arabic/Segoe UI. A computed family stack does not prove which individual font file rendered each glyph. This pre-existing direction/implementation drift was reported without claiming Inter/IBM loaded or changing fonts. The value 2.25 is a narrowly evidenced course-list correction, not a recommendation for shared body/label typography.

**MOCKED UI-CONTRACT EVIDENCE:** synthetic intercepted HTTP in Chromium. This report does not establish live persistence, authorization, external-provider behavior, deployment or complete WCAG compliance. Full frontend/browser/regression gates, backend verification, publication and CI are separate responsibilities; no final outcome for those gates is inferred here. No production, backend, dependency, CI, previous-owner or attendance transport file was edited by the documenter.

Only this comparison report was written.
