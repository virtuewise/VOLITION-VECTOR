# ADR 0013: Opportunity listing persistence and public read boundary

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Opportunity and platform engineering

## Context

The roadmap's Days 31–60 milestone starts core opportunity workflows with
listings and search. Listings are owned by an organization, but published
public opportunities must be discoverable without exposing draft, private or
creator-account data.

## Decision

- Store employment, project, tender, partnership and volunteering listings in
  the tenant-owned `opportunities` table.
- New records begin as drafts. An active owner, admin or member may create a
  draft. A creator member may edit only their own draft; owners/admins may edit
  drafts or paused listings. Only owners/admins may publish, pause, close or
  archive, with explicit allowed source states.
- Revalidate the actor's active organization membership inside the same
  transaction as create/publish, after taking the same organization-membership
  advisory lock used by membership mutations and invitation creation.
- Append an audit event in the same transaction as each create, edit or
  lifecycle state transition.
- Enforce tenant writes and private/draft reads with ENABLE/FORCE RLS.
  A separate SELECT policy permits only rows with status `published` and
  visibility `public` to be read across tenants.
- Expose a `security_invoker` view named `public_opportunities` that projects
  only public listing fields and excludes creator account identifiers.
- Use PostgreSQL generated `tsvector` plus a GIN index for initial full-text
  discovery; do not add OpenSearch before measured need.
- Keep the API write repository behind a NestJS provider. Only the public
  read-only `GET /v1/opportunities` route is enabled in this milestone.

## Boundaries

The public route returns only published, public, non-expired listings through
the invoker-security view. Create/publish repository methods are not exposed
as HTTP routes until the trusted identity provider and authenticated request
context are configured. Application flows, proposals, messaging, project
workspace, moderation, paid boosts and matching are later milestones.
Compensation values are optional and are not interpreted as net pay or a
guarantee of employment.

## Validation

The PostgreSQL migration enables and forces RLS, applies tenant and public
read policies, and creates the restricted view. Integration tests verify
tenant isolation, public visibility, draft exclusion and cross-tenant write
rejection. Unit tests cover repository transactions and lifecycle policy.
