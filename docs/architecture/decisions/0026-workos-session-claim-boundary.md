# ADR 0026: Preserve verified AuthKit session identity at the API boundary

- Status: Proposed; session revocation rollout remains gated
- Date: 2026-11-13
- Decision owners: Volition Vector identity and API domains

## Context

The WorkOS verifier validates a signed user access token, exact issuer and configured API audience, then maps the verified issuer/subject pair to an active internal account. The verified request principal previously retained only the internal account ID.

That discarded the AuthKit session ID (`sid`) and token ID (`jti`) before domain controllers received the principal. It also left the API boundary without explicit checks that the verified payload contained the documented session lifetime and that it was a user token profile.

WorkOS documents `sid`, `jti`, `exp` and `iat` on AuthKit access tokens. Agent tokens use a distinct `sub_profile` value; user tokens omit it or carry `user`.

## Decision

1. Continue using the WorkOS Node SDK's `verifyAccessToken` as the cryptographic verifier. Do not decode an unverified JWT to establish identity.
2. Require non-empty `sid` and `jti` values (maximum 256 characters) on every protected human-user API request.
3. Require finite positive NumericDate `exp` and `iat` values, require `exp > iat`, and reject expired tokens. Allow at most 30 seconds of clock skew for future `iat`; rely on the pinned WorkOS SDK's `jose.jwtVerify` defaults for `exp` and `nbf` validation because its `verifyAccessToken` API exposes no clock-tolerance option.
4. Accept only an absent `sub_profile` or the explicit `user` profile. Reject agent and unknown token profiles on human-user routes.
5. Preserve the verified session ID and token ID from the verifier through `WorkOSAuthenticationGuard` and `IdentityContextGuard`. Never accept either identifier from request body, query or path parameters.
6. Keep account and organization authorization based on internal VOLITION VECTOR records and policies. Session metadata is not a role, permission or tenant selector.
7. Do not log raw tokens or session identifiers. If correlation is needed, use a separately reviewed pseudonymous logging strategy.

## Security and rollout boundaries

This change makes session identity available to later session lifecycle work; it does not implement logout, remote session revocation, a local session denylist, introspection, back-channel logout or account recovery.

A WorkOS session revocation request requires a server-side WorkOS API credential. The current repository change does not provision or read that secret and does not call WorkOS management APIs. Also, local JWT verification alone can continue accepting an already-issued access token until its `exp`; provider-side refresh-token revocation must not be represented as immediate API-token invalidation.

Before session revocation is enabled, a separate reviewed implementation must select and test the API enforcement strategy (for example, a durable local session denylist or a provider-backed validation design), define outage behavior, enforce account suspension and session termination semantics, and test the maximum post-revocation acceptance window in a WorkOS sandbox.

## Consequences

- Protected HTTP requests now require the complete documented user-session claim set.
- Domain code can distinguish a verified account principal's current session and token without trusting client-supplied values.
- Existing internal service calls may continue to construct account-only principals; HTTP guards always populate session metadata.
- No database migration, dependency update, external credential, WorkOS API call or production configuration change is introduced.

## References

- WorkOS AuthKit sessions: https://workos.com/docs/authkit/sessions
- WorkOS session-token claims: https://workos.com/docs/reference/authkit/session-tokens
- WorkOS Node SDK token verification: https://workos.com/docs/sdks/node
- Pinned WorkOS Node 12.2.0 JWT verifier implementation: https://github.com/workos/workos-node/blob/v12.2.0/src/user-management/user-management.ts#L817-L829
- ADR 0007: WorkOS AuthKit identity boundary
- Human decision on account lifecycle authority and session revocation: issue #64
