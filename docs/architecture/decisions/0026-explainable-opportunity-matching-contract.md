# ADR 0026: Explainable opportunity matching and user controls

- Status: Proposed
- Date: 2026-11-24
- Decision owners: Vector Intelligence, Opportunity, Professional Capability, Trust, Privacy and Product
- Scope: future personalized opportunity matching; this ADR does not change the public search API

## Context

The 90-day plan places explainable matching and user controls in the Days 61–90 Intelligence and controlled-pilot phase. The product principles require explainable recommendations, human accountability, fair access and no undisclosed pay-to-win ranking.

The current public opportunity projection contains only published listing fields: title, summary, type, location label, remote flag, optional compensation values and publication/expiry timestamps. It does not expose structured skill requirements or a participant's capability profile. The current discovery work establishes deterministic lexical search and a caller-selected relevance/recent ordering only (proposed ADR 0023). PostgreSQL lexical rank is not a suitability judgment.

The repository does not yet establish a reviewed, purpose-limited contract for combining participant capability data with opportunity criteria. Implementing a score before that contract and its data sources exist would create unsupported explanations and could silently turn discovery into consequential decisioning.

## Proposed decision

### 1. Separate discovery, matching and eligibility

- Public lexical discovery remains available without a profile and continues to use only the public opportunity projection.
- Personalized matching is a separate, opt-in decision-support capability. It must not be silently enabled by visiting discovery pages or by supplying a search query.
- Relevance ordering, match explanations and eligibility filters are distinct concepts. A relevance order must never be described as eligibility, qualification, quality, probability of success or a hiring recommendation.
- Hard eligibility criteria may be applied only when the opportunity owner has explicitly marked the criterion as mandatory, the criterion is lawful and reviewable, and the participant has chosen to apply that filter. Missing profile data must not be treated as failure.
- Soft match factors may help a participant explore an opportunity. They must not automatically reject, suppress or prevent a participant from viewing or applying to a public opportunity.
- No match output may submit an application, contact an organization, make a financial commitment or change an account state.

### 2. Permit only declared, purpose-limited factors

A future matching implementation may evaluate a factor only when both sides of the comparison are explicit, available to the participant and supported by a reviewed data contract. Candidate factor families for future design review are:

- Skills the participant has explicitly added or evidenced, compared with skills explicitly requested in the published opportunity.
- Experience or proficiency requirements that are structured, understandable and not inferred from age, career gaps, education prestige or other proxies.
- Work-mode and location preferences the participant has explicitly supplied, compared with the opportunity's declared work arrangement.
- Availability or schedule preferences only where the participant deliberately supplies them for this purpose.
- Credential requirements only where the issuer, credential type, status and verification provenance are clear to the participant.

These are candidate factors, not claims that the required fields or integrations currently exist. A factor must remain unavailable until its source, visibility, purpose, retention and correction process have been approved.

Do not use protected traits or sensitive personal data, inferred demographics, identity-verification data, private messages, financial history, trust/dispute records, behavioral surveillance, device fingerprints or opaque proxy variables. Do not infer a participant's location, availability, skills or credentials from unrelated activity.

### 3. Make explanations evidence-based and understandable

A future explanation must be generated from the same versioned factor evaluation that produced the displayed match. Each displayed factor must be traceable to:

- A stable factor key and plain-language label.
- The specific participant-controlled or published opportunity evidence used.
- The source and last-updated time for that evidence.
- A direction such as supports, needs_attention or not_evaluated.
- A short factual explanation that does not overstate certainty.

not_evaluated is mandatory when required evidence is absent, stale, inaccessible or not consented for this purpose. Missing information must not be rendered as a negative match. The interface must distinguish a confirmed mismatch from an unknown or unverified factor.

Do not expose raw model logits, vector distances, PostgreSQL rank values or an unexplained aggregate score as a person's suitability. If a summary score is eventually approved, its meaning, calibration, limitations and contribution of each factor must be disclosed and independently evaluated before release.

### 4. Give participants meaningful controls

Before personalized matching is enabled, participants must be able to:

