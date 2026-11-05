# ADR 0003: Organization membership role-management boundaries

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Volition Vector platform architecture

## Context

The initial organization RBAC policy grants both owners and administrators the
`members:manage` permission. That permission alone is too broad to authorize
every membership operation: an administrator must not promote themselves or
another member to owner, revoke an owner, or grant another administrator
equivalent authority. Removing or suspending the final active owner can also
leave an organization without an accountable owner.

## Decision

- Keep the existing deny-by-default permission check as the first authorization
  gate, including active membership, tenant equality and explicit denies.
- Apply a second, operation-aware membership policy before invite, role change,
  suspension, revocation or reactivation.
- Invitations cannot grant the owner role; an owner must be assigned through
  an authorized existing-membership role change.
- Administrators may manage member and viewer memberships only. They cannot
  create, change, suspend or revoke owner or administrator memberships.
- Owners may manage other roles, but cannot modify their own membership through
  this policy.
- An operation that would demote, suspend or revoke the final active owner is
  denied. At least one active owner must remain.
- Unknown actions, malformed target state and invalid owner counts fail closed.
- Target membership, target role and active-owner count must be loaded by the
  server from authoritative storage. Client-supplied role or count values are
  never authorization evidence.

## Enforcement boundary

`canManageOrganizationMembership` is a pure policy helper, not a database
transaction or persistence layer. Callers must load the target membership and
active-owner count, evaluate the helper and perform the mutation in the same
database transaction. The concrete service must serialize concurrent owner
changes (for example, by locking the organization row) so two simultaneous
requests cannot both observe two owners and remove both.

The helper does not authenticate the principal, verify organization membership
from storage, or set PostgreSQL tenant context. Those checks remain required
before mutation.

## Consequences

- Role escalation through a generic `members:manage` permission is constrained
  by explicit target-role rules.
- Owner continuity is expressed as a reusable policy and has negative-path
  unit coverage.
- Production use remains blocked until the repository-backed service enforces
  the same-transaction and concurrency requirements with PostgreSQL integration
  tests using the non-owner runtime role.
