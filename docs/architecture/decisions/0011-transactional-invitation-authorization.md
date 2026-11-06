# ADR 0011: Transactional invitation authorization

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Identity and platform engineering

## Context

A preflight authorization call in the invitation application service can
become stale if an administrator is demoted or suspended before the invitation
write commits. Membership role/status changes already serialize on a
tenant-scoped PostgreSQL advisory lock and evaluate current actor, target and
owner state inside their transaction.

## Decision

- Invitation creation takes the exact same transaction advisory lock key as
  membership mutations: `organization-memberships:<canonical-tenant-uuid>`.
- Under that lock and tenant RLS, load the inviter membership row with
  `FOR UPDATE`, then load the active-owner count.
- Evaluate the shared `canManageOrganizationMembership` policy with action
  `invite`, current inviter role/status and requested invitation role before
  touching invitation rows.
- A missing actor membership, invalid database state, invalid owner count or
  false policy result aborts the transaction with a generic authorization
  error. The database repository defaults to deny if no policy callback is
  supplied.
- Only after authorization, acquire a second namespaced advisory lock for the
  canonical tenant UUID and normalized email, revoke the previous pending
  invitation and insert the new token hash.
- A PostgreSQL-backed distributed rate limiter is implemented with separate
  actor/hour and email/day fixed windows, hashed scope identifiers, atomic
  upserts, tenant RLS and seven-day opportunistic cleanup. Defaults are
  configurable at construction.
- Keep the invitation API unexposed until trusted identity context and
  notification/outbox integrations are selected and tested. The rate-limit
  adapter is registered as a provider but does not yet gate public traffic.

## Lock ordering

All code that mutates organization membership or creates invitations must
acquire the organization-membership lock before row locks. Invitation creation
then acquires its email-specific lock. Future operations must preserve this
ordering to avoid introducing lock-order deadlocks.

## Security and operational boundaries

The notifier remains a provider port; no mail service is configured.
OIDC/session verification and verified email claims remain unconfigured.
This ADR does not authorize production use.
