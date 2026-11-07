# ADR 0017: Private Trust evidence intake

- Status: proposed
- Date: 2026-11-06

## Context

The delivery plan places Trust evidence, verification, moderation, disputes, and risk signals in the Days 31–60 core opportunity workflow. The product policy distinguishes account ownership, identity verification, organization verification, professional qualifications, demonstrated capability, and platform history. A generic verified badge would collapse materially different claims.

## Decision

Introduce an account-owned `trust_evidence` intake table for identity, qualification, capability, and work-history claims. Require the submitting account to equal the subject account. Apply forced RLS, allow account-scoped reads and self-submission only, and grant the runtime role SELECT and INSERT without UPDATE or DELETE. An optional organization association is constrained to the active tenant context.

Persist only an opaque private object-storage locator, never evidence bytes or bearer/signed URLs. Records are private and are not exposed through public APIs or badges.

## Consequences

This creates a narrow persistence boundary for future Trust workflows without implying verification. An append-only `trust_evidence_decisions` history table is introduced with forced RLS and subject-scoped reads; the runtime role receives SELECT only. A database trigger also blocks self-review and decisions by inactive reviewer accounts. Runtime reviewer writes, evidence status transitions, transactional audit events, issuer validation, appeals, storage integration, scanning, retention, and API routes remain deferred. Status mutation must not be enabled until reviewer authorization and same-transaction audit controls are implemented and tested.
