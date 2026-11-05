# ADR 0005: PostgreSQL invitation persistence boundary

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Volition Vector identity and data domains

## Context

The invitation application service defines single-use, seven-day, hashed-token
semantics, but its repository port has no PostgreSQL implementation. An
acceptance request initially has no trusted organization ID, while invitation
rows are protected by organization RLS.

## Decision

- Add a narrowly-scoped SELECT RLS policy that exposes an invitation row only
  when the transaction-local app.invitation_token_hash setting equals the
  row's SHA-256 token hash encoded as hexadecimal.
- Use that lookup only to discover the organization ID. Set app.tenant_id from
  the database row before locking or changing tenant data, then re-read the
  invitation under normal tenant RLS.
- Serialize invitation replacement for an organization/normalized-email pair
  with a transaction-scoped advisory lock, revoke prior pending rows and insert
  the replacement in one transaction.
- Accept an invitation by locking the tenant-scoped row, checking expiry and
  state, verifying the active account and verified external-identity email,
  creating the membership, consuming the invitation and appending an audit
  event in one transaction.
- Invalid, expired, revoked, consumed, email-mismatched and duplicate-member
  cases return the same unavailable result.

## Security boundary and limitations

The application must derive account ID and verified email from its
authentication boundary; this adapter does not authenticate a user or enforce
the separate organization invitation authorization and rate-limit ports.
Runtime database access must remain non-owner, without BYPASSRLS. The token
lookup policy is not a substitute for those application checks.

The migration and adapter require PostgreSQL integration tests under the
non-owner runtime role. The existing CI suite will exercise the new lookup
policy; repository transaction behavior has unit coverage. Concurrent
acceptance and replacement race tests remain required before production use.
