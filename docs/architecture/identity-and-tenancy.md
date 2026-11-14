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

1. For an endpoint protected by `WorkOSAuthenticationGuard`, verify the WorkOS user access token using the configured WorkOS client, exact HTTPS issuer and exact API audience. The WorkOS SDK verifies the token using the provider's signing keys and validates the supported user-token profile. Reject missing/malformed bearer credentials, oversized tokens, issuer/audience mismatches and tokens that do not resolve to an internal identity.
2. Resolve the verified `iss` + `sub` pair to exactly one internal account whose status is `active`. Never resolve by email, display name, WorkOS organization claim, client-supplied account ID or organization slug.
3. Populate `request.user.accountId` only after token verification and active-account resolution. `IdentityContextGuard` then validates the internal UUID shape and creates the typed request principal; it is a context guard, not an authenticator.
4. For an organization-scoped operation, resolve the requested internal organization, active actor membership, resource tenant and action-specific permission on the server. Load and lock the relevant actor/target/resource rows before a mutation so authorization and state change share one transaction boundary.
5. Begin a database transaction and set `app.tenant_id` transaction-locally using the parameterized `withTenantTransaction` helper. For participant-scoped project reads, also set the transaction-local account context and retain an explicit client/provider participant predicate in SQL; tenant RLS alone is not sufficient.
6. Execute tenant-owned reads and writes under PostgreSQL RLS using the non-owner runtime role.
7. Append a minimal audit event in the same transaction as each material state transition. Do not record raw credentials, authorization headers, token contents or unnecessary personal data.

A controller does not inherit authentication merely because the guard is registered in a NestJS module. Each private controller must explicitly apply the trusted WorkOS guard and the request-context guard, then enforce its own resource- and action-specific authorization. Missing configuration, identity mappings, active membership, resource ownership or permission must fail closed.

## Runtime database requirements

- Use a non-owner role without BYPASSRLS for application traffic.
- Keep migration credentials separate from runtime credentials.
- Set tenant context inside every transaction; never use a connection-global tenant setting.
- Never concatenate a tenant identifier into SQL.
- Test RLS using the actual runtime role, including absent and malicious tenant context.
- Never expose invitation token hashes or audit metadata through public APIs.

## Transaction adapter

`withTenantTransaction` validates the tenant UUID before acquiring a connection, begins a transaction, binds the tenant ID as a parameter to PostgreSQL `set_config` with transaction-local scope, runs the caller's work, and commits. Any work or context-setting failure triggers rollback. The connection is always released. The caller remains responsible for authenticating the principal and authorizing the relevant membership or participant relationship before entering the transaction.

## Current implementation boundary

### Implemented in repository code

- WorkOS AuthKit is the selected provider behind a replaceable NestJS adapter (ADR 0007). `WorkOSAccessTokenVerifier` requires `WORKOS_CLIENT_ID`, an exact HTTPS `WORKOS_ISSUER` and `WORKOS_TOKEN_AUDIENCE` together. It delegates cryptographic access-token verification to the pinned WorkOS Node SDK and enforces the exact configured issuer and audience.
- `WorkOSAuthenticationGuard` verifies the bearer token, resolves its issuer/subject to one active internal account through `external_identities`, and only then populates `request.user.accountId`. The lookup rejects missing, inactive or non-unique mappings and does not use email.
- `IdentityContextGuard` remains a shape/context guard. The organization-membership controller explicitly applies both guards.
- `PostgresMembershipRepository` serializes membership mutations with a tenant advisory transaction lock, locks actor and target memberships, rechecks the active-owner count, applies the shared deny-by-default membership policy, performs the mutation and appends the audit event in the same transaction.
- The node-postgres adapter checks at startup that the configured runtime role is not a superuser, BYPASSRLS or replication role, does not own tenant tables or inherit a privileged/table-owner role, has only the required identity lookup column grants, and that every registered tenant-owned table has both ENABLE and FORCE ROW LEVEL SECURITY. Production database URLs must specify `sslmode=verify-full`.
- Unit tests cover verifier configuration and claim matching, guard behavior, active identity resolution, membership policy boundaries and runtime-role checks. The PostgreSQL integration workflow separately exercises database RLS, tenant isolation and append-only audit constraints; it does not by itself prove the deployed Staging runtime role is configured correctly.

### Not yet verified or implemented

- The WorkOS verifier currently establishes a verified active account, but it does not provide immediate session revocation or introspection. The principal does not yet enforce a durable `sid`/`jti` revocation check. PR #63 proposes preserving verified session identifiers in the trusted principal, but it remains open and unmerged; preserving claims alone would still not implement revocation. A bounded, fail-closed revocation strategy and maximum post-revocation acceptance window are still required.
- The Staging rollout document records environment-specific AuthKit URLs, a JWT audience template and encrypted Preview variables. It also records that a real browser sign-in/callback/session-refresh/sign-out sequence has not yet been observed and that a working Staging `DATABASE_URL`/runtime-role binding has not been confirmed. Treat the configuration as provisioned but not end-to-end verified.
- Production WorkOS URLs, JWT audience template and runtime credentials remain unconfigured. Production authentication and external access remain gated.
- Account suspension/closure authority, state transitions, recovery proofing, session cutoff, retention, deletion, appeal and audit-notice semantics require the human decisions recorded in issue #64. Organization owner/admin permissions must not be reused as platform-wide account authority.
- The project workspace read repository is participant-scoped and read-only. Its package export is under PR #68. Project HTTP routes and all write transitions remain deferred until trusted identity, participant/membership authorization, audit-event semantics and their integration tests are complete.
- Communication, trust, financial and other domain controllers must each establish their own verified-principal, resource authorization, audit and tenant-RLS boundaries before exposure.

The membership API fails closed with HTTP 503 when its required database/provider configuration is absent and with an authentication/authorization failure when trusted identity or membership context is absent or invalid. No production identity integration, production database deployment, independent security assessment, certification or production readiness is claimed.

## References

- ADR 0007: WorkOS AuthKit identity boundary.
- ADR 0017: project workspace and milestone boundaries.
- ADR 0020: participant-scoped project workspace read model.
- `docs/architecture/workos-authkit-rollout.md`: environment configuration and Staging verification record.
- Issue #34: core marketplace and identity implementation gates.
- Issue #64: human decision on account lifecycle, recovery and session revocation.
