# ADR 0021: Transactional outbox event persistence boundary

- Status: Proposed for review
- Date: 2026-11-07
- Decision owners: VOLITION VECTOR platform, domain and security engineering

## Context

Domain changes need a durable event record committed atomically with their database mutation and audit event. The architecture calls for a transactional outbox, but the repository has no outbox persistence or delivery worker. Payment journal posting remains blocked by the unresolved human authorization decision in issue #39.

The existing organization membership model has roles `owner`, `admin`, `member`, and `viewer`. There is not yet an explicit shared permission for posting journal entries. We must not infer that membership roles imply financial posting authority.

## Decision

Add an immutable, tenant-scoped `outbox_events` envelope table and an insertion helper that accepts the caller's existing database transaction client.

Each event contains:

- A tenant organization ID and tenant-scoped idempotency key.
- A stable event name and aggregate type/identifier.
- A positive schema version.
- A minimal JSON object payload.
- Database-generated occurrence and creation timestamps.

The database enforces a unique idempotency key per organization, forced row-level security, and append-only behavior for UPDATE, DELETE and TRUNCATE. Runtime access is provisioned separately and is limited to the required SELECT/INSERT boundary.

`insertOutboxEvent` validates the envelope and performs exactly one parameterized INSERT using the supplied `TenantTransactionClient`. It never opens or commits a transaction. A domain service must use the same client for its domain mutation, append-only audit event and outbox event; PostgreSQL then commits or rolls back the complete unit.

## Event payload safety contract

Event payloads are internal integration data, not a place to copy source records or credentials. The database package applies a conservative insertion-time guardrail:

- The serialized UTF-8 JSON object is limited to 16 KiB.
- Nesting is limited to 8 levels; each object is limited to 64 properties; each array is limited to 100 items; each string is limited to 4,096 characters.
- Values must be finite JSON primitives, arrays or plain objects. Cycles, accessors, symbols, functions, bigint values, dates/class instances, sparse arrays and non-finite numbers are rejected.
- Field names commonly associated with credentials, direct contact/identity attributes, payment card/bank details, raw provider payloads, private evidence locators and signed URLs are rejected at any nesting level.
- Producers should send stable internal identifiers and the minimum state needed by a consumer. Sensitive source data remains in its authoritative protected record and is retrieved only through a separately authorized path.

This is a denylist and structural guardrail, not a complete event-schema registry, content scanner, lawful-basis assessment or proof that every payload is non-sensitive. Every event producer still owns an explicit event schema, data classification, purpose, retention and consumer authorization. Any exception to the default field policy requires security/privacy review and an approved event-specific contract. Consumers must validate the event name and schema version before dispatch; a central registry is not implemented by this boundary.

## Delivery boundary

This change persists event envelopes only. It does not publish events, claim work, track delivery attempts, retry, dead-letter or call external providers. Delivery state must be modeled separately from the immutable event envelope, with a dedicated least-privilege worker identity and explicit lease, retry, idempotency and dead-letter semantics. No worker role, credentials or authenticated route is introduced here.

Delivery is expected to be at-least-once. Consumers must be idempotent using the event identifier or tenant-scoped idempotency key; an external side effect followed by a process crash before acknowledgement can be retried. This boundary does not promise exactly-once external effects.

## Security and scope

- Tenant context is transaction-local and enforced by forced RLS.
- Event payloads must be minimal and must not contain credentials, access/refresh tokens, raw provider payloads or unnecessary personal data.
- Cross-tenant insertion and reads are denied by RLS.
- Per-tenant idempotency prevents duplicate event envelopes for a repeated command key.
- The outbox helper does not grant domain authorization. Callers must authorize before entering the tenant transaction.
- Issue #39 remains the human gate for journal posting, reversal and refund authority. No membership role is granted financial permission by this ADR.
- No authenticated payment API, provider adapter, funds movement, custody or production-readiness claim is included.

## Validation evidence

The PostgreSQL integration suite exercises the actual non-owner runtime role for tenant isolation, cross-tenant insertion denial, idempotency, transaction rollback across journal/audit/outbox records, and least-privilege access. Append-only triggers are tested independently of runtime grants. Unit tests cover envelope validation and prove the helper does not manage transaction boundaries.

The payload guardrail is unit-tested for restricted field names at nested levels, unsupported JavaScript values, structural limits, UTF-8 byte limits and rejection before any database query. It does not replace event-specific schema review or PostgreSQL tenant integration tests.
