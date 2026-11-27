# Public-search relevance dataset contract

- Contract version: 1.0.0
- Status: Proposed
- Machine-readable schema: [public-search-relevance-dataset.schema.json](./public-search-relevance-dataset.schema.json)
- Runtime validator: `apps/api/intelligence/public-search-dataset.ts`

## Purpose and scope

This contract describes a small, versioned, offline evaluation dataset for the public opportunity discovery endpoint. It is designed to be consumed by the offline metric helper proposed in ADR 0027. It is not a production API payload, a user-search history export or a participant-matching dataset.

The current public endpoint accepts `q`, optional `type`, `sort`, `limit` and `offset`. The contract records the curated `q` and optional `type`, fixes `sort` to `relevance`, maps `cutoff` to `limit`, and fixes `offset` to zero so every benchmark evaluates the first ranked page. It does not invent category, geography, profile, organization or demographic filters that the endpoint does not implement.

## Dataset fields

| Field              | Requirement            | Meaning                                                                   |
| ------------------ | ---------------------- | ------------------------------------------------------------------------- |
| `schemaVersion`    | Required; `1.0.0`      | Dataset format version                                                    |
| `datasetId`        | Required               | Stable lowercase kebab-case identifier                                    |
| `createdAt`        | Required               | Canonical UTC creation timestamp                                          |
| `corpusSnapshotAt` | Required               | Time of the public listing corpus snapshot being judged                   |\n| `corpusSnapshotId` | Required UUID          | Opaque reference to the immutable public-only corpus snapshot             |
| `cutoff`           | Required; 1–50         | Fixed evaluation cutoff, passed as the API `limit`                        |
| `sort`             | Required constant      | `relevance`, so ranking quality rather than recency is measured           |
| `offset`           | Required constant      | `0`, so each case evaluates the first ranked page                          |
| `sourcePolicy`     | Required constant      | `public-opportunity-projection-only`                                      |
| `rubricVersion`    | Required constant      | `public-opportunity-relevance-v1`                                         |
| `reviewStatus`     | Required               | `draft` or `reviewed`                                                     |
| `reviewedAt`       | Required when reviewed | Review completion timestamp                                               |
| `reviewRecordId`   | Required when reviewed | Opaque UUID reference to a separately access-controlled governance record |
| `limitations`      | Required, 1–20         | Known coverage and methodology limitations                                |
| `queries`          | Required, 1–250        | Curated public-intent query cases                                         |

Each query case has a stable `queryId`, a curated `q` string of at most 200 characters, an optional supported opportunity `type`, and 1–500 judgments. Each judgment contains only a public opportunity identifier and a grade from 0 to 3. A dataset is capped at 25,000 total judgments by the runtime validator.

The machine-readable JSON Schema is the interchange contract. The API-side validator additionally enforces cross-field date ordering, per-dataset uniqueness and the total-judgment cap. Unknown properties are rejected at every object level; this is deliberate so personal or tenant-private fields cannot silently pass through.

## Relevance rubric

| Grade | Meaning                                                                 |
| ----: | ----------------------------------------------------------------------- |
|     0 | Not relevant to the stated public query intent                          |
|     1 | Marginal relationship; a weak or incidental fit                         |
|     2 | Relevant; the public listing substantially addresses the query intent   |
|     3 | Highly relevant; the public listing directly addresses the query intent |

Judgments are assessments of the relationship between a public query and a public listing at the recorded corpus snapshot. They are not judgments about an applicant, organization, provider or person's worth, eligibility, trustworthiness or likely success.

## Curation and review procedure

1. Write synthetic or curator-authored public-intent queries. Do not copy raw production search strings, support conversations or user histories.
2. Resolve each judgment identifier against the immutable public opportunity snapshot referenced by `corpusSnapshotId` and timestamped by `corpusSnapshotAt`. Exclude drafts, expired listings and organization-only records.
3. Judge only public listing attributes available in that public projection. Do not consult account profiles, private organization records, applications, messages, identity evidence, trust/dispute data or financial records.
4. Use the rubric consistently. Include grade 0 judgments for reviewed candidates that were considered and found not relevant; do not silently omit them.
5. Record dataset scope, coverage, limitations and review provenance. Keep reviewer identity, deliberation and source evidence in the separately access-controlled governance record referenced by `reviewRecordId`, not in the dataset file or test fixtures.
6. Set `reviewStatus` to `reviewed` only after human review is complete and both `reviewedAt` and an opaque UUID `reviewRecordId` is present. Draft datasets must omit both fields.
7. Revalidate the dataset and retain the exact schema version and dataset identifier with every evaluation result.

The validator checks structure and strict field allowlists. It cannot determine whether a query string contains personal information, whether an opportunity identifier really resolves to a public listing, or whether a human judgment is substantively correct. Those remain curation and review responsibilities.

## Comparison rules

- Compare candidate ranking implementations against the same dataset version, corpus snapshot ID and cutoff.
- Report query count, per-query metrics, macro metrics and the evaluable-query counts for recall and NDCG.
- Publish limitations and coverage with the results. Do not present a metric without its denominator.
- Do not establish release thresholds until a reviewed dataset has adequate, documented coverage and a baseline.
- A benchmark result is descriptive evidence for public retrieval ordering only. It must not trigger automatic rejection, suppression or exclusion.

## Explicit exclusions

The schema has no fields for account IDs, participant IDs, tenant IDs, reviewer names, profile text, private messages, demographic or protected characteristics, inferred proxies, financial data, trust/dispute evidence, identity documents, raw search logs, ranking scores or model-generated explanations. Strict unknown-field rejection enforces this boundary at validation time.

No dataset is included in this change. The example values in unit tests are synthetic test fixtures and are not relevance judgments or a baseline. Production ingestion, persistence, reporting and external integrations remain deferred.
