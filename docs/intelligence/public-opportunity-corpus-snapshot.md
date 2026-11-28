# Public opportunity corpus snapshot

- Contract version: 1.0.0
- Status: Proposed implementation primitive
- Source policy: `public-opportunity-projection-only`
- Implementation: `PostgresOpportunityRepository.createPublicCorpusSnapshot`

## Purpose

The public relevance dataset contract refers to an immutable corpus snapshot.
This implementation provides a bounded, point-in-time export of the public
opportunity projection so curator-authored judgments can be resolved against a
specific listing corpus.

The method is an internal database repository operation. It is not an HTTP
endpoint, a scheduled worker, a dataset-ingestion service or a durable storage
integration.

## Snapshot consistency

1. Open one PostgreSQL transaction using
   `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`.
2. Read `statement_timestamp()` as the corpus snapshot time. This first
   statement establishes the transaction's MVCC snapshot.
3. Read every page through the same connection and transaction.
4. Query only `public_opportunities`, the existing security-invoker view.
   That view and the underlying public RLS policy restrict rows to published,
   public opportunities.
5. Exclude rows whose `expires_at` is not later than the captured snapshot
   time.
6. Order by opportunity ID and use bounded pages. If more than 10,000 active
   public records exist, fail the transaction rather than return a partial
   corpus.
7. Commit only after every page has been read and validated.

The operation does not set `app.tenant_id`. It relies on the database runtime
role remaining non-owner and unable to bypass row-level security, as checked by
the existing PostgreSQL connection-pool startup guard.

## Artifact fields

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Snapshot artifact version, currently `1.0.0` |
| `corpusSnapshotId` | Newly generated opaque UUID |
| `corpusSnapshotAt` | UTC timestamp captured by the first statement |
| `sourcePolicy` | `public-opportunity-projection-only` |
| `recordCount` | Number of complete records in the artifact |
| `sha256` | SHA-256 digest of the canonical JSON record array |
| `records` | Public listing fields required for offline curation |

Each record contains the public opportunity ID, slug, title, summary, type,
location label, remote flag, public compensation fields, publication time and
expiry time. The export deliberately omits organization IDs, creator account
IDs, descriptions, internal search vectors, applications, profiles, messages,
trust evidence and financial data.

The mapper writes fields in a fixed order and normalizes timestamps to canonical
UTC ISO strings before hashing. The UUID identifies an artifact instance; the
digest allows callers to detect content changes. The digest is not a digital
signature and does not prove who created or reviewed an artifact.

An empty public corpus is a valid snapshot. A corpus above the hard limit fails
closed; it is never silently truncated.

## Governance and deferred work

- Snapshot contents are public listing data, but exported files still require
  integrity controls and an approved curation access path.
- Do not include production search histories or personal data in relevance
  queries or judgments.
- Durable object storage, encryption/key management, retention/deletion,
  signatures, curator authorization and audit records require separate design.
- The snapshot method is not wired to a controller, worker, scheduler or
  external provider.
- The snapshot artifact alone does not establish a reviewed relevance dataset,
  a representative benchmark or a ranking-quality release threshold.

## Validation

Unit tests cover read-only transaction lifecycle, rollback, stable record
mapping, omitted private columns, timestamp and digest metadata. The PostgreSQL
RLS integration script verifies that the runtime role can read the public
projection in a repeatable-read read-only transaction without tenant context.
