# UI-D01-12 — Improve Teacher course working density

**MOCKED UI-CONTRACT EVIDENCE**

Base: `4a24e9ad6fbea30b182cc02a6dbde8e41ee6a614` (merged #204).
Branch: `fix/ui-d01-12-teacher-authoring-density`.

The authoritative roadmap is the owner-supplied `outputs/UI-DEEP-01-Modernization-Roadmap.md`, heading line 156, fields 158–164. This slice refines the six existing authoring anchors and Teacher practice/review panels. It adds no course lifecycle or formal assessment workflow.

## Implementation and invariant proof

- Existing forms, keys, component positions and mounting remain intact. Scoped opaque working panels and flatter Unit/Aim/Topic/Lesson and submission rows replace selected repeated card containers.
- Details/access/announcements/curriculum/assignments/review keep their original IDs, links, hash listener and initial scroll behavior. Mobile shows the selected section. Native Back and locale URL context remain supported.
- A course-owner refresh error with valid cached data now keeps the editor mounted and shows a factual error. Pending/cold error without data cannot expose the editor. This is a display guard; query options, request semantics and status eligibility are unchanged.
- New copy is exactly two paired EN/AR leaves in `teacherAuthoringPresentation`. Previous catalogue values are retained, including the now-unused old unavailable message for compatibility. No static-copy debt is introduced.
- New CSS uses defined semantic tokens, opaque panels, logical RTL, visible focus and 44px controls. Routine weights remain 400/500/600/700. Existing shared heavy-weight labels are capped inside this workspace only. No shared component or global styling changes.
- Student practice functions and all unrelated statements are byte-protected. UI-D01-11 owners and package/lock files are independently protected. No AI/RAG owner is changed.

`teacher-authoring-contract.test.ts` pins independently captured main source and exact approved presentation hunks. It also compares actual current query/mutation/API/state/effect calls and mechanical JSX attributes against main. Historical source guards retain their old hashes; exact new seams are reversed before their old checks. Missing/altered/duplicate seams fail closed. Old negative tests mutate the previous presentation layer so the mutation actually exists; they are not removed or weakened.

`teacher-authoring.test.tsx` exercises real React Query observers and mutations in both locales: pending/cold error, Draft/Rejected/Published/SubmittedForReview guards, all six local jumps, identity of mounted fields/file inputs, unsaved title/lesson/review retention after a failed cached refresh, sequential multipart uploads with a held first request and failed second request, duplicate prevention while pending, update payload and bodyless review POST, and ordered server validation reasons. Existing curriculum, coursework/deadline and practice tests cover the deeper CRUD/ID/publishing/review contracts.

## Browser provenance

The production Next.js build ran on isolated `localhost:3023`. The user's port 3000 was not changed. All API data is synthetic and intercepted; no production seeds or user files were used.

30 UI-D01-12 scenarios passed: 28 unchanged scenarios in the matrix, plus 2 keyboard/locale cases revalidated after correcting test interaction assumptions. Native anchor focus, keyboard `:focus-visible`, the existing global 1ms reduced-motion rule, and opening the mobile language menu are exercised without production workarounds.

The 176 complete viewport captures cover:

- EN/AR, Light/Dark, 1440×900, 834×1112, 390×844; all six sections.
- Populated Unit/Aim/Topic/Lesson nesting, resource/file controls, assignment deadline extension, coursework submission review and separate formative Aim/Unit practice review.
- Draft, Rejected, Published and locked SubmittedForReview; pending/cold error and successful empty curriculum.
- Cached refresh error with selected cover/lesson files, unsaved fields/review text and unchanged links/order; native hash Back.
- Raw concurrency/upload errors and ordered review validation feedback.
- Keyboard focus, reduced motion, locale query/hash context and 720×450 CSS viewport reflow proxy.

Contact sheets: `canvas-matrix.png`, `authoring-regions.png`, `states-and-retention.png`. `manifest.json` records every successful scenario, capture dimensions/SHA-256, sheet hashes and tested source hashes. Full unmodified captures and logs are retained in the task workspace `outputs/UI-D01-12/`; only the three sheets and manifest are committed.

Reproduce with a production build/server on an unused port, then:

```powershell
$env:PLAYWRIGHT_PORT = '3023'
pnpm exec playwright test tests/e2e/teacher-authoring.spec.ts
```

Relevant browser regressions are `teacher-workload.spec.ts`, `formative-practice-clarity.spec.ts`, and `teacher-assignments-review-translation.spec.ts`. Actual final test/check results are recorded in the Draft PR handoff; no older head's CI is claimed.

## Limits

This proves the rendered frontend contract only. It does not prove backend persistence, authorization, payments, entitlement, database behavior, deployment or whole-site WCAG compliance. The reflow case is a CSS viewport proxy, not native browser zoom. Local hash/Back and cached refresh preserve unsaved state; full locale navigation preserves URL context without introducing cross-reload draft storage. Existing child-query error behavior and existing authoring eligibility remain unchanged. No inferred formal grade, count, priority or workflow success is introduced.
