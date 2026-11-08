# WorkOS AuthKit rollout and environment gates

- Status: Provider selected; integration and production enablement are not complete.
- Decision: ADR 0007.
- Related work: issues #34, #37 and #38.

## Pre-integration repository baseline (2026-11-07)

At the time of the initial inspection, the identity domain had a fail-closed request-context guard and membership persistence, but no WorkOS token verification or web login routes. This is historical baseline context; the implementation added on 2026-11-08 is recorded below.

## WorkOS environment inspection (2026-11-07)

### Staging

- The default AuthKit application is present in the Staging sandbox.
- Its legacy login URI is `http://localhost:3002/sign-in`.
- Its legacy redirect URI is `http://localhost:3002/callback`.
- Its configured web origin is `http://localhost:3002`.
- These login and callback paths predate the Individual Workspace `/app` base path and are incorrect for the current app. The implemented local routes are `/app/sign-in` and `/app/callback`; do not register or test the legacy paths.

### Production

- A default AuthKit application exists, but its login URI is unset.
- It has no redirect URI, logout URI or web origin configured.
- No production AuthKit application configuration is ready for an application login flow.

No client secret, API key, token or other credential is recorded in this document.

## Deployment boundary

The Vercel project remains linked to `virtuewise/VOLITION-VECTOR`, framework preset `Services`, root directory `./`, and Node 26. The latest deployment inspected for commit `81c473acf062700c0790f20692d7beaf762c23b6` reached `READY`; team SSO deployment protection remains enabled. Do not change the framework preset or disable SSO to test AuthKit.

The Vercel runtime error cluster observed during this inspection belongs to an older non-production deployment on branch `deploy/vercel-multi-service`, commit `14d951b0dd0b65451b8b79b0f82c3bbf4cc76825`. It reported two `/container` exits. It is not evidence that the current `main` deployment is failing. Runtime logs for that historical window were not retained by the current Vercel plan, so the precise process exit cause remains unverified.

## WorkOS Staging reinspection (2026-11-08)

Read-only inspection of the Staging environment confirms that the default AuthKit application still has:

- Initiate-login URI: `http://localhost:3002/sign-in`.
- Redirect URI: `http://localhost:3002/callback`.
- Logout URI: `http://localhost:3002/`.
- Web origin: `http://localhost:3002`.
- No JWT access-token template (`jwtTemplate: null`).
- No AuthKit OAuth protected resources configured.

The Individual Workspace is deployed with `basePath: /app`; the implemented local routes are therefore `/app/sign-in` and `/app/callback`. The existing WorkOS URLs do not match those routes. The current Staging AuthKit settings also report MFA as Off. No WorkOS configuration was changed during this run.

The Production default AuthKit application currently has no initiate-login URI, redirect URI, logout URI, web origin, JWT template or OAuth protected resource configured. Production MFA is also Off. Production authentication must remain disabled until a separately reviewed configuration and release.

Do not invent a resource audience or register a temporary Vercel preview as a durable callback. A durable staging API/web origin and a reviewed JWT-template or protected-resource configuration are required before enabling the API guard. Production remains a separate, unconfigured release gate.

## Vercel environment reinspection (2026-11-08)

The linked Vercel project currently has no project environment variables (including no hidden production variables) and only one verified project domain, `volition-vector.vercel.app`, attached to the Production target. There is no dedicated staging/custom domain. Preview deployments remain protected by Vercel team SSO. The app therefore has no deployed WorkOS configuration: the proxy remains inert and the sign-in route returns 503 until a reviewed environment is provisioned. Do not use a transient preview URL or disable SSO to work around this boundary.

## Required implementation sequence

