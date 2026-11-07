# WorkOS AuthKit rollout and environment gates

- Status: Provider selected; integration and production enablement are not complete.
- Decision: ADR 0007.
- Related work: issues #34, #37 and #38.

## Verified repository baseline

The identity domain currently has a fail-closed request-context guard and membership persistence. The guard validates an upstream `request.user.accountId`; it does not validate a WorkOS token. The NestJS identity module does not register trusted WorkOS middleware. The individual-workspace app has no sign-in or callback route, and its package manifest has no WorkOS SDK dependency. Do not treat the presence of a WorkOS project or client ID as an implemented login flow.

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

1. Add a typed, environment-specific WorkOS configuration contract. Keep provider enablement off by default; reject missing or malformed issuer, audience, JWKS/auth-domain and client configuration when enabled.
2. Implement the web sign-in and callback routes with the selected supported WorkOS SDK. Use secure, HttpOnly cookies, explicit CSRF protection, correct redirect allowlists, and server-side code exchange. Do not expose refresh tokens to browser JavaScript.
3. Implement NestJS token verification against the configured WorkOS JWKS and exact issuer/audience/token profile. Validate signature, algorithm, expiry, not-before, subject and token purpose; bound JWKS caching and support key rotation.
4. Resolve the verified issuer/subject pair to exactly one active internal account. Do not map by email or trust client-supplied account/organization IDs.
5. Resolve active internal organization membership and action-specific permissions before opening a tenant transaction. WorkOS organization roles must not silently grant VOLITION VECTOR permissions.
6. Define and test session termination, account suspension and membership deactivation behavior. JWT verification alone does not provide immediate revocation.
7. Exercise negative tests for malformed/expired/wrong-issuer/wrong-audience tokens, unknown keys, unmapped identities, duplicate mappings, suspended accounts, JWKS failure, revoked sessions and cross-tenant requests.
8. Configure Staging callback, logout and web-origin URLs only after the actual deployed routes exist and have passed preview tests. Keep Production redirect/origin lists empty until a separately reviewed production release.
9. Complete vendor, contractual, pricing, regional data-residency, privacy, support/SLA and incident-response review before production enablement.

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
