# BETCCO architecture

## Runtime topology

Next.js renders the bilingual web application and proxies `/api` and `/hubs` to ASP.NET Core so browser requests remain same-origin. ASP.NET Core owns Identity cookies, business rules, PostgreSQL access, payments, authorization, and private-file delivery. PostgreSQL is the system of record; MinIO/S3-compatible storage holds opaque private blobs only.

## Layers

- `Betcco.Domain`: entities, state enums, and workflow policies.
- `Betcco.Application`: commands, read models, and contracts for storage, email, payment/video/AI integrations.
- `Betcco.Infrastructure`: EF Core, Identity, seed, storage, and concrete application services.
- `Betcco.Api`: HTTP routes, middleware, problem details, policy enforcement, and OpenAPI.

## Critical flows

- Authentication uses Identity cookies plus an antiforgery header. Only students register directly; administrators invite teachers. Student device cookies contain protected random identifiers and only hashes persist.
- Cart input contains reference IDs. Checkout recalculates every price on the server, records an idempotency key, and creates a `Payment` in `Processing`.
- A payment success redirect is informational only. A signed real provider webhook or server-to-server verification changes a production payment to `Paid` transactionally and creates enrollments. The Development-only fake adapter uses an authenticated, antiforgery-protected confirmation limited to the payment owner; it is not a real provider webhook and is not available in production.
- Uploads are validated and scanned before storage, then written under an opaque staging key. The database reference and a durable finalization record commit together before the object is promoted. A storage-scoped worker retries finalization/deletion and removes unreferenced staging objects after a grace period.
- `IFileStorage` selects private local disk for development/tests or a private S3-compatible bucket for production. Both adapters implement staged writes, authenticated server-streamed reads, existence checks, idempotent deletion, and path/key validation. Existing local `yyyy/MM/{opaque-id}` keys remain readable.
- Production rejects node-local storage and checks the S3-compatible bucket at startup. It emits no public or permanent object URLs; controllers retain the existing owner, enrollment, teacher, assessor, verifier, and privacy authorization checks before streaming content.
- Development Data Protection keys may use a local private directory. Production persists them in PostgreSQL for replica sharing and requires certificate encryption so key material survives replica recreation without being stored as plaintext XML.
- AI access first checks enrollment and course scope, then retrieves only authorized knowledge chunks. The disabled adapter returns an explicit unavailable state.
