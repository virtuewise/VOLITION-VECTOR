# ADR 0002: Identity, organizations and tenant isolation

- Status: Accepted for the foundational data model; identity-provider selection remains open.
- Date: 2026-11-05

## Context

Volition Vector serves individuals and organizations in one ecosystem. An individual account may participate in multiple organizations, and every organization-owned record must be isolated from other organizations. Authentication must not be coupled to a single vendor before issuer, residency, lifecycle, recovery, MFA and enterprise SSO requirements have been evaluated.

## Decisions

1. An account is the platform principal. External authentication identities map to an account through the unique issuer/subject pair; email is an attribute, never the identity key.
2. An account may hold memberships in multiple organizations. Organization roles are owner, admin, member and viewer; invitations cannot grant owner.
3. Authorization is deny-by-default, requires an active membership, and verifies the resource organization against the active tenant. Explicit denies override grants.
4. PostgreSQL is authoritative. Organization-owned tables use PostgreSQL row-level security. Tenant context must be set transaction-locally with a parameterized set_config('app.tenant_id', $1, true) call after membership authorization.
5. Runtime database roles must not own tenant tables and must not have BYPASSRLS. Migrations run under a separate owner role.
6. Audit events are append-only through application DML and contain metadata only; secrets, access tokens, invitation tokens and unnecessary personal data must never be recorded.
7. Invitation tokens are random, single-use, time-limited and stored only as a cryptographic hash. The application must rate-limit issuance and acceptance and avoid account-enumeration responses.
8. Authentication-provider integration, session/cookie policy, MFA, recovery, account linking and production endpoints are deferred until the identity-provider ADR is approved.

## Consequences

- No local password storage is introduced in this phase.
- Every tenant-owned repository operation must execute in a transaction with the validated tenant setting.
- Tests must cover cross-tenant denial, inactive memberships, role boundaries and absent tenant context.
- RLS is defense in depth, not a substitute for authorization checks.
- The migration must be tested against the supported PostgreSQL version and a non-owner runtime role before production use.

## Required follow-up before production

- Select and threat-model an OIDC-compatible identity provider.
- Implement and test transaction-scoped tenant context in the database adapter.
- Provision separate migration and runtime database roles; validate RLS bypass behavior.
- Add invitation lifecycle service, rate limits, replay protection and notification delivery.
- Define account deletion, retention, export, legal hold and audit retention policies.
- Complete independent security review and jurisdictional privacy assessment.
