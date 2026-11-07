# ADR 0007: WorkOS AuthKit identity boundary

- Status: Accepted for implementation; production enablement gated
- Date: 2026-11-07
- Decision owners: Volition Vector identity and API domains
- Supersedes: Provider-neutral selection status in the original ADR

## Context

The PostgreSQL membership mutation repository and deny-by-default policy exist. The API has no trusted OIDC/session provider integration. The existing `IdentityContextGuard` validates the shape of an upstream `request.user.accountId`; it does not verify credentials, token signatures, issuer, audience, expiry, session state, account status or organization membership. No trusted middleware currently populates that context, so protected routes fail closed with HTTP 401.

The platform identity model is intentionally distinct from the identity vendor:
- An external identity is an issuer/subject pair mapped to exactly one internal account.
- An account may participate in multiple organizations.
- Internal organization membership, status and permissions remain authoritative for VOLITION VECTOR resources.
- Tenant transactions and PostgreSQL RLS are entered only after server-side authorization.

## Decision

Select **WorkOS AuthKit** as the preferred identity provider and implement it behind a replaceable NestJS authentication adapter.

This selection is for the integration architecture and implementation work. It does not constitute approval to enable production authentication, provision production credentials, select business permission roles, or launch an externally accessible authenticated service. Commercial, contractual, regional data-residency, support/SLA and vendor-exit checks remain release gates.

### Provider boundary

1. Accept only the configured WorkOS AuthKit user access-token format for the API. Do not accept agent, widget, M2M or unrelated OAuth tokens on user routes.
2. Verify JWT signature using the WorkOS-published JWKS for the configured AuthKit environment. Require the exact configured issuer and API audience/resource indicator. Require and validate `sub`, `exp`, and any other claims needed by the selected token profile. Reject algorithm/key mismatches, malformed tokens, missing claims, wrong issuer/audience, expired or not-yet-valid tokens, and unknown token purpose.
3. Obtain issuer, audience, JWKS/auth domain and client/environment identifiers from validated deployment configuration. Never guess the issuer from a decoded, untrusted token. WorkOS custom auth domains can change the issuer; configure the exact value from the environment's documented token profile.
4. Map the verified `iss` + `sub` pair to exactly one active internal account using the external-identity repository. Do not map by email, display name, client-supplied account ID, or organization slug.
5. Treat `org_id`, `role`, and `permissions` claims as provider context only. Resolve the requested internal organization and active internal membership from VOLITION VECTOR persistence, then evaluate the existing shared permission policy. Never let provider roles silently grant internal financial, moderation, ownership, or administrative authority.
6. Populate the existing trusted request principal only after all required credential and active-account checks succeed. Keep `IdentityContextGuard` as a shape/context guard, not an authenticator. Missing provider configuration, JWKS failures, lookup failures, inactive accounts and invalid tokens fail closed.
7. Complete authorization before opening a tenant-scoped transaction. Continue to use transaction-local tenant context and forced RLS. Derive the actor only from the verified internal principal.
8. Implement session invalidation explicitly. Local JWT signature/claim validation alone cannot establish immediate revocation. Use a documented revocation/introspection strategy or a bounded token lifetime with a durable, fail-closed session denylist/event synchronization design. Define behavior for logout, session termination, account suspension, internal membership deactivation and provider membership deactivation. Do not assume every directory deprovisioning mode revokes sessions automatically.
9. Audit security-relevant identity-link, account-state and membership transitions without recording raw access/refresh tokens, authorization headers, secrets or unnecessary personal data.

### Session and organization lifecycle

- Store browser credentials only using secure, HttpOnly, appropriately scoped cookies in the web application; do not expose refresh tokens to browser JavaScript.
- Define CSRF protection and cookie SameSite/domain policy for the actual web deployment topology before enabling cookie-authenticated mutation routes.
- Treat access tokens as short-lived and validate them on every API request.
- Ensure internal account suspension and internal membership deactivation take effect according to VOLITION VECTOR's own policy, regardless of the provider's organization membership state.
- WorkOS organization membership lifecycle and session revocation behavior must be integration-tested in a sandbox. Directory Sync alone is not equivalent to AuthKit Directory Provisioning; do not rely on directory events as the only offboarding control.
- Keep invitations and organization membership authority in the internal domain until a reviewed synchronization contract explicitly defines source-of-truth and conflict handling.

