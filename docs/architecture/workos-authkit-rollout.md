# WorkOS AuthKit rollout and environment gates

- Status: Provider selected; integration and production enablement are not complete.
- Decision: ADR 0007.
- Related work: issues #34, #37 and #38.

## Pre-integration repository baseline (2026-11-07)

At the time of the initial inspection, the identity domain had a fail-closed request-context guard and membership persistence, but no WorkOS token verification or web login routes. This is historical baseline context; the implementation added on 2026-11-08 is recorded below.

## WorkOS environment inspection (2026-11-07)

### Staging

- The default AuthKit application is present in the Staging sandbox.
- Its login URI is `http://localhost:3002/sign-in`.
- Its default redirect URI is `http://localhost:3002/callback`.
- Its configured web origin is `http://localhost:3002`.
- These are local-development values, not deployed staging callback configuration.

### Production

- A default AuthKit application exists, but its login URI is unset.
- It has no redirect URI, logout URI or web origin configured.
- No production AuthKit application configuration is ready for an application login flow.

No client secret, API key, token or other credential is recorded in this document.

## Deployment boundary

The Vercel project remains linked to `virtuewise/VOLITION-VECTOR`, framework preset `Services`, root directory `./`, and Node 26. The latest deployment inspected for commit `81c473acf062700c0790f20692d7beaf762c23b6` reached `READY`; team SSO deployment protection remains enabled. Do not change the framework preset or disable SSO to test AuthKit.

The Vercel runtime error cluster observed during this inspection belongs to an older non-production deployment on branch `deploy/vercel-multi-service`, commit `14d951b0dd0b65451b8b79b0f82c3bbf4cc76825`. It reported two `/container` exits. It is not evidence that the current `main` deployment is failing. Runtime logs for that historical window were not retained by the current Vercel plan, so the precise process exit cause remains unverified.

## Required implementation sequence

1. **Partially implemented:** the API verifier requires `WORKOS_API_KEY`, `WORKOS_CLIENT_ID` and exact HTTPS `WORKOS_ISSUER` together, and the web routes require the AuthKit client/cookie/redirect values. Add deployment-specific configuration validation and verify audience/token-purpose behavior in integration tests before enabling staging.
2. **Implemented in code, not yet environment-verified:** sign-in, PKCE callback, AuthKit proxy and server-action sign-out use the selected SDK. Verify cookie flags, CSRF/state handling, callback and sign-out redirects in a real staging browser flow. Do not expose refresh tokens to browser JavaScript.
3. **Implemented in code:** NestJS verifies WorkOS access tokens through the Node SDK using the configured client and issuer. Complete negative integration tests for expiry, not-before, wrong issuer/audience, token purpose, JWKS outage and key rotation.
4. **Implemented in code:** resolve the exact issuer/subject pair through the unique external identity mapping and require an active account. Confirm least-privilege SELECT grants for `external_identities` and `accounts` on the deployed runtime role. Do not map by email or trust client-supplied account/organization IDs.
5. **Implemented for organization-membership mutations:** the WorkOS guard sets the internal account identity; the existing membership repository loads membership and target facts within the tenant transaction and applies the internal deny-by-default role policy. Other API controllers are not changed by this PR. WorkOS organization roles must not silently grant VOLITION VECTOR permissions.
6. **Partially implemented:** AuthKit sign-out clears the local session through the SDK; each protected membership request also checks the current internal account status and active membership state. Verify the configured WorkOS sign-out redirect and define any additional refresh-token/session revocation requirements.
7. **Partially tested:** unit tests cover verifier configuration, empty/missing bearer tokens, identity mapping cardinality/account status and guard behavior. Add the remaining token-profile, JWKS, revoked-session and deployed cross-tenant integration cases.
8. **Pending:** configure Staging callback, sign-out and web-origin URLs only after a durable staging domain and preview tests are available. Keep Production redirect/origin lists empty until a separately reviewed production release.
9. **Pending:** complete vendor, contractual, pricing, regional data-residency, privacy, support/SLA and incident-response review before production enablement.

## Release gates

- No authenticated membership or payment route is enabled until trusted middleware and internal account/membership resolution are reviewed.
- No financial role or journal-posting authority is inferred from WorkOS claims or existing membership roles. Issue #39 remains a human decision gate.
- No production WorkOS secrets are copied into source control, logs, chat or public documentation.
- No production readiness claim is made from a successful Vercel build or a configured AuthKit application alone.

## Verification record

- GitHub `main` quality run for `81c473a`: success, including formatting, lint, typecheck, tests and build.
- Vercel deployment for the same commit: `READY`; SSO protection enabled.
- WorkOS Staging callback/login configuration: local-only.
- WorkOS Production callback/login configuration: absent.
- Web/API WorkOS SDK and callback implementation: not present in inspected package manifests/routes.
- Repository `main` branch protection: GitHub branch API reported `protected=false`; administrator action required.

## Staging authentication implementation (2026-11-08)

### SDKs and implemented endpoints

- `@workos-inc/authkit-nextjs` is used by the Individual Workspace.
- `@workos-inc/node` is used by the API token verifier.
- The Individual Workspace Next.js App Router exposes `/app/sign-in` and `/app/callback` externally because its configured basePath is `/app`.
- The sign-in route returns 503 while its required WorkOS environment is absent.
- The Next.js 16 proxy bypasses AuthKit when the environment is unconfigured; once configured, it delegates session handling to `authkitProxy`.
- The API verifier validates bearer access tokens through WorkOS JWKS and an explicitly configured issuer. It is registered as an injectable service but is not yet attached to protected controllers.

### Identity mapping and API authorization

The existing identity/tenancy migration already defines `external_identities`, with a unique `(issuer, subject)` constraint and a foreign key to `accounts`. The API now resolves the verified issuer/subject pair through that table, joins the internal account, and accepts only exactly one mapping whose account status is `active`. Email and WorkOS organization claims are not used for account resolution. Missing, non-unique or inactive mappings fail closed.

The NestJS `WorkOSAuthenticationGuard` verifies the bearer token before populating `request.user.accountId`; `IdentityContextGuard` then validates the internal UUID shape. The organization-membership controller applies both guards. Its existing PostgreSQL membership repository loads actor/target memberships and active-owner state inside the tenant transaction and evaluates the deny-by-default internal role policy before mutation. WorkOS organization roles do not grant VOLITION VECTOR permissions.

The mapping lookup uses the configured PostgreSQL runtime connection. The deployment database role must have narrowly scoped SELECT access to `external_identities` and `accounts`; this permission has not been verified against a live database in this change. External identity provisioning/linking remains a separate, controlled onboarding operation; this PR does not auto-link by email.

### URL and deployment gate

- Local sign-in: `http://localhost:3002/app/sign-in`.
- Local callback: `http://localhost:3002/app/callback`.
- Local web origin: `http://localhost:3002`.
- The current feature preview is not a durable staging domain and remains behind Vercel deployment protection. Do not register it as a WorkOS callback or disable Vercel SSO.
- The Individual Workspace now exposes a server-action sign-out control using AuthKit `signOut()`. A default WorkOS Sign-out URI or explicitly allowlisted `WORKOS_SIGN_OUT_REDIRECT_URI` is still required before the end-to-end redirect can be exercised.
- WorkOS Production remains unconfigured.
