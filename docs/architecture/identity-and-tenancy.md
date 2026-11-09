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

1. Verify a WorkOS user access token using the configured client ID, exact HTTPS issuer and WorkOS user-token profile. The pinned WorkOS SDK verifies the signature and expiry; the application separately requires the exact configured API audience.
2. Resolve the verified issuer/subject pair to exactly one external identity mapped to an active internal account. Email and WorkOS organization/role claims are not account or authorization evidence.
3. The `WorkOSAuthenticationGuard` populates the trusted internal account ID. The `IdentityContextGuard` validates its UUID shape and creates the application principal.
4. For tenant-owned mutation paths, begin a transaction and set `app.tenant_id` transaction-locally using the parameterized `withTenantTransaction` helper.
5. Load current actor, target and resource membership facts under RLS and evaluate the applicable server-side permission policy before any write. The membership mutation repository deliberately performs this read-and-authorize step inside the locked transaction to avoid a time-of-check/time-of-use race.
6. Execute tenant-owned reads and writes under PostgreSQL RLS.
7. Append a minimal audit event in the same transaction as each material state transition.

Any missing, invalid, suspended or mismatched context must fail closed. A verified external identity does not itself establish organization membership or permission.

## Runtime database requirements

- Use a non-owner role without BYPASSRLS or replication privileges for application traffic.
- Keep migration credentials separate from runtime credentials.
- Set tenant context inside every transaction; never use a connection-global tenant setting.
- Never concatenate a tenant identifier into SQL.
- Test RLS using the actual runtime role, including absent and malicious tenant context.
- Grant the identity resolver only column-level SELECT on `external_identities.account_id`, `external_identities.issuer`, `external_identities.subject`, `accounts.id` and `accounts.status`; do not grant access to private identity email fields.
- Never expose invitation token hashes or audit metadata through public APIs.

## Transaction adapter

`withTenantTransaction` validates the tenant UUID before acquiring a connection, begins a transaction, binds the tenant ID as a parameter to PostgreSQL `set_config` with transaction-local scope, runs the caller's work, and commits. Any work or context-setting failure triggers rollback. The connection is always released. For mutation paths, the service/repository must load the current membership and resource facts and evaluate authorization inside the same transaction before the write; a pre-transaction check alone is vulnerable to concurrent role or membership changes.

## Current implementation boundary

The API includes a WorkOS access-token verifier, identity resolver and NestJS authentication guard. The verifier requires `WORKOS_CLIENT_ID`, exact HTTPS `WORKOS_ISSUER` and `WORKOS_TOKEN_AUDIENCE` together; partial configuration fails at startup. The WorkOS SDK verifies the token signature, expiry and user-token profile, while the application checks the exact issuer and API audience. A provider/JWKS or identity-database outage returns HTTP 503; missing/invalid credentials or an absent/inactive internal identity return HTTP 401.

`WorkOSIdentityResolver` maps the verified issuer/subject pair through the unique external identity mapping and accepts only exactly one active internal account. The lookup does not use email or WorkOS organization claims. The database startup check rejects superuser, BYPASSRLS, replication, tenant-table-owner and inherited privileged roles, and requires every registered tenant-owned table to have both ENABLE and FORCE ROW LEVEL SECURITY. Production database URLs must specify `sslmode=verify-full`.

The organization membership controller explicitly applies `WorkOSAuthenticationGuard` followed by `IdentityContextGuard`. The latter still validates request-context shape only; it is not a credential verifier and must not be used alone. No global application guard is registered, so every future private controller must explicitly apply the trusted guard and its own service-level object/tenant permission checks.

The membership mutation repository takes a tenant-scoped advisory lock, loads actor/target memberships and active-owner count under row locks, evaluates the shared deny-by-default membership policy, performs the mutation and appends its audit event in the same transaction. This policy is for organization membership management only; it does not grant financial posting authority or substitute for action-specific policies in other domains.

The WorkOS Staging callback, sign-out, web origin and API JWT audience are configured and verified in the linked rollout record. A real browser sign-in/callback/session-refresh/sign-out journey and a tested session revocation strategy remain outstanding. The observed Staging access-token expiry is 300 seconds; offline JWT verification does not provide immediate revocation of an already-issued token. Internal account suspension is checked during each API identity resolution, but WorkOS session invalidation and the effective revocation window still require end-to-end verification. Production WorkOS remains unconfigured.

The Neon primary `main` branch remains unprovisioned: it has no application tables, accounts, external identities or migration history. The dedicated Preview branch `preview/feat/workos-staging-auth-flow` has the 13 checked-in SQL migrations applied, 20 public base tables and 18 registered tenant-owned tables with both ENABLE and FORCE RLS. Its `vv_runtime` login role was verified as non-superuser, non-BYPASSRLS, non-replication, non-owner and not a member of a privileged role. Runtime identity lookup is limited to the required account/issuer/subject and account id/status columns; private external-identity email columns remain denied. A sensitive Preview-only `DATABASE_URL` using `vv_runtime` and `sslmode=verify-full` is recorded in Vercel without exposing its value. A live API startup/health check against that deployed binding and a full authenticated browser journey remain outstanding.

The Preview branch also has a private `vv_schema_migrations` ledger containing the 13 already-applied migration names as a verified pre-runner baseline with NULL checksums. Open PR #56 adds the checksum-sealing migration runner, runtime-role privilege checks and a manual-only Staging migration workflow; it has not been merged or run against Production. The runner must be reviewed and merged before the controlled Staging workflow is used. See [WorkOS AuthKit rollout and staging readiness](./workos-authkit-rollout.md) for the live environment evidence and release gates.

Still deferred are the controlled first run of the migration runner to seal the Staging baseline, deployed API startup/health verification, real browser sign-in/callback/session-refresh/sign-out tests, and a bounded session-revocation strategy. Invitation delivery and rate-limit adapters and tenant-aware persistence/workflows for the remaining domains are also outstanding. The membership controller is the only currently verified API controller using the WorkOS guard. The Neon primary branch, Production database, WorkOS Production configuration and Production Vercel settings remain untouched. No production readiness is claimed.
