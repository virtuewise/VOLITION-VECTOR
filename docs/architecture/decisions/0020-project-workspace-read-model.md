# ADR 0020: Participant-scoped project workspace read model

- Status: Accepted
- Date: 2026-11-07
- Decision owners: VOLITION VECTOR engineering

## Context

The project workspace and milestone tables, their tenant foreign keys, participant read policies, and provider submission constraints are defined by the project-workspace migration. The typed participant read repository is implemented in the database package and exported through its public entry point. The API uses the WorkOS authentication guard and active internal-account resolver to establish a trusted account context.

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

- The database package exposes a typed read model through its public entry point.
- The API exposes read-only participant routes for project lists, project details and milestones.
- The controller applies WorkOS authentication and identity-context guards; actor account IDs are derived only from the verified internal principal.
- Project and milestone lists use bounded pagination. Missing projects and non-participant requests share the same HTTP 404 response.
- Participant predicates remain explicit even when tenant RLS permits organization reads.
- Project creation and all milestone write transitions remain deferred until their action-specific authorization and same-transaction audit semantics are implemented and tested.
- This ADR is an implementation boundary, not evidence of a live Staging journey or production readiness.

## Implementation update — 2026-11-15

The participant read repository is exported by the database package. Its project and milestone list operations validate bounded pagination, set tenant and participant account context transaction-locally, use parameterized SQL, and retain explicit participant predicates.

The API read surface is:

- `GET /v1/organizations/{organizationId}/projects`
- `GET /v1/organizations/{organizationId}/projects/{projectId}`
- `GET /v1/organizations/{organizationId}/projects/{projectId}/milestones`

These routes are read-only. They do not grant organization-wide project administration, create projects, submit or accept milestones, request revisions, cancel projects, or post financial records. Staging/Production browser and API smoke tests remain separate release gates.
