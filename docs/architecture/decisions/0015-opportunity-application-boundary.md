# ADR 0015: Opportunity application tenancy and actor boundaries

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Opportunity and platform engineering

## Context

The Days 31–60 roadmap milestone includes applications and proposals. An
application is private to its applicant and the organization that owns the
opportunity. Applicants are not required to be members of the hiring
organization, so application data needs two distinct read principals.

## Decision

- Store applications in `opportunity_applications`, tenant-scoped to the
  organization owning the opportunity and linked by a composite
  `(organization_id, opportunity_id)` foreign key.
- Snapshot opportunity slug, title and type at submission so a later listing
  edit or closure does not rewrite the applicant's record.
- Permit one application per applicant per opportunity. A withdrawn
  application does not silently create a second application.
- Submission is permitted only while the opportunity is published, public
  and not expired. The opportunity row is locked while submission is checked
  and inserted.
- Applicants may read only their own applications using transaction-local
  `app.account_id` context. Organization staff may read applications only
  within their `app.tenant_id`.
- Applicant inserts require matching account and tenant context plus
  `app.actor_type = 'applicant'`. Applicant updates are restricted by RLS to
  withdrawing their own submitted application.
- Organization review requires active owner/admin membership revalidated
  under the organization-membership advisory lock and
  `app.actor_type = 'organization'`. Review transitions are submitted or
  shortlisted to shortlisted, rejected or accepted.
- Record submission, withdrawal and review events in `audit_events` in the
  same transaction as the state change.
- Expose repository ports through the Opportunity module, but do not add HTTP
  routes until the trusted OIDC/session principal is configured. The
  repository inputs must be derived from that authenticated principal by the
  future application service, never accepted as caller-controlled identity.

## Boundaries

This milestone does not add CV/file uploads, automated screening, ranking,
messaging, interviews, offers or appeals. No automated suitability decision
is performed. Applications contain personal data and require a DPIA, retention
schedule, access logging, deletion/erasure workflow and legal review before
pilot use.

## Validation

The migration enables and forces RLS with separate applicant and organization
policies. PostgreSQL integration tests verify applicant-only reads,
tenant-scoped organization reads, cross-tenant insert rejection and
applicant identity binding. Repository tests cover submission, withdrawal,
review authorization and audit atomicity.
