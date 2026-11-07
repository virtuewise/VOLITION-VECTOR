# ADR 0017: Project workspace and milestone boundaries

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Project and platform engineering

## Context

The core opportunity workflow needs a controlled hand-off from an accepted
application into delivery. Project records contain private commercial and
personal information and must be visible only to the organization tenant and
the two named participants.

## Decision

- A project workspace belongs to the organization that owns the originating
  opportunity and references exactly one opportunity application.
- A database trigger requires the source application to be accepted, the
  provider to be that application's applicant, and the project opportunity to
  match the application opportunity. This prevents direct SQL callers from
  creating projects from pending/rejected applications or assigning a
  different provider.
- The client and provider must be distinct account principals. The client is
  selected by the future authorized project-creation service; this migration
  does not infer the client's organization role.
- Only one project workspace may be created for an application.
- Organization context can read and manage projects within its tenant.
  Client/provider account context can read only projects in which that account
  is a named participant.
- Milestones are ordered and tenant-bound to their parent project. The
  organization manages milestone definitions and acceptance; only the named
  provider can submit work on an active project. A database update guard
  prevents provider submissions from changing milestone scope, sequence,
  due date or organization acceptance fields. Organization-side decisions
  include acceptance and revision requests. No milestone delete policy is
  granted, preserving the delivery record.
- Project and milestone tables enable and force PostgreSQL RLS and are added
  to the API startup check that refuses runtime roles when tenant tables do
  not enforce RLS.
- Milestone submission/acceptance workflow events must be appended to the
  audit trail by the future transactional repository before API exposure.

## Boundaries and deferred work

This migration and its RLS integration tests establish persistence boundaries;
they do not yet provide project creation, milestone repository methods,
HTTP routes, attachments, time tracking, invoicing, or notifications. Project
creation must be implemented in a transaction that verifies the source
application and organization authorization. API identity must come from the
trusted authentication/session integration, never request-supplied account IDs.
Provider submission and organization acceptance must write audit events in the
same transaction as state transitions.

Project descriptions and milestone submissions may contain personal or
confidential information. A retention schedule, export/erasure workflow,
access logging, DPIA and legal review are required before pilot use.

## Validation

The PostgreSQL RLS integration suite applies the migration, verifies the
accepted-application trigger, checks participant-only project reads, confirms
non-participants cannot read the workspace, and exercises provider submission
and organization acceptance under distinct transaction-local actor contexts.
