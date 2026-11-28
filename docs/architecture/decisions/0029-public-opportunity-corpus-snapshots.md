# ADR 0029: Bounded public opportunity corpus snapshots

- Status: Proposed
- Date: 2026-11-28
- Owners: Opportunity, Vector Intelligence, Data Platform and Privacy

## Context

The public-search relevance dataset contract requires a stable
`corpusSnapshotId` and `corpusSnapshotAt`. Without a reproducible snapshot,
curators cannot prove that opportunity identifiers and public listing fields
refer to the same corpus when relevance judgments are reviewed or ranking
implementations are compared.

The existing database already exposes a security-invoker
`public_opportunities` view with row-level security for published public
listings. It excludes draft and organization-only rows and does not expose
creator account identifiers.

## Decision

Add an internal `PostgresOpportunityRepository.createPublicCorpusSnapshot`
operation with these properties:

- One PostgreSQL repeatable-read, read-only transaction.
- No tenant context; reads only the existing public invoker-security view.
- Capture `statement_timestamp()` in the first query and use it to exclude
  listings that have expired by the snapshot time.
- Read pages on the same connection and transaction, ordered by public
  opportunity ID.
- Fail rather than truncate when the active public corpus exceeds 10,000 rows.
- Emit a versioned artifact with an opaque UUID, captured timestamp, source
  policy, record count, canonical UTC public records and SHA-256 content digest.
- Omit organization IDs, creator IDs, descriptions, internal search vectors and
  all private or restricted domain data.

A read-only repeatable-read transaction helper is added to the database package.
It deliberately does not set tenant context and must only be used with an
explicitly reviewed public projection and a runtime role that cannot bypass RLS.

## Consequences

The snapshot is consistent across pages and can be compared by UUID and digest.
The hard cap bounds memory and runtime; an oversized corpus produces an error
instead of an incomplete artifact. Public fields are minimized to those needed
for curation and reproducibility.

The operation returns an artifact to its caller but does not persist it. Object
storage, encryption, signatures, retention/deletion, curator authorization,
audit records, scheduled generation and any HTTP exposure remain deferred until
their security and governance contracts are approved.

The digest detects content drift but is not an authenticity guarantee. The
snapshot is not a reviewed relevance dataset and does not establish a search
quality baseline or release threshold.

## Alternatives considered

- **Offset pagination across independent connections:** rejected because rows
  could change between pages and produce a mixed corpus.
- **A materialized snapshot table:** deferred because it adds retention,
  authorization, migration and deletion obligations not yet approved.
- **Exporting the base opportunities table:** rejected because it increases the
  risk of including tenant-private and internal fields.
- **Silently truncating large corpora:** rejected because it would create a
  misleading artifact that appears complete.

## Validation

The implementation includes unit coverage for transaction success and failure,
public-only field selection, deterministic record ordering, expiry filtering,
metadata and digest shape. The PostgreSQL RLS integration script exercises the
public view inside a repeatable-read read-only transaction without tenant
context.