1. **Partially implemented:** the API verifier requires `WORKOS_CLIENT_ID`, exact HTTPS `WORKOS_ISSUER` and `WORKOS_TOKEN_AUDIENCE` together. The web routes require the AuthKit client, cookie and redirect values. The API audience must be an exact resource URI configured both as `WORKOS_TOKEN_AUDIENCE` and as the `aud` claim in the WorkOS environment's JWT template. AuthKit session access tokens do not include `aud` by default; do not enable the API guard until this template is configured and a staging token is verified.
2. **Implemented in code, not yet environment-verified:** sign-in, PKCE callback, AuthKit proxy and server-action sign-out use the selected SDK. Verify cookie flags, CSRF/state handling, callback and sign-out redirects in a real staging browser flow. Do not expose refresh tokens to browser JavaScript.
3. **Implemented in code with an explicit audience gate:** the pinned WorkOS Node SDK verifies the JWKS signature, expiry, configured issuer and WorkOS user-access-token profile. The application additionally requires the exact configured API audience because the SDK's `verifyAccessToken` helper does not enforce `aud`. Complete negative integration tests for expiry, not-before, wrong issuer/audience, token purpose, JWKS outage and key rotation.
4. **Implemented in code:** resolve the exact issuer/subject pair through the unique external identity mapping and require an active account. Confirm least-privilege SELECT grants for `external_identities` and `accounts` on the deployed runtime role. Do not map by email or trust client-supplied account/organization IDs.
5. **Implemented for organization-membership mutations:** the WorkOS guard sets the internal account identity; the existing membership repository loads membership and target facts within the tenant transaction and applies the internal deny-by-default role policy. Other API controllers are not changed by this PR. WorkOS organization roles must not silently grant VOLITION VECTOR permissions.
6. **Partially implemented:** AuthKit sign-out clears the local session through the SDK; each protected membership request also checks the current internal account status and active membership state. Offline JWT verification does not provide immediate WorkOS session revocation. Add and test a bounded session-revocation/introspection strategy before production enablement.
7. **Partially tested:** unit tests cover verifier configuration, empty/missing bearer tokens, exact audience matching, identity mapping cardinality/account status and guard behavior. Add the remaining token-profile, JWKS, revoked-session and deployed cross-tenant integration cases.
8. **Pending:** configure Staging callback, sign-out, web-origin and JWT-template audience values only after a durable staging domain and preview tests are available. Keep Production redirect/origin/template values unset until a separately reviewed production release.
9. **Pending:** complete vendor, contractual, pricing, regional data-residency, privacy, support/SLA and incident-response review before production enablement.

## Release gates

- No authenticated membership or payment route is enabled until trusted middleware, exact issuer/audience verification and internal account/membership resolution are reviewed.
- No financial role or journal-posting authority is inferred from WorkOS claims or existing membership roles. Issue #39 remains a human decision gate.
- No production WorkOS secrets are copied into source control, logs, chat or public documentation.
- No production readiness claim is made from a successful Vercel build or a configured AuthKit application alone.

## Verification record

- GitHub `main` quality run for `81c473a`: success, including formatting, lint, typecheck, tests and build.
- Vercel deployment for the same commit: `READY`; SSO protection enabled.
- WorkOS Staging callback/login configuration: local-only.
- WorkOS Production callback/login configuration: absent.
- Repository `main` branch protection: GitHub branch API reported `protected=false`; administrator action required.

## Staging authentication implementation (2026-11-08)

### SDKs and implemented endpoints

- `@workos-inc/authkit-nextjs@4.6.3` is used by the Individual Workspace with Next.js 16.4.5.
- `@workos-inc/node@12.2.0` is used by the API token verifier.
- The Individual Workspace Next.js App Router exposes `/app/sign-in` and `/app/callback` externally because its configured basePath is `/app`.
- The sign-in route returns 503 while its required WorkOS environment is absent.
- The Next.js 16 proxy bypasses AuthKit unless the client ID, exact issuer, redirect URI and a cookie password of at least 32 characters are present; once configured, it delegates the request and Next fetch event to the pinned SDK's `authkitProxy`. The sign-in route returns 503 when any of these values is missing or the cookie password is too short. The SDK supports keyless public-client mode, so a WorkOS API key is not required for the sign-in/callback/session flow.
- The API verifier uses the WorkOS Node SDK's public-client configuration with the client ID and exact issuer; an API key is not required for local JWKS verification. It additionally requires the configured API audience before returning a verified identity.

