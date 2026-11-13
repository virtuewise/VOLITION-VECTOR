# ADR 0024: Account-scoped organization discovery

- Status: Proposed
- Date: 2026-11-13
- Decision owners: Identity and Platform engineering
- Related issue: #34
- Related API contract: `GET /v1/me/organizations`

## Context

An individual account may belong to multiple organizations. The Business Workspace needs to discover the internal organizations associated with the signed-in account before it can present a tenant selector. A WorkOS organization claim, organization slug, or client-supplied tenant UUID is not an authoritative internal membership record.

The existing tenant RLS context requires a known organization ID. Using that context to discover organizations would create a circular dependency: the server would need to trust a tenant ID before it can verify the account's membership in that tenant.

## Decision

Add a narrowly scoped account-context read path for organization discovery.

- The API authenticates the WorkOS user token, resolves its issuer/subject to one active internal account, and derives the account ID from the verified server-side principal.
- `GET /v1/me/organizations` accepts no account or organization identifier.
- The database repository opens an account transaction and sets only transaction-local `app.account_id`.
- New SELECT-only RLS policies allow that account to see its own active membership rows and organizations with an active membership. The policies apply only when `app.tenant_id` is absent.
- Suspended accounts, suspended/revoked memberships and inactive organizations are excluded from the API's organization summaries.
- The response is limited to internal organization ID, display name, slug and the caller's membership role.

The account-discovery policies do not grant mutation access and do not replace tenant authorization. Once a tenant is selected, every operation must independently revalidate the active account, active membership, resource-tenant ownership and action-specific permission inside the same tenant transaction, under the appropriate locks, before mutation.

## Consequences

- Organization discovery does not trust WorkOS organization claims or caller-supplied tenant IDs.
- The runtime role retains its existing tenant-table grants; account discovery adds only SELECT RLS policies and no additional write privileges.
- Account discovery and tenant-scoped transactions are mutually exclusive contexts. The account-discovery policies require an empty tenant context so an account context cannot broaden a tenant-scoped query.
- A missing account context returns no organization rows. A missing database configuration fails closed with HTTP 503.
- The API startup guard verifies that the required account-discovery policies and SELECT privileges are present.
- Organization summaries are identifiers and navigation data, not authorization credentials.

## Verification

Unit tests cover account UUID validation, transaction-local account context, response-shape validation and fail-closed behavior. PostgreSQL integration tests use the non-owner runtime role to verify cross-tenant membership discovery, account isolation, no-context denial, tenant/account context separation, suspended memberships, suspended accounts and inactive organizations.

This decision does not enable Business Workspace mutations, invitation delivery, or any Production identity configuration.
