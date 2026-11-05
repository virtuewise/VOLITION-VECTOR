# Identity and organization tenancy foundation

## Model

- **Account**: a platform-level individual principal.
- **External identity**: an authentication issuer/subject pair mapped to exactly one account.
- **Organization**: a tenant boundary and business workspace.
- **Membership**: an account's role and status inside one organization.
- **Invitation**: a hashed, expiring invitation credential that cannot grant ownership.
- **Audit event**: append-only evidence of a security- or business-relevant action.

An account may join multiple organizations. Do not treat an email address, display name, organization slug or client-supplied tenant ID as proof of identity or authorization.

## Request authorization sequence

1. Validate the authenticated issuer/subject through the future identity adapter.
2. Resolve the external identity to an active account.
3. Resolve an active membership for the requested organization.
4. Evaluate the requested permission using the shared permission policy.
5. Begin a database transaction and set `app.tenant_id` transaction-locally using the parameterized `withTenantTransaction` helper.
6. Execute tenant-owned reads and writes under PostgreSQL RLS.
7. Append a minimal audit event for material actions.

Any missing, invalid, suspended or mismatched context must fail closed.

## Runtime database requirements

- Use a non-owner role without BYPASSRLS for application traffic.
- Keep migration credentials separate from runtime credentials.
- Set tenant context inside every transaction; never use a connection-global tenant setting.
- Never concatenate a tenant identifier into SQL.
- Test RLS using the actual runtime role, including absent and malicious tenant context.
- Never expose invitation token hashes or audit metadata through public APIs.

## Transaction adapter

`withTenantTransaction` validates the tenant UUID before acquiring a connection, begins a transaction, binds the tenant ID as a parameter to PostgreSQL `set_config` with transaction-local scope, runs the caller's work, and commits. Any work or context-setting failure triggers rollback. The connection is always released. The caller remains responsible for authenticating the principal and authorizing active organization membership before entering the transaction.

## Current implementation boundary

The repository now contains identity and organization contracts, the initial relational migration, shared permission evaluation, tenant UUID validation and a transaction-scoped RLS context helper with unit tests. It does not yet implement a concrete PostgreSQL pool, database integration tests against the runtime role, authentication, sessions, invitation delivery, tenant-aware repositories or production API endpoints. Those must be delivered and independently tested before production use.
