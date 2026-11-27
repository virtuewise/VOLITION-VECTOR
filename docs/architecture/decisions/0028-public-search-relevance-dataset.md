# ADR 0028: Versioned public-search relevance dataset contract

- Status: Proposed
- Date: 2026-11-27
- Decision owners: Opportunity and Vector Intelligence engineering, product and privacy

## Context

ADR 0027 defines deterministic offline metrics for public opportunity ranking but deliberately does not supply a relevance dataset. A baseline cannot be evaluated responsibly until the query and judgment format, corpus snapshot, rubric, provenance and privacy boundary are explicit.

The public opportunity endpoint supports bounded `q`, optional `type`, `sort`, `limit` and `offset` parameters. The dataset records `q` and optional `type`, fixes `sort` to `relevance`, maps its cutoff to `limit`, and fixes `offset` to zero. It must not imply support for filters or data sources the endpoint does not implement.

## Decision

Define a versioned, machine-readable public-search relevance dataset contract at `docs/intelligence/public-search-relevance-dataset.schema.json`, with a strict runtime validator in `apps/api/intelligence/public-search-dataset.ts`.

Version 1.0.0 contains:

- A stable dataset ID, creation time, public corpus snapshot time and opaque UUID reference to an immutable public-only corpus snapshot.
- A fixed cutoff bounded by the public search API maximum of 50, passed as `limit`.
- `sort: relevance` and `offset: 0` so each benchmark evaluates the first relevance-ranked page.
- A fixed public-projection source policy and relevance-rubric version.
- Curated query text and only the currently supported opportunity-type filter.
- Public opportunity identifiers with integer relevance grades from 0 to 3.
- Explicit methodology limitations and draft/reviewed status.
- An opaque UUID governance-record reference and review timestamp for reviewed datasets.

The validator rejects unknown fields at dataset, query and judgment levels. It enforces canonical UTC timestamps and cross-field ordering, unique query IDs, unique opportunity IDs within each query, the supported opportunity types and relevance grades, bounded query/judgment counts and the reviewed/draft metadata rules.

Reviewer identities and detailed provenance remain in a separately access-controlled governance record. They are not copied into the dataset or test fixtures.

## Curation and privacy boundary

Only synthetic or curator-authored public-intent queries may be used. Raw production search strings and user histories are excluded. Every judged opportunity ID must be resolved against the public opportunity projection at the recorded snapshot; drafts, expired listings and organization-only listings are excluded.

Judgments may use only attributes exposed in that public projection. Account profiles, private tenant records, applications, messages, identity evidence, trust/dispute records, financial history, protected traits and inferred proxies are prohibited.

The validator enforces the data shape and allowlist, not the truth of a judgment or the absence of personal information embedded in query text. Human curation and privacy review remain mandatory.

## Consequences

The project now has a stable interchange contract and a dependency-free validator that can reject accidental private-field expansion. No database table, migration, endpoint, worker, external provider, user telemetry, corpus-snapshot store or sample relevance dataset is added. Snapshot creation and retention remain deferred.

The contract does not establish representativeness or search quality. A separately reviewed dataset and reproducible baseline remain future work. No release threshold is approved by this ADR.

## References

- [ADR 0023: ranked public opportunity discovery](https://github.com/virtuewise/VOLITION-VECTOR/pull/79)
- [ADR 0026: explainable opportunity matching contract](https://github.com/virtuewise/VOLITION-VECTOR/pull/81)
- [ADR 0027: offline public-search evaluation](https://github.com/virtuewise/VOLITION-VECTOR/pull/82)
- [90-day delivery plan](../../roadmap/90-day-plan.md)
- [Engines and capabilities](../../product/engines-and-capabilities.md)
