# Project workspace participant read API

The project workspace API is a read-only participant surface. It does not create projects, mutate milestones, accept deliverables, request revisions, cancel projects, or post financial records.

All routes require a valid WorkOS AuthKit bearer access token. The API resolves the verified issuer/subject pair to an active internal account. The account identifier is taken only from the resulting server-side principal; request bodies, query parameters and path segments cannot select an actor account.

## Routes

### List participant projects

`GET /v1/organizations/{organizationId}/projects?limit=20&offset=0`

Returns projects in the specified organization for which the authenticated account is the named client or provider participant.

- `organizationId` must be a UUIDv4.
- `limit` defaults to 20 and must be between 1 and 50.
- `offset` defaults to 0 and must be a safe integer between 0 and 10,000.
- Only `limit` and `offset` query parameters are accepted.

### Get a participant project

`GET /v1/organizations/{organizationId}/projects/{projectId}`

Returns one project only when the authenticated account is its named client or provider participant. A missing project and a project for which the caller is not a participant both return HTTP 404.

Both path identifiers must be UUIDv4 values.

### List participant project milestones

`GET /v1/organizations/{organizationId}/projects/{projectId}/milestones?limit=50&offset=0`

Returns milestones in sequence order after the API has confirmed that the authenticated account can read the parent project.

- `limit` defaults to 20 and must be between 1 and 50.
- `offset` defaults to 0 and must be a safe integer between 0 and 10,000.
- Only `limit` and `offset` query parameters are accepted.
- A missing project and a project for which the caller is not a participant both return HTTP 404.

## Authorization and data boundaries

The organization and project path identifiers are locators, not capabilities. The API applies both `WorkOSAuthenticationGuard` and `IdentityContextGuard`. It passes only the verified internal account ID to the repository.

Each repository operation uses a transaction-scoped tenant context and a transaction-local participant account context. SQL includes explicit client/provider predicates in addition to PostgreSQL row-level security. Milestone reads join through the participant-filtered parent project. Every user-controlled value is parameterized.

The API does not expose organization-wide project administration. Organization-wide reads, project creation and every project or milestone state transition require separately reviewed authorization and audit semantics.

## Error behavior

- HTTP 400: malformed UUIDs, unknown query keys, invalid pagination.
- HTTP 401: missing or invalid WorkOS user access token or active internal identity.
- HTTP 404: project missing or caller is not a named participant.
- HTTP 503: WorkOS identity verification or project persistence is unavailable/unconfigured.

No live Staging or Production API origin is implied by this contract. A passing CI run is not a substitute for browser/API smoke testing against a configured environment.
