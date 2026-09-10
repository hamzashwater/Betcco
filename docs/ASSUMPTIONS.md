# Assumptions

- BETCCO is an independent educational platform; it has no implied Pearson or BTEC affiliation.
- Arabic is the default locale and English is supported equally. Default display timezone is Asia/Amman.
- JOD is the default currency. Tax is zero until an administrator configures a jurisdictional tax policy.
- Checkout accepts one coupon and does not stack coupons in V1.
- Stripe Test is the reference production-style gateway, but no Stripe adapter is implemented yet. Fake payment is selected only for Development and Test; its owner-scoped, antiforgery-protected confirmation is not a provider webhook. Production safely rejects checkout until a verified provider adapter exists.
- Development storage is private local disk; production storage is S3-compatible private storage. No uploaded file is public by default.
- AI is disabled until a provider and key are configured. Its absence must not block learning.
- Node.js LTS 22+ is required for frontend verification; the repository does not vendor Node.js.
