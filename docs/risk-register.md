# BETCCO risk register

Updated: 2026-09-02

| ID | Severity | Risk | Current control | Required action | Owner decision required |
| --- | --- | --- | --- | --- | --- |
| R-001 | Critical | Repository has no initial commit or remote backup | `.gitignore` excludes local environment files | Create reviewed initial commit and protected remote backup | Yes, before commit/push |
| R-002 | Critical | Production payments or payouts could be misrepresented | Production provider is intentionally unconfigured | Implement only verified adapter/webhook after provider selection | Yes |
| R-003 | Critical | Historical BTEC percentage mapping can issue misleading academic outcomes | Versioned rule sets, a source-backed qualification-version registry, and immutable request/submission snapshots now derive outcomes by criterion decisions; Lead IV sampling is rationale-based and independently assigned per attempt; appeal decisions are independently reviewed and cannot silently alter a grade | Enter and academically approve the applicable centre qualification/version and rules before operational use; define the sampling coverage policy and the reassessment action that follows an upheld appeal | Qualification/specification and centre policy needed |
| R-004 | High | Local private storage cannot provide durable production media delivery | Files are private and scanner fails closed in production | Add object storage/upload lifecycle and recovery plan | Storage/CDN choice needed |
| R-005 | High | No release pipeline, backup drill or production monitoring | Local Docker stack and health endpoints | Add CI, production images, runbooks, backup/restore and observability | Hosting/RPO/RTO needed |
| R-006 | High | Legal placeholders and policy decisions can be incomplete | Versioned legal CMS documents, append-only marketing-consent evidence, human-reviewed privacy-rights queue, and a restricted incident/deadline register that requires human legal confirmation | Configure legal entity/contact details, retention schedule, incident-response ownership, and obtain Jordan legal review | Yes |
| R-007 | High | Frontend text is not consistently centralised | `next-intl` exists | Migrate incrementally to typed translation keys and enforce checks | No |
| R-008 | Medium | Large frontend feature files raise regression risk | Lint/typecheck/test baseline | Split only when touching a vertical slice; retain behavior with tests | No |
| R-009 | Medium | AI could be unsafe or costly if enabled without policy | Disabled by default, bounded course text | Add policy modes, quotas, audit/redaction and evaluation before launch | AI policy needed |
| R-010 | Medium | Guardian workflow is unavailable while minors are restricted | Registration currently restricts self-service to adults | Implement consented guardian workflow before supporting minors | Legal policy needed |
