# BETCCO

BETCCO is an Arabic-first educational platform focused on BTEC learners. It combines course discovery, secure enrollment, learning progress, assessments, BTEC evaluation workflows, and role-based operations for students, teachers, and administrators. BETCCO is independent and does not claim official affiliation with Pearson or BTEC.

## Prerequisites

- Node.js 22+ and pnpm 11+
- .NET SDK 10
- Docker Desktop

## Start locally

1. Copy `.env.example` to `.env` and set non-default local passwords.
2. Run `docker compose up -d postgres minio minio-init mailpit`.
3. Run `dotnet tool restore` then `./scripts/update-database.ps1`.
4. Run `./scripts/start-api.ps1` (the script loads only the current shell's ignored `.env` values; the local API listens on `http://localhost:5085`).
5. In `frontend`, run `pnpm install` then `pnpm dev`.
6. Open `http://localhost:3000/ar`.

On Windows PowerShell, if `pnpm` is blocked by the execution policy, use the installed Node command directly:

```powershell
& "C:\Program Files\nodejs\npx.cmd" --yes pnpm@11.19.0 --dir .\frontend install
& "C:\Program Files\nodejs\npx.cmd" --yes pnpm@11.19.0 --dir .\frontend dev
```

The optional first Admin is created only when both `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are set before the API starts. No default administrator account exists.

## Development integrations

- Mail delivery uses SMTP; the development defaults target Mailpit at `http://localhost:8025`.
- Assignment submissions, teacher feedback/resubmission requests, and newly issued completion certificates use the platform email-notification adapter after their server-side state has been saved. If SMTP is unavailable, the event is logged without personal content and the learning workflow continues; production SMTP configuration requires `Email__Host`, `Email__Port`, `Email__UseSsl`, `Email__Username`, `Email__Password`, and `Email__FromAddress` as applicable.
- Teachers and administrators can enable standard authenticator-app two-factor authentication from **Account security**. No external API key is needed. Every new login is recorded as a server-side active session, and the account owner can end one device session or sign out every device.
- The fake payment adapter is selected only in Development/Test. Its signed-in, antiforgery-protected development confirmation can only finalize that student's own fake payment; a redirect never confirms payment.
- Checkout exposes card, bank-transfer, and e-wallet options through the payment-provider abstraction. In Development/Test, each is a safe local test method and requires an explicit development confirmation before a course enrollment or evaluation is confirmed. Production requires a verified provider webhook or server-to-server verification.
- A confirmed course sale is accounted for server-side. The default split is 30% to the BETCCO platform wallet and 70% to the publishing teacher wallet, but an administrator can change the split for future payments. `SalesTaxPercent` is also an administrator-controlled server setting, seeded at `0` until a jurisdiction-specific legal/accounting decision is made; tax is stored separately from teacher/platform revenue. Teachers can request a bank-transfer or e-wallet withdrawal; administrators approve/reject it and may execute it only through the configured payout adapter. Payout destinations are encrypted at rest and masked in the admin interface.
- A Stripe adapter is not implemented yet. `Stripe__SecretKey` and `Stripe__WebhookSecret` are documented integration contracts only; production checkout safely refuses to create a payment until a verified provider adapter is supplied.
- Payout adapters are not implemented yet. `Payouts__BankApiKey` and `Payouts__EWalletApiKey` are documented integration contracts only; production payout execution safely refuses until a verified bank or wallet adapter is supplied.
- Development/Test accepts uploads through a test scanner. In Production, uploads are rejected until `Storage__ScannerProvider=ClamAv`, `ClamAv__Host`, and `ClamAv__Port` are configured; the ClamAV adapter scans the upload before private storage accepts it.
- Development uses private local disk by default. Set `Storage__Provider=S3Compatible` with the documented `Storage__S3__*` values to use the private MinIO bucket. Production rejects local storage, checks the configured bucket during startup, and never falls back to node-local disk.
- Private uploads use a staging object, commit their database reference with a durable lifecycle record, and then promote the object. A storage-scoped worker retries promotions/deletions and removes old staging objects that have no committed lifecycle record.
- Production Data Protection uses `DataProtection__Provider=Postgres` so API replicas share key material. The keys must be encrypted with a mounted PFX configured through `DataProtection__CertificatePath` and the secret `DataProtection__CertificatePassword`; development may keep filesystem-backed keys.
- A teacher can upload an MP4 or WEBM lesson video (up to 500MB) from the course editor. The platform keeps the source private and streams it only to the teacher or an enrolled, entitled learner; this direct multipart implementation is for normal lesson-video sizes. Use a reviewed private object-storage/resumable-upload adapter before supporting larger production uploads.
- AI stays disabled until `Ai__Enabled=true`, `Ai__Provider=OpenAI`, `Ai__ApiKey`, and `Ai__Model` are supplied. When configured, the server-side OpenAI Responses adapter sends only bounded published course/lesson text; it never sends private uploads, payment details, or student profile data. Configure `Ai__BaseUrl` only for a reviewed compatible endpoint.
- The installable PWA caches only public static assets and an offline notice. It deliberately never caches private API responses, course files, payments, or authenticated learning content.
- `NEXT_PUBLIC_ANALYTICS_ENDPOINT` is optional. No analytics request is made until a visitor has explicitly opted into analytics cookies; the configured endpoint must be privacy-reviewed before production use.
- OneRoster is an optional school-interoperability boundary. Set `SchoolIntegration__Provider=OneRoster`, the endpoint, and a scoped token to enable the admin-only connection test. It never imports a roster automatically; approve the school data-mapping design before adding any sync workflow.
- `BETCCO_NEXT_DIST_DIR` is optional. It overrides the Next.js output folder for isolated CI or OneDrive-safe verification builds; without it, Next uses `.next` normally.

## Legal package before production

- BETCCO includes versioned Arabic-first legal documents at `/ar/terms`, `/ar/privacy`, `/ar/refunds`, `/ar/copyright`, `/ar/student-agreement`, `/ar/teacher-agreement`, `/ar/minors`, `/ar/cookies`, `/ar/complaints`, `/ar/privacy-center`, and `/ar/security`.
- Registration records the accepted Terms and Privacy Policy versions, country, phone, gender, date of birth, and optional marketing consent separately. Each explicit grant or withdrawal of marketing consent is stored as a versioned audit record; self-registration is restricted to learners aged 18 or older until a verified parent/guardian-consent workflow is implemented. Non-essential cookie choices are not preselected and no analytics or marketing tracker is enabled by default.
- Before public launch, an authorised Jordanian lawyer should review the documents and the owner must replace `*.example.test` contact emails, the registration number, address, and payment-provider details through the site settings API/admin CMS.

## Quality commands

```bash
cd frontend
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build

dotnet format backend/Betcco.sln --verify-no-changes
dotnet build backend/Betcco.sln
dotnet test backend/Betcco.sln --no-build
docker compose config
```
