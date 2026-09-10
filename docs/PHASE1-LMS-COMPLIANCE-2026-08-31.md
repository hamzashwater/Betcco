# BETCCO Phase 1 LMS compliance audit — 2026-08-31

This audit maps the requested BTEC-first LMS Phase 1 to the existing BETCCO implementation. It is an implementation inventory, not a claim that an unconfigured external provider is live.

## Implemented core workflow

`Specialization → Course → Unit → Learning Aim → Topic → Lesson → Activity/Quiz/Assignment → Criterion → Evidence → Teacher feedback → resubmission → verified result`

| Requirement group | Existing BETCCO implementation |
| --- | --- |
| Authoring hierarchy | `Course`, `CourseModule` (unit), `BtecLearningAim`, `BtecTopic`, `Lesson`, lesson resources, activities, quizzes and assignments; teacher course editor and administrator approval workflow. |
| Publication lifecycle | Course and authored content support Draft, Published, Archived and Scheduled states. The content-access service checks publication and release rules before learner access. |
| BTEC assessment | Unit codes, hours, credits and levels; flexible learning aims; P/M/D criterion codes; criterion-level evidence and result records; server-side calculated awards. |
| Student learning record | Student course gradebook and progress screens show lesson progress, task and quiz state, criteria, feedback, submissions, certificates and predicted result derived on the server. |
| Assignment/submission workflow | Assignment settings, briefs, criteria, resources, text/file submissions, private uploads, attempt history, teacher feedback, revisions and finalisation. Prior attempts remain preserved. |
| File safety | Private opaque storage through an authorized endpoint; type/extension/size validation, scan/quarantine abstraction, non-public file keys and ownership/enrollment checks. |
| Quiz engine | Single choice, multiple choice, true/false, short answer, fill-in-blank, matching, ordering, essay, image and code questions; manual review for essay/code; time/attempt/randomisation/visibility settings. Code answers are text only and are never executed by the server. |
| Gradebooks | Student-only, teacher-course and central-admin gradebooks use DTOs, pagination and server-side filtering/calculation. |
| Notifications/email | In-app notification centre, deadline notifications and email abstraction for enrolment, submissions, feedback, resubmission and certificates. |
| Analytics | Student learning dashboard, teacher analytics including at-risk learners, and admin analytics/trend and gradebook reports. |
| Certificates | Server-issued unique completion certificates, printable learner document, QR and public verification route with limited disclosure. |
| Security | Identity cookies, role policies, antiforgery, session/device controls, audit logs, rate limits, Problem Details and private file authorization. |

## Recently hardened in this increment

- Student self-service profile and marketing-consent settings are owner-scoped and audited.
- Students can see only their own purchase history, calculated from persisted payment records.
- Support messages are owner/admin scoped; administrators can process, resolve and close tickets, with notifications and audit events.
- Development payment completion is no longer an open fake webhook. It is restricted to a signed-in student confirming only their own fake payment, protected by CSRF and rate limiting, and it is absent outside Development. Production needs a provider webhook or server-to-server verification.
- The empty package state links to the real course catalog instead of creating a dead end.

## Intentionally not represented as complete integrations

| Capability | Current safe state |
| --- | --- |
| Real card/bank/e-wallet collection | Provider abstraction exists. Production checkout remains unavailable until a configured provider adapter performs verified webhook or server-to-server confirmation. |
| Real payouts | Provider abstraction exists. Development uses a non-transfer fake adapter; real bank/e-wallet transfer credentials and contracts are required. |
| Managed Zoom/Meet/Jitsi creation | Link/provider abstraction exists. BETCCO does not create meetings without the configured provider adapter and credentials. |
| AI assistance | Course-scoped provider abstraction exists; it reports unavailable safely unless a real provider is enabled and configured. |
| SMS/push/WhatsApp | Deferred pending provider contracts, consent design and configured credentials. |

## Latest verification

- Backend: formatter and build passed; 3 unit tests and 49 integration tests passed.
- Frontend: Prettier, ESLint, strict TypeScript, Vitest (5 tests), and production build passed.
- End-to-end: 6/6 local Playwright flows passed, including student registration, confirmation, session switch, checkout, verified Development payment completion, enrollment and course progress.
