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

The repository contains identity and organization contracts, the initial relational migration, shared membership policy, tenant UUID validation, and the transaction-scoped RLS helper. It also contains `PostgresMembershipRepository` and a node-postgres adapter used by the NestJS membership command when `DATABASE_URL` is configured. The adapter checks at startup that the connected role is not a superuser, BYPASSRLS or replication role, does not own tenant tables or inherit a privileged/table-owner role, and that all four tenant tables have both ENABLE and FORCE ROW LEVEL SECURITY. Production database URLs must specify `sslmode=verify-full`.

The membership API is still not authenticated. `IdentityContextGuard` validates the shape of an upstream `request.user.accountId`; it does not verify tokens, sessions, issuer/audience, revocation or account status. No trusted middleware currently populates that context, so the routes fail closed with HTTP 401. If a database URL is absent, the membership command fails closed with HTTP 503. The adapter's unit tests and the PostgreSQL RLS integration script provide different evidence: the integration script exercises the database role, RLS policies and SQL concurrency contract, but does not instantiate the TypeScript node-postgres adapter.

Still deferred are a selected and configured OIDC/session provider, trusted identity middleware and active-account resolution, production database credentials and role provisioning, an operational migration process, invitation delivery and rate-limit adapters, and tenant-aware persistence for the remaining domains. No production identity integration, production database deployment or production readiness is claimed.
