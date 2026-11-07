# ADR 0019: Persisted immutable double-entry journal

## Status

Proposed.

## Context

The payment SDK now validates balanced journal drafts in process. That validation is not a durable accounting boundary: concurrent requests can race, idempotency cannot be enforced across processes, and persisted records need database-enforced tenant isolation and immutability.

## Decision

Introduce PostgreSQL journal headers and lines. A tenant-scoped unique constraint enforces idempotency. Forced row-level security isolates each organization. Runtime access is SELECT/INSERT only. Database triggers reject UPDATE, DELETE and TRUNCATE. Deferred constraint triggers validate the complete entry at transaction commit, requiring at least two lines, both debit and credit sides, positive integer minor units and exact equality of totals.

The composite organization/entry foreign key prevents a line from referencing an entry in another tenant. Currency and account-code syntax are constrained at the database boundary.

## Consequences and limits

This migration establishes persistence invariants only. It does not provide a repository/service, authenticated actor authorization, audit-event coupling, outbox delivery, provider adapters, settlement, reconciliation, refunds, custody, or financial regulatory controls. A subsequent implementation must write the journal and its audit/outbox records in one authorized transaction and must add concurrency and failure-injection tests. No provider or funds flow is enabled by this ADR.