- Explicitly enable and disable personalized matching.
- Review, correct and remove the profile attributes used for matching.
- See why an opportunity was surfaced and which evidence was considered.
- Mark a factor or explanation as incorrect and request correction.
- Dismiss an opportunity without that action being interpreted as a negative capability signal.
- Continue to browse and apply through the non-personalized public discovery path.

Controls must be accessible by keyboard and assistive technology, work on mobile and low-bandwidth journeys, and explain the effect of each setting. Disabling matching must stop future personalized evaluation; retention or deletion of previously derived artifacts must follow the approved privacy and retention policy.

### 5. Preserve fairness and commercial transparency

- Basic public discovery and application must not require payment or a premium account.
- Paid placement, if introduced, must be visibly labelled and kept separate from organic relevance and personalized matching.
- No advertiser or organization may buy an undisclosed match advantage.
- Do not infer protected characteristics to personalize, rank or measure an individual's opportunities.
- Any aggregate equity evaluation must use a separately reviewed, privacy-preserving measurement design and must not feed protected attributes back into individual ranking.
- Evaluate coverage and error patterns for new entrants and people with sparse profiles; sparse data must not systematically hide opportunities.

### 6. Keep AI and vector retrieval behind explicit boundaries

- Begin with deterministic, inspectable factor rules where structured data is sufficient.
- Add embeddings or model-based retrieval only after the source fields, purpose, provider, data residency, retention, training-use terms and deletion behavior are reviewed.
- Keep model and embedding providers behind replaceable adapters; record model/version and factor-contract version when model output affects a result.
- Treat AI output as decision support. Provide correction and human review before any future consequential use.
- Do not send restricted or confidential profile fields to a provider merely because they improve retrieval.

## Required implementation gates

No personalized matching endpoint, scheduled matching job, embedding pipeline or user-facing match score should be enabled until all of the following are delivered and reviewed:

1. Structured, versioned opportunity criteria and a participant capability/profile contract, with field-level classification and provenance.
2. Explicit purpose, consent/opt-out, correction, deletion and retention behavior for each input and derived artifact.
3. Server-side authorization and PostgreSQL RLS tests proving that one participant's private capability evidence cannot be read by another participant or by public discovery.
4. A deterministic factor evaluator with unit tests for positive, negative, unknown, stale and contradictory evidence, including the rule that missing evidence is not a negative result.
5. Contract and integration tests showing that personalized matching cannot change application, payment, trust or account state.
6. Accessible explanation and control journeys, including keyboard and assistive-technology review.
7. Offline evaluation using reviewed relevance judgments, coverage and error analysis, with documented limitations and no protected-trait inference.
8. Security, privacy and product review of any model/provider integration, followed by a controlled pilot and human oversight plan.

## Consequences

This proposal establishes the boundary for future explainable matching but does not implement it. The current public opportunity endpoint remains non-personalized. Structured capability data, match explanations, participant controls, embeddings, model integrations, evaluation datasets and matching jobs remain deferred. No production-readiness, fairness certification or legal-compliance claim follows from this ADR.

The first implementation slice should be a deterministic explanation contract over explicitly supplied, non-sensitive test fixtures. It must not be wired to participant records or exposed through an endpoint until the required data and authorization gates above are met.

## Alternatives considered

1. **Expose a single opaque match score.** Rejected because it cannot adequately explain evidence, missing data, uncertainty or user correction.
2. **Use embeddings and a model provider immediately.** Deferred because the current public listing contract has no structured capability comparison inputs and provider/privacy boundaries are not yet approved.
3. **Use only lexical search indefinitely.** Rejected as the complete product direction because the approved plan calls for explainable matching, but retained as the safe public discovery baseline.
4. **Automatically exclude participants who do not satisfy inferred criteria.** Rejected because it converts incomplete profile data and uncertain signals into hidden eligibility decisions.

## Validation

Documentation-only proposal. No runtime code, schema, dependency, ranking behavior, API contract or user data flow changes. Before implementation, reviewers must reconcile this proposal with the Opportunity, Professional Capability, Trust, privacy and Opportunity Equity data contracts and explicitly accept or revise the factor and control boundaries.
