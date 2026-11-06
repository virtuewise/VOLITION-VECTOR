# ADR 0014: Service listing persistence and public read boundary

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Marketplace and platform engineering

## Context

The Days 31–60 roadmap milestone includes service listings and discovery.
Services are offered by organizations and may be priced, delivered remotely,
onsite or in a hybrid format. Draft and organization-only offers must not be
discoverable outside their tenant.

## Decision

- Store service offers in a tenant-owned `service_listings` table.
- New records begin as drafts. Active owners, admins and members may create
  drafts. Creator members may edit only their own draft; owners/admins may edit
  drafts or paused offers and publish them.
- Represent pricing explicitly as fixed, hourly, starting-at or quote-based.
  Quote-based offers must not carry a price or currency; priced offers require
  a non-negative amount and a three-letter ISO currency code.
- Enforce tenant writes and private/draft reads with ENABLE/FORCE RLS. A
  separate SELECT policy permits cross-tenant reads only for published,
  public listings.
- Expose a `security_invoker` view named `public_service_listings` with a
  restricted projection that excludes creator account identifiers.
- Use PostgreSQL generated `tsvector` plus a GIN index for initial discovery;
  defer OpenSearch until measured scale or relevance needs justify it.
- Keep create/publish persistence behind a NestJS repository port. Only the
  public read-only `GET /v1/services` route is exposed in this milestone.

## Boundaries

This milestone does not accept proposals, execute contracts, collect payments,
publish reviews or guarantee provider availability. Contracting, escrow,
provider verification, dispute handling, tax treatment and payment execution
remain deferred to the Transaction/Financial, Trust and Project engines.
Public pricing is indicative listing information, not a binding quote.

## Validation

The PostgreSQL migration enables and forces RLS, applies tenant and public
read policies, and creates the restricted invoker-security view. Integration
tests verify cross-tenant write rejection, tenant isolation and exclusion of
private drafts from public discovery. Unit tests cover price validation,
transactional authorization and audit events.
