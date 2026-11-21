# ADR 0022: Deterministic lexical ranking for public opportunity discovery

- Status: Proposed for review
- Date: 2026-11-20
- Decision owners: Opportunity and platform engineering

## Context

The opportunity listing foundation already stores a generated PostgreSQL `tsvector` and GIN index, and its public read repository filters matching rows with `plainto_tsquery`. Results were ordered only by publication time. This makes a relevant older listing lose to a newer but less relevant listing even when the caller supplied a search query.

The Vector Intelligence engine is planned to provide search, matching and explanation. This change deliberately establishes only a deterministic lexical-discovery step; it is not semantic matching or an automated decision.

## Decision

- When a non-empty text query is supplied, order public opportunity results by PostgreSQL `ts_rank_cd` against the existing generated `search_document` and the same `plainto_tsquery('simple', ...)` used by the filter.
- Use publication time descending and opportunity ID as stable tie-breakers.
- When no query is supplied, the rank expression is zero for every row, preserving the existing publication-time ordering and stable ID tie-break.
- Keep all query input parameterized and retain the existing bounded query length, pagination, expiry filter and `public_opportunities` invoker-security view.
- Do not expose raw ranking scores as an assessment of a person, organization or opportunity quality.

## Security and fairness boundaries

- Search continues to read only the public projection; draft, organization-only and expired listings remain excluded by the existing database boundary.
- No profile, identity, demographic, protected-trait or private tenant data is read by this ranking step.
- The rank is lexical relevance to the caller's query, not a recommendation, suitability judgment, quality score or consequential decision.
- No model provider, embedding generation, pgvector column, background indexing job or external search integration is introduced.

## Deferred work

Semantic/vector retrieval, field-level match explanations, user feedback controls, offline relevance evaluation, abuse controls for query traffic and any personalized matching require separate reviewed designs, privacy analysis, tests and explicit governance. They are not implemented by this ADR.

## Validation

Unit tests assert that the public repository uses the same parameterized full-text query for filtering and ranking, with publication time and ID as deterministic tie-breakers. The PostgreSQL integration fixture verifies that an older listing with stronger lexical relevance outranks a newer listing with one query-term occurrence, while query-free discovery retains publication-time ordering. Existing PostgreSQL RLS and public-view integration coverage remains the security boundary; this change adds no schema or policy migration.