### Identity mapping and API authorization

The existing identity/tenancy migration already defines `external_identities`, with a unique `(issuer, subject)` constraint and a foreign key to `accounts`. The API resolves the verified issuer/subject pair through that table, joins the internal account, and accepts only exactly one mapping whose account status is `active`. Email and WorkOS organization claims are not used for account resolution. Missing, non-unique or inactive mappings fail closed.

The NestJS `WorkOSAuthenticationGuard` verifies the bearer token before populating `request.user.accountId`; `IdentityContextGuard` then validates the internal UUID shape. The organization-membership controller applies both guards. Its existing PostgreSQL membership repository loads actor/target memberships and active-owner state inside the tenant transaction and evaluates the deny-by-default internal role policy before mutation. WorkOS organization roles do not grant VOLITION VECTOR permissions.

The mapping lookup uses the configured PostgreSQL runtime connection. The startup check requires only column-level SELECT on `external_identities.account_id`, `external_identities.issuer`, `external_identities.subject`, `accounts.id` and `accounts.status`; it rejects runtime access to `external_identities.email` and `email_verified`. The PostgreSQL integration fixture verifies the exact issuer/subject lookup, issuer separation, suspended-account status, missing mappings and the email-column denial. The deployed runtime role still requires independent configuration and verification. External identity provisioning/linking remains a separate, controlled onboarding operation; this PR does not auto-link by email.

### URL and deployment gate

- Local sign-in: `http://localhost:3002/app/sign-in`.
- Local callback: `http://localhost:3002/app/callback`.
- Local web origin: `http://localhost:3002`.
- The current feature preview is not a durable staging domain and remains behind Vercel deployment protection. Do not register it as a WorkOS callback or disable Vercel SSO.
- The Individual Workspace exposes a server-action sign-out control using AuthKit `signOut()`. A default WorkOS Sign-out URI or explicitly allowlisted `WORKOS_SIGN_OUT_REDIRECT_URI` is still required before the end-to-end redirect can be exercised.
- WorkOS Staging remains unconfigured for the API audience JWT template; API authentication must remain disabled until that is completed.
- WorkOS Production remains unconfigured.

## Staging configuration update (2026-11-08)

- Durable staging hostname: `https://www.volitionvector.printsync.co.za`, attached to the Vercel Preview branch `feat/workos-staging-auth-flow`; Vercel domain verification reports verified.
- WorkOS Staging default AuthKit application now has the staging initiate-login URL `https://www.volitionvector.printsync.co.za/app/sign-in`, default callback `https://www.volitionvector.printsync.co.za/app/callback`, default sign-out URI `https://www.volitionvector.printsync.co.za/app/`, and the staging web origin. Local development callback and sign-out URLs remain registered as secondary entries.
- The Staging JWT access-token template has been validated and saved with the exact API audience claim `aud=https://www.volitionvector.printsync.co.za/v1`. This is a Staging-only environment template; do not copy it into Production without separate review.
- Vercel encrypted Preview variables have been provisioned for the staging branch: `WORKOS_CLIENT_ID`, `WORKOS_ISSUER`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI`, and `WORKOS_TOKEN_AUDIENCE`. The cookie sealing secret was generated for this environment and is not recorded here. No Production variables were created.
- The Individual Workspace root page now calls `withAuth({ ensureSignedIn: true })`; workspace content fails closed without an authenticated AuthKit session. Sign-in and callback remain public entry points. Review every future page/API route before adding private functionality; proxy session refresh alone is not an authorization policy.
- The Vercel deployment-protection setting remains enabled. Custom domains are outside the current Vercel SSO protection scope, so app-level authentication is mandatory.
- At the time of this earlier inspection, database verification was blocked because no Neon project was available. See the live reinspection below for the current database state and remaining runtime-role/RLS gate.
- A successful real browser sign-in/callback/session-refresh/sign-out sequence has not yet been observed. It requires a fresh Preview deployment containing the environment variables and workspace guard, plus a working staging database/runtime configuration.

## Live staging and database reinspection (2026-11-08 11:14 UTC)

This read-only inspection supersedes the earlier statement that no Neon project existed. It does not change any WorkOS, Vercel, Neon, GitHub or secret configuration.

### WorkOS Staging

- The default AuthKit application is configured with initiate-login URI `https://www.volitionvector.printsync.co.za/app/sign-in`, callback URI `https://www.volitionvector.printsync.co.za/app/callback`, sign-out URI `https://www.volitionvector.printsync.co.za/app/`, and web origin `https://www.volitionvector.printsync.co.za`. Local callback, sign-out and origin entries remain present.
- The Staging JWT access-token template exists and sets the exact API audience to `https://www.volitionvector.printsync.co.za/v1`, matching the API verifier's required audience.
- The Staging AuthKit settings currently report MFA Off, a 31,536,000-second maximum session time, a 172,800-second inactivity timeout, sign-up enabled and waitlist enabled. These are observed settings, not an endorsement; security/product owners must review the session and MFA policy before any controlled pilot.
- The WorkOS Production application remains unconfigured: no initiate-login URI, homepage, redirect URI, logout URI, web origin or JWT template. Production AuthKit MFA is Off. No Production authentication enablement is authorized by this record.

