# ADR 0023: Private account profile persistence

- Status: Proposed
- Date: 2026-11-10
- Decision owners: Product and Identity engineering
- Related plan: Days 16–30, Identity and workspace
- Related issues: #34, #37, #38

## Context

The platform account is a global individual principal, distinct from an organization tenant. The existing identity mapping resolves a verified WorkOS issuer/subject pair to exactly one active internal account. The first self-service profile slice must not introduce public profile discovery, organization-scoped data leakage, email-based identity linking or a client-controlled account identifier.

## Decision

Add a private account profile with only these fields:

- display_name (optional, maximum 120 printable characters)
- locale (canonical BCP 47 locale, default en)
- time_zone (validated IANA time zone, default UTC)

The profile is keyed by the authenticated internal account_id. API reads and updates use the WorkOSAuthenticationGuard followed by IdentityContextGuard; the account identifier comes only from the verified server-side principal.

PostgreSQL enforces account isolation using a transaction-local app.account_id setting and ENABLE plus FORCE ROW LEVEL SECURITY. The account-scoped transaction helper validates and parameterizes the account UUID before setting that context. It is not a tenant ID and is never read from a request body or route parameter.

Profile updates append a minimal account audit event in the same transaction. The audit metadata contains changed field names only, never profile values. Runtime access to account audit events is INSERT-only. UPDATE, DELETE and TRUNCATE are denied by grants and guarded by database triggers.

## Consequences

- Profile records are private and are not exposed through public marketplace projections.
- A missing profile is represented by safe defaults at the API boundary; GET does not create a database row.
- No-op PATCH requests do not create audit events.
- Profile creation/update and its audit event commit or roll back together.
- The API runtime role must remain non-owner, non-BYPASSRLS and non-privileged, and must have only the explicit profile/audit grants.
- Deployments with a database URL must apply the account-profile migration before the API starts; the startup guard fails closed if the account tables lack forced RLS or the required grants.
- Public profile publication, avatar storage, biography, contact details, external identity linking, account closure and account recovery remain separate decisions and are not implemented here.

## Verification

Unit tests cover UUID normalization, transaction-local context, rollback/release behavior, field validation, self-service repository behavior, no-op updates and audit metadata minimization. PostgreSQL integration tests exercise account RLS and append-only audit protections using the non-owner runtime role.

This ADR does not establish a legal basis for profile processing or claim production readiness. Retention, export, correction and deletion workflows remain governed by the privacy/legal review and the wider #38 release gate.
