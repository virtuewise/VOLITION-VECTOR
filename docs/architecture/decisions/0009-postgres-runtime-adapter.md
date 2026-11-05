# ADR 0009: PostgreSQL runtime adapter and RLS startup gate

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Platform engineering and identity domain

## Context

The identity membership repository depends on a narrow tenant connection pool
port. The NestJS API needs a real driver adapter without weakening transaction-
local RLS context or silently connecting as a superuser or table owner.

## Decision

- Use node-postgres `pg` with a bounded connection pool.
- Adapt `PoolClient` to the database package's `TenantConnection` interface;
  preserve parameterized queries and forward release errors so uncertain
  connections can be discarded.
- When `DATABASE_URL` is configured, verify the runtime role at Nest startup:
  it must not be superuser, must not have BYPASSRLS, and must not own
  `organizations`, `organization_memberships`, `organization_invitations`
  or `audit_events`.
- Verify all four tenant tables exist in `public` with both
  `relrowsecurity` and `relforcerowsecurity` enabled before the pool is
  accepted.
- Bind the membership command to `PostgresMembershipRepository` and the
  shared `canManageOrganizationMembership` policy. If `DATABASE_URL` is
  absent, keep the explicit HTTP 503 fallback.

## Security and operational boundaries

The pool does not provision roles, grant permissions, run migrations or read
secrets from an external secret manager. Production must supply a dedicated
least-privilege role and verified TLS settings in the connection configuration.
No production database URL or credentials are configured here. OIDC/session
verification remains unselected; without trusted middleware, membership routes
continue to fail closed with HTTP 401.