### Vercel deployment and environment records

- The Vercel project remains linked to `virtuewise/VOLITION-VECTOR`. The custom domain `www.volitionvector.printsync.co.za` is verified and assigned to the Preview branch `feat/workos-staging-auth-flow`.
- The Preview deployment for commit `557f48956473051047209f0a44f8e1e1f16245e6` reports READY. The Production deployment for current main `0fc0f553fbaf8f4a6c215c6018f3b7eb38678766` also reports READY. A READY deployment is not evidence of a successful authenticated browser journey or database authorization.
- Branch-scoped Preview variable records exist for `WORKOS_CLIENT_ID`, `WORKOS_ISSUER`, `WORKOS_COOKIE_PASSWORD`, `NEXT_PUBLIC_WORKOS_REDIRECT_URI` and `WORKOS_TOKEN_AUDIENCE`. Their values were not decrypted or copied into this repository.
- The Staging Preview branch now has a branch-scoped sensitive `DATABASE_URL` using the restricted `vv_runtime` role and `sslmode=verify-full`. No Production `DATABASE_URL` was created or changed; secret values are never recorded here.
- Vercel returned no warning/error runtime log records for either deployment in the latest 30-minute query window. The Hobby retention window rejected a 60-minute query, so this is not evidence that no earlier runtime errors occurred.

### Neon database state — blocking finding

- Neon project `volitionvector` exists in AWS `us-east-1` on PostgreSQL 18.6. It has a primary `main` branch and a Vercel-created `preview/feat/workos-staging-auth-flow` branch; both report ready compute.
- The primary `main` branch remains unprovisioned: no public application tables, `accounts`, `external_identities` or `_prisma_migrations` table were found there. On the dedicated Preview branch `preview/feat/workos-staging-auth-flow`, all 13 checked-in Prisma SQL migrations (169 SQL statements) have now been applied successfully; 20 public base tables and the two safe public projection views are present.
- The Preview branch has a dedicated `vv_runtime` login role. Catalog verification confirms it is not superuser, does not BYPASSRLS, is not replication-capable, cannot create roles/databases, owns no tenant tables and is not a member of a privileged role. All 18 registered tenant tables have both ENABLE and FORCE RLS. Runtime identity access is limited to the required `external_identities` and `accounts` columns; private email columns are denied, and journal UPDATE/DELETE privileges are absent.
- The primary branch also has Neon Auth roles `authenticator`, `anonymous` and `authenticated`, but no application runtime role and no application tables. These roles are not evidence of a correctly provisioned VOLITION VECTOR API runtime identity.
- The NestJS startup guard in `apps/api/identity/postgres-tenant-connection.pool.ts` intentionally rejects superuser, BYPASSRLS, replication, tenant-table-owner and privileged inherited roles. The provisioned Preview `vv_runtime` role satisfies the inspected catalog checks. A live API startup/health check against the new `DATABASE_URL` is still pending.

