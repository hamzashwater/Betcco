# ADR 0002: external production providers fail closed

Date: 2026-09-01

## Status

Accepted.

## Decision

Payment, payout, antivirus, object-storage, email, AI and external educational integrations may be implemented behind interfaces, configuration validation and feature flags. They are disabled or fail closed in Production until credentials, contracts and operational ownership are configured by the platform owner.

## Rationale

Choosing a payment, payout, tax, storage or AI provider requires commercial, legal and security decisions that cannot safely be inferred from source code. A fake or demo provider must never complete a real production transaction.

## Consequences

- Documentation names required environment variables but never stores values.
- Health checks distinguish a process being live from a production feature being configured.
- The application shows an administrative configuration problem instead of simulating success.
