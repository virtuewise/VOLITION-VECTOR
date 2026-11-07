# ADR 0020: Participant-scoped project workspace read model

- Status: Accepted
- Date: 2026-11-07
- Decision owners: VOLITION VECTOR engineering

## Context

The project workspace and milestone tables, their tenant foreign keys, participant read policies, and provider submission constraints are defined by the project-workspace migration. The shared database package does not yet expose a typed project read repository. The API also does not yet have a trusted identity provider or middleware that can establish an authenticated account context.

A tenant-only query is insufficient for participant data. The tenant read policies are permissive for organization-scoped access, so a project query must also constrain the client or provider account explicitly.

## Decision

Add a read-only PostgreSQL repository for listing and retrieving project workspaces and listing their milestones for a participant. Every operation:

1. Validates organization, project, and account identifiers.
2. Uses the shared transaction helper to set transaction-local tenant context.
3. Sets the transaction-local account context used by participant RLS policies.
4. Adds an explicit participant predicate to the SQL query, including the project join for milestone reads.
5. Uses bound parameters and bounded pagination.
6. Releases or rolls back connections through the shared transaction helper.

The repository deliberately exposes no create, update, acceptance, payment, or cancellation operations. It does not infer authentication or membership authorization from an account ID. Callers must pass an account identifier from a trusted authenticated principal.

## Consequences

- The database package gains a typed read model that can be exercised independently.
- Participant predicates remain explicit even when tenant RLS permits organization reads.
- The project API controller and all write transitions remain deferred until trusted identity middleware, active-account resolution, membership authorization, and audit-event semantics are implemented and tested.
- This ADR is an implementation boundary, not evidence of a production identity integration or production readiness.