### Required next steps and release gate

1. Redeploy the staging API with the newly provisioned Preview `DATABASE_URL`; verify `/v1/health` and the NestJS startup guard against the deployed runtime connection.
2. Exercise the identity resolver and negative RLS tests against the deployed database, including cross-tenant reads/writes and the denied private identity columns.
3. Complete a real staging browser sign-in, callback, session refresh and sign-out test, plus a reviewed session revocation/invalidation strategy. The live configuration inspection and READY deployment do not replace these tests.
4. Keep the Neon `main` branch and Production database untouched until a separate migration and runtime-role plan is reviewed. Keep Production WorkOS unconfigured and authenticated API/payment exposure disabled until its own database, identity, security and release gates are separately reviewed.

Subsequent Staging-only provisioning changed only the `preview/feat/workos-staging-auth-flow` Neon branch: checked-in migrations were applied, the least-privilege `vv_runtime` role was created and verified, and a sensitive Preview-only `DATABASE_URL` was saved in Vercel. The Neon `main` branch, Production environment, WorkOS Production settings, Vercel SSO and branch protections were not changed.

## Verification update — 2026-11-08

### Database state after staging-only provisioning

- All 13 checked-in SQL migration files (169 statements) were applied to Neon branch `preview/feat/workos-staging-auth-flow` in a single successful transaction.
- The branch now contains 20 public base tables; all 18 registered tenant-owned tables have RLS enabled and forced.
- `vv_runtime` is non-superuser, non-owner, non-replication, non-BYPASSRLS and not a member of a privileged role. It has only the required identity lookup columns, cannot read private identity email fields, and has no journal UPDATE/DELETE grants.
- The Neon-provisioned default table/sequence grants were revoked for `vv_runtime`. A newly-created table probe confirmed that future tables receive no automatic runtime SELECT grant. The runtime role also cannot read `vv_schema_migrations`.
- A private `vv_schema_migrations` ledger now records the 13 already-applied migrations as a verified pre-runner baseline (NULL checksums). PR #56 adds the checksum-sealing migration runner and checks the default-privilege invariant at API startup and in CI.
- Vercel Preview `DATABASE_URL` is stored as a sensitive variable scoped only to branch `feat/workos-staging-auth-flow`, using `vv_runtime` and `sslmode=verify-full`. No Production database URL or Production database change was made.

### Deployment and authentication blockers

- The existing staging deployment has not yet been refreshed with the new database binding. A new deployment request was subsequently rejected by Vercel with HTTP 402: the team reached its 100-deployments/day API limit (24-hour cooldown). No further deployment creation attempts should be made until the limit resets or Vercel resolves the quota.
- PR #55 addresses the Individual Workspace HTTP 500 by removing Next.js `basePath` and keeping the public `/app` prefix in the route tree, so the Next.js 16 proxy matcher can run for AuthKit. Quality and CodeQL passed on the PR branch; its Vercel deployment is blocked by the API container image push error: the Vercel Container Registry reports that the `api` repository must exist and rejects the push.
- Create the `api` repository in the Vercel project's Sandboxes / Container Registry settings, then redeploy the Preview branch. Do not disable SSO or deployment protection to work around this.
- A real browser sign-in, callback, session refresh and sign-out cycle is still not verified. The current HTTP 500 on the old staging deployment is not a successful auth test.

### Remaining governance and release gates

- GitHub branch rulesets query returned no rulesets. The branch-protection endpoint could not be read with the connected GitHub permissions; administrator confirmation and required-check enforcement on `main` remain outstanding.
- Security-alert endpoints are not readable through the current GitHub connection, so this record makes no claim that the repository has zero alerts.
- Issue #39 still requires a human decision on financial authority boundaries. No authenticated payment, journal-post, reversal or refund route should be enabled before that decision and the corresponding authorization/audit tests.
- Production WorkOS, Production database migrations and Production Vercel configuration remain untouched.
