# ADR 0004: Invitation lifecycle and token handling

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Volition Vector identity domain

## Context

The identity/tenancy schema already stores invitation token hashes and prevents
owner-role invitations. The API scaffold does not yet implement invitation
issuance, delivery, acceptance or replay protection. These operations must not
reveal whether an email address belongs to an existing account.

## Decision

- Generate a cryptographically random 32-byte token and encode it as canonical
  base64url.
- Store only the SHA-256 digest as a 32-byte value. Never persist or log the raw
  token.
- Invitations may grant admin, member or viewer only; they cannot grant owner.
- Normalize invited and verified email addresses before comparison.
- Use a seven-day expiry, single-use acceptance and explicit revocation.
- Keep at most one pending invitation per organization/email. Issuing a new
  invitation atomically revokes any prior pending invitation for that pair.
- Apply organization authorization and per-actor/organization/email rate limits
  before persistence.
- Deliver the raw token only to the invited address. Delivery adapters must not
  log or persist it in plaintext.
- On delivery failure, revoke the still-pending invitation.
- Return the same generic invalid/unavailable result for unknown, expired,
  revoked, consumed and email-mismatched tokens.
- The authenticated account ID and verified email must come from the
  authentication boundary, never from untrusted request fields.

## Transaction boundary

The repository's `acceptPendingInvitationAtomically` operation must, in one
PostgreSQL transaction, lock the pending invitation, verify token hash,
expiry, revocation/acceptance state and verified-email match, create the
membership, and mark the invitation accepted. The repository must not expose a
read-then-write sequence that permits replay under concurrent requests.

Invitation issuance must re-check the active actor membership and role policy
using server-loaded state. The repository must serialize creates for the same
organization/email and revoke the previous pending row before inserting the
replacement, respecting the database's unique active-email index. The
invitation service's authorizer and rate limiter are ports; their production
adapters are not implemented in this change.

## Consequences and deferred work

The provider-neutral application service can be tested without selecting an
OIDC provider. It is not yet wired to a Nest controller, database repository,
rate-limit backend or email provider. Those integrations and PostgreSQL
concurrency tests remain required before production use.
