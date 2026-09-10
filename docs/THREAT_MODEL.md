# BETCCO threat model

| Threat | Mitigation |
|---|---|
| Account takeover/brute force | Identity lockout, confirmed email, secure cookies, password policy, rate limits, optional authenticator-app 2FA, audited active sessions, and session invalidation |
| Broken access control/IDOR | Policy and ownership checks on every protected API and file endpoint; 401/403 tests |
| Teacher self-registration | Only Student registration exists; teacher accounts require an Admin invitation |
| Price or discount tampering | Client sends identifiers only; checkout recalculates all commercial values from PostgreSQL |
| Forged/replayed payment success | Production accepts only provider webhook/server verification, with provider-event uniqueness and idempotency keys. Development confirmation is owner-scoped, authenticated, antiforgery-protected, rate-limited, and unavailable in production. |
| File leakage/malware/path traversal | Private opaque storage keys, allowlist, size/type checks, quarantine/scanning adapter, protected download |
| Stored XSS | Structured CMS fields, sanitization boundary, CSP, and no untrusted HTML rendering |
| CSRF/CORS abuse | Same-origin proxy, antiforgery header, cookie SameSite, allowlisted origins only |
| Device sharing | Protected random device cookie, hash-only storage, active binding uniqueness, audited Admin reset |
| AI cross-course leakage | Enrollment check before retrieval, course-scoped chunks, disabled fallback without a configured provider |

Audit logs do not include passwords, raw tokens, full payment data, uploaded file contents, or complete sensitive AI prompts.
