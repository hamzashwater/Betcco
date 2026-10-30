# Slice11 mobile course-label recovery

**Confirmed cause:** package course checkbox labels inherited line-height smaller than their rendered text fragments. All four original cases were reproduced at390x844 on the preserved production build before a production edit. The original containment assertion remains unchanged.

| Cases | Font size | Before line height | Text fragment height | Before first row | After line height | After first row |
| --- | --- | --- | --- | --- | --- | --- |
| EN light/dark |14px |21px |29px |44px |31.5px |63px |
| AR light/dark |15px |22.5px |32px |45px |33.75px |67.5px |

The specific elements are label.toggle within the package fieldset's courseList, with native checkbox children and bilingual text. Display:flex, align-items:center, min-width:auto, input flex-shrink:0, normal whitespace and overflow-wrap:anywhere all remain recorded. The course list's grid already uses content-sized rows. The document, label and input widths fit; scrollWidth and clientWidth are390. This is vertical line-box/font-metric overflow rather than a fixed grid column, unbreakable width, RTL placement, native select or breakpoint failure. Text fragment rectangles describe the browser's text metrics, not a claimed per-glyph ink raster measurement.

Only the scoped private rule `.courseList .toggle { line-height: 2.25; }` was added. The computed advances now exceed the measured font fragment heights; all original14 rows in every case are contained at390 and1440. No font, size, text, markup, payload, attendance logic, global style, clipping, truncation or control was changed. The unitless line height scales with each locale's existing font size.

This explanation is consistent with the CSS line-height model: font metrics can exceed a line box, and negative leading can let content extend into adjoining lines. The project-specific cause is established by the recorded before/after geometry and the unchanged assertions, rather than assumed from the specification. [W3C CSS2 line-height calculations](https://www.w3.org/TR/CSS2/visudet.html#line-height).

## Verification completed so far

- Original four:4/4 passed after one correction, with identical fixtures, expected counts, payload/keyboard checks and text-containment tolerance.
- Narrow unbroken English/Arabic:4/4 cases across320/360/390/834/1440; full accessible names retained, native Space toggling and focus, >=44px labels, no checkbox/text intersection or horizontal viewport overflow.
- Focused Content Studio including attendance EN/AR:692/692 passed.
- Full regression commands are recorded separately; do not infer their result from earlier runs.

All browser evidence is **MOCKED UI-CONTRACT EVIDENCE**: Chromium and synthetic intercepted HTTP. It does not establish live persistence, auth, provider integration, deployment or complete WCAG. Actual computed incumbent stacks are recorded in JSON; no unverified Inter/IBM font-loading claim is made.
