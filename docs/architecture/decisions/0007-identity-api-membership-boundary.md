# ADR 0007: Provider-neutral identity API boundary

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Volition Vector identity and API domains

## Context

The PostgreSQL membership mutation repository and deny-by-default policy now
exist. The API still has no selected OIDC/session provider. A node-postgres
adapter is available when `DATABASE_URL` is configured, but no production
connection string or credentials are supplied by this decision.

## Decision

- Define a narrow `request.user.accountId` contract for upstream middleware
  that has already verified an identity credential.
- Add a guard that validates the account ID shape and copies it into a separate
  request identity context. The guard does not validate tokens, sessions,
  signatures, issuer, audience or revocation.
- Derive the actor account ID only from this verified request context; never
  accept actor IDs from route parameters or request bodies.
- Expose role-change, suspend, revoke and reactivate endpoints through the
  NestJS identity module.
- Keep the mutation command behind an application port. When `DATABASE_URL`
  is present, bind it to `PostgresMembershipRepository` and the shared
  `canManageOrganizationMembership` policy; otherwise return HTTP 503.
  A null result maps to a generic forbidden response to avoid distinguishing
  missing, cross-tenant and denied memberships.

## Security and integration boundaries

No OIDC provider, session store, JWT verifier or production database credentials
are selected or configured by this decision. The PostgreSQL adapter verifies at
startup that the configured role is not a superuser, does not have BYPASSRLS,
does not own tenant tables, and that every tenant table has ENABLE and FORCE
ROW LEVEL SECURITY. Without `DATABASE_URL`, the default command returns HTTP
503. In the current application no middleware populates `request.user`, so
requests fail closed with HTTP 401. This remains a partial integration, not
production authentication or a production deployment.

Before enabling these routes, select and configure the identity provider,
verify claims and lifecycle at the authentication boundary, supply a least-
privilege runtime connection string with verified TLS settings, and add
end-to-end API tests.
