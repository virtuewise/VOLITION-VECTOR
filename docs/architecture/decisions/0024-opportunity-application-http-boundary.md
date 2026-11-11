# ADR 0024: Authenticated opportunity application HTTP boundary

- Status: Proposed
- Date: 2026-11-11
- Decision owners: Identity and Opportunity engineering

## Context

ADR 0015 established the private application persistence model and deferred HTTP routes until a trusted identity boundary existed. The NestJS API now has a WorkOS access-token verifier, exact issuer/audience checks, an issuer/subject-to-active-account resolver and a guard that populates the internal principal. The application repository already enforces applicant ownership, tenant RLS, active organization membership for review and transactional audit events.

## Decision

- Add versioned NestJS routes for application submission, applicant-owned listing, applicant withdrawal and organization review.
- Apply the WorkOS authentication guard and internal identity-context guard to every route in this controller.
- Derive applicant and reviewer account IDs only from the verified internal principal. Do not accept actor IDs in path, query or body input.
- Validate path UUIDs and request DTOs at the HTTP boundary; reject unknown body fields through the API's global whitelist/forbid validation pipe.
- Keep applicant submission independent of hiring-organization membership. The repository must verify that the opportunity is public, published and unexpired within the specified organization.
- Keep withdrawal applicant-only and limited to submitted applications.
- Keep review restricted to active owners/admins using the existing transactional repository policy and membership revalidation.
- Preserve PostgreSQL RLS as the data boundary and keep submission, withdrawal/review and audit insertion in their existing single transactions.
- Return generic 404 for missing or non-withdrawable applicant records to avoid disclosing another applicant's state.
- Return 503 when the persistence or authentication configuration is unavailable; do not fall back to mock data or accept caller-supplied identity.

## Boundaries and release gates

The API route implementation does not prove that the deployed WorkOS JWT audience, staging callback, runtime database grants or browser sign-in flow are operational. Staging verification must exercise valid and invalid tokens, wrong audience/issuer, suspended accounts, cross-tenant access, applicant ownership, review role restrictions and database-unavailable behavior before enabling the routes in a pilot.

No CV uploads, automated screening, ranking, interviews, offers, message delivery, retention/deletion workflows or legal approval are included. Application records and cover notes remain personal data and require a DPIA, retention schedule and legal review before pilot use.

## Validation

- Controller unit tests verify actor IDs are derived from the authenticated principal, strict query handling, response mapping and fail-closed persistence behavior.
- Existing repository tests cover public-opportunity eligibility, applicant-only withdrawal, owner/admin review authorization and transactional audit insertion.
- Existing PostgreSQL integration tests cover tenant/applicant RLS and the runtime database role.
- The PR CI must run frozen-lockfile install, format, lint, strict typecheck, unit tests, build, PostgreSQL integration and security scanning on the exact head SHA.
