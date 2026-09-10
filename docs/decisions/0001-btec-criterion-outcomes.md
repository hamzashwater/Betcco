# ADR 0001: criterion-based BTEC outcomes

Date: 2026-09-01

## Status

Accepted for implementation.

## Context

Historical UI and service code contains a general percentage mapping of Pass, Merit and Distinction. That mapping is not an appropriate source of truth for internal BTEC criterion decisions. A quiz percentage is a distinct formative/summative numeric result and must remain separate from a criterion outcome.

## Decision

BETCCO will derive BTEC outcome only from final, versioned criterion decisions and a versioned qualification rule set. A rule set is linked to the relevant qualification/unit version and effective dates. It defines the criteria required for each result label and preserves the evaluated rule version with the final decision.

No generic percentage may grant P, M or D. Numeric quiz scores remain numeric unless a documented qualification-specific mapping is imported and explicitly active.

## Consequences

- Existing APIs require an additive compatibility path and migration rather than an in-place destructive rewrite.
- Assessment, resubmission and internal-verification transitions must be validated server-side and audited.
- BETCCO remains a technical platform and does not claim Pearson accreditation; a centre must configure the applicable specification before using official-like workflows.
