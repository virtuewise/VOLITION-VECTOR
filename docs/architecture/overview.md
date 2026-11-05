# Architecture overview

## Direction
Start as a modular monolith in a TypeScript monorepo, with explicit domain boundaries and independently testable modules. Extract services only when measured scaling, isolation, regulatory or team-ownership needs justify the operational cost.

## Logical system
- Experience: Next.js web, Expo/React Native mobile, accessible design system.
- Application: NestJS API, background workers, versioned contracts and policy enforcement.
- Data: PostgreSQL as authoritative transactional source; pgvector for semantic retrieval; Redis for cache, rate limits and ephemeral coordination.
- Search: begin with PostgreSQL full-text and vector retrieval; add OpenSearch only when justified.
- Integrations: payment, identity, credential issuers, communications and analytics behind provider adapters.
- Operations: CI/CD, observability, audit trail, backups, incident response and infrastructure-as-code.

## Fifteen domain engines
1. Identity — accounts, authentication, recovery and identity claims.
2. Professional Capability — skills, experience, portfolios and evidence.
3. Opportunity — jobs, projects, tenders, partnerships and volunteering.
4. Service Marketplace — service catalogs, offers and contracting.
5. Vector Intelligence — explainable matching and recommendations.
6. Trust — evidence, reputation, moderation, disputes and risk signals.
7. Transaction/Financial — provider-routed payments, ledger, invoices and refunds.
8. Project — milestones, deliverables and acceptance.
9. Communication — messaging, notifications, consent and safety.
10. Learning — pathways, resources, progress and outcomes.
11. Certification — issuer registry, credential evidence, status and revocation.
12. Governance — policies, consent, audit, moderation, retention and appeals.
13. Globalization — locale, currency, time zones and jurisdiction.
14. Opportunity Equity — accessible entry points, fair exposure and impact.
15. Business Intelligence — privacy-aware operational and ecosystem metrics.

## Data and tenancy
Use explicit organization/workspace membership and server-side authorization. Define tenant ownership on every tenant-scoped record; never rely on UI filtering. Evaluate PostgreSQL row-level security as defense in depth. Separate public profile fields from private account, verification and financial data. Audit material state transitions.

## API conventions
Version APIs under /v1; validate boundaries and reject unknown fields; use stable error envelopes, correlation IDs and idempotency keys; enforce authorization in services; publish OpenAPI contracts; use transactional outbox patterns for reliable events.

## AI and matching
Treat AI as decision support initially. Record model/version, input provenance, explanation, confidence and user-visible effect. Provide correction, opt-out where appropriate, appeal and human review for consequential decisions. Do not infer protected traits or use proxies to discriminate.

## Payments
Evaluate Stripe Connect, Adyen for Platforms and Mollie by country and use case. Keep provider-specific objects behind an adapter. Do not custody funds or store raw card data. Implement idempotency, immutable double-entry journal, reconciliation, refunds and disputes; complete legal and PCI scope review before live payments.

## Decisions
Modular monolith first; PostgreSQL source of truth; rebuildable caches/indexes; minimal versioned domain events; replaceable provider adapters.
