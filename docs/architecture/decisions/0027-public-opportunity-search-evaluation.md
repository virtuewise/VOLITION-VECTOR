# ADR 0027: Offline evaluation for public opportunity search

- Status: Proposed
- Date: 2026-11-25
- Decision owners: Opportunity and Vector Intelligence engineering, product and privacy

## Context

Public opportunity discovery now has a PostgreSQL full-text search foundation. Ranking changes need repeatable evidence that relevant public listings are surfaced early without turning a retrieval score into a judgment about a participant.

Personalized matching remains a separate capability. The proposed explainable-matching boundary in PR #81 requires explicit capability data, purpose limitation, participant controls and privacy/security review before personalized scoring or explanations are implemented.

## Decision

Introduce a deterministic, offline evaluation contract for public opportunity rankings.

The pure helper in `apps/api/intelligence/public-search-evaluation.ts` computes:

- Precision@K: relevant returned listings in the first K positions divided by K, including when fewer than K listings are returned.
- Recall@K: relevant returned listings in the first K positions divided by the number of positively judged listings. It is `null` when the judgment set contains no relevant listing, because recall is not evaluable in that case.
- Reciprocal rank: the reciprocal of the first relevant listing's one-based position within the first K results, or zero when none is found.
- NDCG@K: normalized discounted cumulative gain using graded relevance 0–3 and gain `2^grade - 1`.

The helper rejects duplicate result IDs, duplicate judgment IDs, blank identifiers, invalid relevance grades and invalid cutoffs. It does not fetch data, persist judgments, call providers or participate in request handling.

## Evaluation data boundary

- Use synthetic fixtures or curated judgments over public opportunity identifiers and public listing attributes only.
- Do not include account IDs, profile text, private messages, organization-private records, financial history, trust/dispute records, identity evidence, protected traits or inferred proxies.
- Do not use production user search histories as a fixture source. Any future use of aggregate production telemetry requires a separate purpose, retention, privacy and access review.
- Keep relevance judgments versioned and reviewable. Record who supplied each judgment set, its scope and its review date outside the metric helper; do not put reviewer identity into test fixtures.
- Do not treat the judgment set as objective ground truth. Report its coverage and limitations alongside metrics.

## Interpretation and release gates

- These metrics evaluate public retrieval ordering only. They are not participant suitability, eligibility, employability, quality, risk or probability scores.
- Do not use them to automatically reject, suppress or exclude opportunities or participants.
- Do not set release thresholds until a representative, reviewed public-search judgment set and baseline have been established.
- Compare candidate rankings with the same versioned fixture and cutoff. Report macro-level results and material regressions; do not hide cases with no relevant judgments.
- Any future locale, category or geography slice must use public listing/query categories, adequate sample sizes and privacy review. Do not infer protected traits or use proxy attributes.
- Changes to ranking logic require deterministic unit tests, API and PostgreSQL integration tests, query-abuse review and the repository's full CI/security gates.
- Personalized matching, semantic/vector retrieval, embeddings, external model providers, profile-derived factors, user feedback loops and user-facing match explanations are outside this ADR.

## Consequences

The project gains a reproducible metric contract without adding dependencies, database tables, migrations, endpoints, workers or external integrations. The current tests use synthetic identifiers only.

The helper is not yet connected to a production ranking pipeline and does not establish that current search quality is good. A reviewed relevance dataset, baseline measurements, operational reporting and any user-facing changes remain future work.

## References

- [90-day delivery plan](../../roadmap/90-day-plan.md)
- [Engine capability map](../../product/engines-and-capabilities.md)
- [Opportunity equity principles](../../equity/opportunity-equity.md)
- [PR #79: lexical public opportunity ranking](https://github.com/virtuewise/VOLITION-VECTOR/pull/79)
- [PR #81: explainable opportunity matching contract](https://github.com/virtuewise/VOLITION-VECTOR/pull/81)
