# Identity and organization tenancy foundation

## Model

- **Account**: a platform-level individual principal.
- **External identity**: an authentication issuer/subject pair mapped to exactly one account.
- **Organization**: a tenant boundary and business workspace.
- **Membership**: an account's role and status inside one organization.
- **Invitation**: a hashed, expiring invitation credential that cannot grant ownership.
- **Audit event**: append-only evidence of a security- or business-relevant action.

An account may join multiple organizations. Do not treat an email address, display name, organization slug or client-supplied tenant ID as proof of identity or authorization.

## Account-scoped organization discovery

Before a tenant is selected, the authenticated account can call `GET /v1/me/organizations`. The WorkOS authentication guard verifies the user access token and maps its issuer/subject pair to exactly one active internal account. The endpoint accepts no account or organization identifier from the caller.

The repository uses `withAccountTransaction` and transaction-local `app.account_id`, without setting `app.tenant_id`. SELECT-only RLS policies expose the caller's own active memberships and active organizations. They apply only when tenant context is absent. The response contains only organization ID, name, slug and membership role.

The organization ID is a navigation identifier, not authorization. WorkOS organization claims and organization slugs are not internal membership proof. See [ADR 0024](./decisions/0024-account-scoped-organization-discovery.md) and the [API contract](../api/account-organizations.md).

## Request authorization sequence

1. Verify the WorkOS user access token, including its configured issuer and resource audience.
2. Resolve the verified issuer/subject pair to exactly one active internal account.
3. If no tenant is selected, discover the account's active internal organizations through the account-scoped endpoint.
4. For a tenant operation, resolve the account's active membership for the requested internal organization and verify resource-tenant ownership.
5. Evaluate the requested action using the shared deny-by-default permission policy.
6. Perform the read or mutation inside the tenant transaction with transaction-local `app.tenant_id`.
7. For mutations, hold the appropriate membership/resource locks, revalidate authorization inside that same transaction, and append the required audit/outbox records atomically.

Any missing, invalid, suspended or mismatched context must fail closed. A tenant ID supplied by the client is only a lookup key; it never establishes authority.

## Runtime database requirements

- Use a non-owner role without BYPASSRLS for application traffic.
- Keep migration credentials separate from runtime credentials.
- Set account or tenant context transaction-locally; never use a connection-global context.
- Do not set both account and tenant contexts for organization discovery. Account-discovery policies explicitly require an absent tenant context.
- Never concatenate a tenant or account identifier into SQL.
- Test RLS using the actual runtime role, including absent, mixed and malicious context.
- Never expose invitation token hashes or audit metadata through public APIs.

## Transaction adapters

`withAccountTransaction` validates the account UUID before acquiring a connection, begins a transaction, binds the account ID as a parameter to PostgreSQL `set_config` with transaction-local scope, runs the caller's work, and commits. `withTenantTransaction` does the equivalent for the tenant ID. Both roll back on failure and always release the connection. The account ID must come from a verified principal; tenant membership and action authorization must be revalidated within tenant operations.

## Current implementation boundary

The API branch contains a WorkOS access-token verifier and authentication guard that verify the configured token trust boundary, resolve issuer/subject to one active internal account, and fail closed when provider or database configuration is unavailable. `IdentityContextGuard` validates the server-populated principal shape; it is not itself a token verifier. Session revocation/denylist enforcement and back-channel logout remain separate release work and must not be inferred from JWT verification alone.

The database adapter refuses to start with a superuser, BYPASSRLS or replication role, tenant/account-table owner, or role inheriting a privileged/table-owner role. It checks forced RLS across the tenant/account table inventory, required account-discovery policies, and minimal account-profile/audit privileges. Production database URLs must specify `sslmode=verify-full`.

The account organization discovery route and repository are read-only. Membership changes and tenant resources remain subject to tenant-scoped authorization, row-level security and transaction locks. The account discovery response does not authorize subsequent actions.

The adapter's unit tests and PostgreSQL RLS integration script provide different evidence: integration tests exercise the database role, RLS policies and SQL concurrency contract, while TypeScript tests exercise the adapter and application services. Production database credentials, migration operations, staging browser/API smoke tests, session revocation enforcement, invitation delivery and rate-limit adapters, and tenant-aware persistence for remaining domains remain release gates. No Production identity integration or Production readiness is claimed.
