# ADR 0007: Provider-neutral identity API boundary

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Volition Vector identity and API domains

## Context

The PostgreSQL membership mutation repository and deny-by-default policy now
exist, but the API has no selected OIDC/session provider and no production
PostgreSQL pool adapter. Exposing mutation endpoints without those trust and
persistence boundaries would create a misleading or unsafe integration.

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
- Keep the mutation command behind an application port. Its default provider
  returns HTTP 503 until a real PostgreSQL adapter and trusted auth middleware
  are configured. A null result maps to a generic forbidden response to avoid
  distinguishing missing, cross-tenant and denied memberships.

## Security and integration boundaries

No OIDC provider, session store, JWT verifier, database pool or production
membership command is selected or configured by this decision. In the current
application no middleware populates `request.user`, so requests fail closed
with HTTP 401; if a verified principal is supplied, the unconfigured command
fails closed with HTTP 503. This is an API contract and safe integration seam,
not a functioning production authentication or persistence integration.

Before enabling these routes, select and configure the identity provider,
verify claims and lifecycle at the authentication boundary, provision a
non-owner PostgreSQL runtime role without BYPASSRLS, implement the pool adapter,
bind the membership command to `PostgresMembershipRepository` and the shared
`canManageOrganizationMembership` policy, and add end-to-end API tests.
