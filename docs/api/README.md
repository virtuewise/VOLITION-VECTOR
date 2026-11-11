# API documentation

Document versioned REST/event contracts, authentication and authorization, pagination, error envelopes, idempotency, rate limits, webhooks, compatibility and deprecation policy here. OpenAPI specifications are maintained alongside the API once endpoints are implemented.

## Implemented contracts

- [Opportunity applications](./opportunity-applications.md) — authenticated submission, applicant-owned listing and withdrawal, and active organization owner/admin review. The API derives actors from the verified WorkOS principal and relies on the existing PostgreSQL RLS and transactional audit boundary.

The documented implementation status is not a production-readiness claim. Each contract records its environment, privacy and operational release gates.
