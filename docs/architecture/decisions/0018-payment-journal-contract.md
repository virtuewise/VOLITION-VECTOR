# ADR 0018: Provider-neutral double-entry journal input contract

- Status: Proposed
- Date: 2026-11-06

## Context

The Days 31–60 delivery sequence calls for payment sandbox and ledger tests. Payment providers and launch jurisdictions have not been selected. The platform must establish accounting invariants without prematurely coupling the domain to a provider or implying custody authorization.

## Decision

- Define a provider-neutral journal entry draft in `@volition/payments-sdk`.
- Require a stable idempotency key, a typed source reference, an uppercase three-letter currency code, and at least two journal lines.
- Represent monetary values as positive safe integer minor units, never floating-point major-unit amounts.
- Require at least one debit and one credit and exact equality of debit and credit totals.
- Validate totals using integer `bigint` accumulation to avoid intermediate numeric overflow.
- Expose a pure validator and unit tests; persistence must later enforce unique idempotency keys and atomic journal insertion in PostgreSQL.

## Boundaries and deferred work

This is only a pure validation contract. It is not a persisted ledger, authorization model, payment provider adapter, sandbox integration, reconciliation engine, payout workflow or funds-custody capability. No raw card data, CVV, bank credentials, provider secrets or payment tokens belong in journal entries. Provider webhook signature verification and idempotent processing remain mandatory before accepting external events.

A later database increment must provide append-only journal persistence, account/tenant scoping, database-level balance enforcement, immutable entries, unique idempotency constraints, audit/outbox atomicity and PostgreSQL integration tests. Provider and country selection require separate legal, KYC/AML, PCI and safeguarding review.

## Validation

Unit tests cover balanced single- and multi-line entries, unbalanced totals, minimum line count, currency and account validation, integer minor-unit constraints, and debit/credit presence.