### Explicitly out of scope

- Selecting or inventing internal role/permission names or financial authority.
- Treating WorkOS organization roles/permissions as authorization for internal resources.
- Live payments, funds movement, ledger posting/refunds or custody actions.
- Enabling protected routes in production or adding production secrets/credentials.
- Trusting email as an immutable identity key.
- A claim that provider selection alone establishes compliance, security certification or production readiness.

## Implementation sequence

1. Add a typed provider configuration schema with strict startup validation; production startup must fail if required WorkOS settings are absent or malformed when the provider is enabled.
2. Implement the WorkOS verifier and NestJS middleware/guard adapter with pinned dependencies and bounded JWKS caching/rotation behavior.
3. Add the external issuer/subject-to-internal-account lookup and active-account check; preserve one-to-one uniqueness in persistence.
4. Integrate the verified principal into the existing request context without weakening current fail-closed guards.
5. Add tests for valid tokens and negative cases: missing/malformed bearer token, invalid signature, unknown signing key, algorithm mismatch, wrong issuer, wrong audience, expired/not-yet-valid token, wrong token purpose, missing subject, unmapped identity, duplicate mapping, suspended account, unavailable JWKS, revocation/session termination and cross-tenant access.
6. Add end-to-end tests proving a valid identity without active internal membership cannot access tenant resources, and that client-supplied account/organization identifiers cannot override server-resolved identity.
7. Validate WorkOS sandbox lifecycle behavior, browser cookie/CSRF controls, deployment configuration, operational monitoring, rate limits and incident procedures.
8. Complete contractual, pricing, data-residency, SLA/support and vendor-exit review before production enablement.

## Existing database and authorization controls

The PostgreSQL adapter is configured only when `DATABASE_URL` is present. It checks at startup that the configured role is not a superuser, does not have BYPASSRLS, does not own tenant tables, and that tenant tables have ENABLE and FORCE ROW LEVEL SECURITY. Runtime credentials must be least-privilege and use verified TLS (`sslmode=verify-full`). Migration credentials remain separate.

The membership mutation command remains behind its application port. Without `DATABASE_URL`, it returns HTTP 503. A missing or invalid verified identity context returns HTTP 401. Missing, cross-tenant and denied membership outcomes remain indistinguishable where the existing policy requires it.

## Acceptance evidence

- Provider configuration is explicit, validated and environment-specific.
- Every protected request verifies a correctly purposed WorkOS token and maps issuer/subject to one active internal account.
- No client-controlled account ID or organization claim bypasses internal membership and permission checks.
- Session revocation and offboarding behavior has an explicit, tested bounded enforcement guarantee.
- Security tests cover all negative cases listed above.
- Existing RLS and tenant-isolation tests continue to pass using the actual runtime database role.
- Production enablement remains blocked until operational and contractual gates are signed off.

## References

- WorkOS AuthKit sessions and access-token claims: https://workos.com/docs/authkit/sessions
- WorkOS AuthKit users and organization memberships: https://workos.com/docs/authkit/users-organizations
- WorkOS directory provisioning lifecycle: https://workos.com/docs/authkit/directory-provisioning
- WorkOS token verification guidance: https://workos.com/docs/authkit/connect/oauth
- VOLITION VECTOR identity and tenancy model: ../identity-and-tenancy.md
- Human decision on journal posting authority: issue #39

## Non-claims

This ADR records an engineering provider selection and implementation boundary. It is not evidence of a deployed WorkOS integration, production credentials, completed legal/privacy review, independent security assessment, DPIA, penetration test, certification, or production readiness.
