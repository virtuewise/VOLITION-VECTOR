# ADR 0012: PostgreSQL-backed invitation rate limiting

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Identity and platform engineering

## Context

Invitation creation needs distributed abuse controls. An in-process limiter
would reset across API replicas and would not provide consistent enforcement.
The project already treats PostgreSQL as the authoritative transactional
store and requires tenant RLS on tenant-owned data.

## Decision

- Store rate-limit counters in
  `organization_invitation_rate_limits`, protected by ENABLE and FORCE RLS.
- Use separate, domain-separated SHA-256 scope hashes for actor UUID and
  normalized target email. Never store raw email in the counter table.
- Atomically increment fixed-window counters using PostgreSQL upserts keyed by
  organization, scope and digest; concurrent API instances serialize on the
  unique row.
- Default to at most 10 invitations per actor per organization per hour and
  3 invitations per target email per organization per day. Both windows and
  limits are configurable in the adapter constructor.
- Commit both counters before returning a rate-limit error, so rejected
  attempts continue to count. Return a retry interval for only the exceeded
  scope or scopes.
- Opportunistically delete counters inactive for more than seven days within
  the current tenant transaction.

## Security and operational boundaries

The module registers the PostgreSQL limiter behind the invitation rate-limit
port. No invitation HTTP route or application-service provider is enabled yet,
so these limits are not represented as active public traffic controls. A
notification/outbox adapter and trusted OIDC/session identity remain
unconfigured. The production runtime role must receive least-privilege
SELECT/INSERT/UPDATE/DELETE grants on the new RLS-protected table.

## Validation

The migration enables and forces tenant RLS. PostgreSQL integration tests
apply the migration, verify the runtime role's forced-RLS startup gate, check
tenant-isolated visibility and reject cross-tenant inserts. Unit tests cover
hashed scopes, fixed-window counters, commit-on-rejection and retry intervals.
