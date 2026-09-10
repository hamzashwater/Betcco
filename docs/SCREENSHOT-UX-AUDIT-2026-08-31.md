# BETCCO screenshot UX audit — 2026-08-31

## Scope

Twenty-six reference screenshots were reviewed as **feature and interaction references only**. BETCCO does not copy their brand, text, imagery, visual system, or business model. The comparison is limited to identifying discoverability and workflow gaps appropriate to BETCCO's educational platform.

## Findings and decisions

| Reference pattern | BETCCO decision | Status |
| --- | --- | --- |
| Prominent course/package discovery | Keep BETCCO's real catalog and memberships, make `Packages` visible in the public navigation without crowding smaller desktop widths, and route an empty packages state to the live course catalog. | Implemented |
| Account details and communication preferences | Add an authenticated self-service account screen for name, optional phone, independent marketing consent, memberships and security link. Email remains read-only to preserve verification. | Implemented |
| Payment/order history | Add a student-only, server-paginated purchase history using recorded payment totals and statuses. No client-side success URL is treated as proof of payment. | Implemented |
| Support inbox and message threads | Add an authenticated support centre: a student sees only their own tickets; an admin sees the inbox, replies, manages status, and all changes are audited. | Implemented |
| Support updates | Notify the ticket owner when an admin replies or changes a ticket status. | Implemented |
| Student learning dashboard | Keep the existing enrolled-course, task, quiz, evaluation and progress workflows; they are already BETCCO-specific and backed by the API. | Existing |
| Reviews, complaints, contact and about pages | Keep the existing BETCCO flows rather than duplicate unrelated forms. | Existing |
| Physical addresses, shipping, bank account linking | Excluded: BETCCO is a digital-learning platform; these functions are not justified by the product model. | Intentionally excluded |
| Cashback, loyalty credits, referral rewards and marketing chat apps | Deferred until product policy, terms, fraud controls, accounting treatment and provider contracts are approved. | Deferred |

## Security boundaries preserved

- Ticket lists and conversations enforce owner/admin access on the server; the UI is not the security boundary.
- Profile updates affect only the authenticated account and are audited.
- Purchase history filters by the authenticated payment owner and returns DTO-shaped transaction data only.
- All new mutable routes inherit antiforgery validation and authentication; ticket status control is additionally restricted to the `Admin` role.
- Payment amounts, statuses and course access continue to be server-owned.
- The Development/Test payment adapter is now limited to an authenticated student's own fake payment, protected by antiforgery and rate limiting; it is not a production webhook and is unavailable outside Development.

## Verification for this increment

- Backend formatter, build and tests: passed (3 unit tests, 49 integration tests).
- Frontend formatter, lint, type check, tests and production build are run before hand-off for this increment.
- Playwright end-to-end verification against the local API and PostgreSQL: 6/6 passed, including registration, email confirmation, logout/login without refresh, checkout, owner-scoped Development confirmation, enrollment and the first learning action.
- Live local UI inspection: public navigation exposes packages, the home page has no browser-console errors, and tested 375px and 768px viewports have no document-level horizontal overflow. A guest request for a protected student account route redirected to the sign-in screen.
- Payment security smoke check: an unauthenticated request to the Development-only confirmation route returned `401`; API readiness returned `200`.
