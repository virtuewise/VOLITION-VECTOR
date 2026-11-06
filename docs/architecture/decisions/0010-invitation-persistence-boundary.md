# ADR 0010: Invitation persistence boundary and tenant lock identity

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Identity and platform engineering

## Context

The invitation lifecycle already has provider-neutral orchestration, a
PostgreSQL repository, SHA-256 token hashing, one-time atomic acceptance,
verified-email matching, expiry/revocation checks and audit insertion. The
repository was not exported from the database package, and its create/revoke
paths used the caller's UUID spelling as a text advisory-lock key.

PostgreSQL UUID values are case-insensitive, while text hashes are not. Two
representations of the same tenant UUID could therefore acquire different
advisory locks and defeat serialization of invitation replacement.

## Decision

- Canonicalize organization UUIDs with `normalizeTenantId` before opening a
  tenant transaction and before using them in advisory-lock keys or SQL
  parameters for create/revoke.
- Export `PostgresInvitationRepository` and its persistence record types from
  `@volition/database`.
- Continue storing only the 32-byte SHA-256 token digest. Never return or log
  raw invitation tokens outside the notifier boundary.
- Preserve one-time acceptance as a single transaction that discovers the
  tenant through the narrowly scoped token-hash RLS policy, sets ordinary
  tenant context, locks the invitation, verifies active account and verified
  email, inserts membership, consumes the invitation and appends audit.

## Explicitly deferred

The API does not expose invitation endpoints yet. Invitation creation now
reloads the inviter's membership under the shared organization advisory lock,
loads the active-owner count and applies the shared `members:invite` policy
inside the same transaction as replacement and insertion. The adapter defaults
to deny when no policy callback is configured. The create path is serialized
with membership role/status mutations; per-email replacement has a second,
namespaced advisory lock.

A concrete distributed rate-limit adapter and a notification/outbox adapter
are still required. Acceptance must only receive account ID and verified email
from a trusted authentication boundary; no OIDC/session verifier is selected
or configured. No mail delivery, rate limiting, live invitation API or
production identity integration is claimed complete. Public invitation
revocation is not exposed; the repository's revoke operation remains the
delivery-failure compensation path until its own authorization boundary is
implemented.

## Validation

Unit tests assert uppercase UUID input is normalized for transaction context,
advisory locking and SQL parameters. The repository's PostgreSQL integration
workflow remains a separate check of tenant RLS and transaction behavior.
