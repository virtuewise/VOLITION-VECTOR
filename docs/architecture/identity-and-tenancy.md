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
5. Begin a database transaction and set app.tenant_id transaction-locally using a bound parameter.
6. Execute tenant-owned reads and writes under PostgreSQL RLS.
7. Append a minimal audit event for material actions.

Any missing, invalid, suspended or mismatched context must fail closed.

## Runtime database requirements

- Use a non-owner role without BYPASSRLS for application traffic.
- Keep migration credentials separate from runtime credentials.
- Set tenant context inside every transaction; never use a connection-global tenant setting.
- Never concatenate a tenant identifier into SQL.
- Test RLS using the actual runtime role, including absent and malicious tenant context.
- Do not expose invitation token hashes or audit metadata through public APIs.

## Current implementation boundary

This change establishes the initial relational migration, tenant UUID validation, shared organization permission policy and architecture contract. It does not yet implement authentication, database connectivity, invitation delivery, session management, tenant-aware repositories or production API endpoints. Those require the selected identity provider and database adapter and must not be represented as complete.
