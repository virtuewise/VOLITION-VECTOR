# Opportunity application API

Status: implemented as an authenticated API boundary; staging browser/API verification and production enablement remain separate release gates.

All routes are under the global `/v1` prefix and require a valid WorkOS bearer access token. The API verifies the token, resolves the exact issuer/subject mapping to one active internal account, and derives the actor account ID from that server-side principal. Client-supplied actor, applicant, reviewer, tenant or organization membership identifiers are never accepted as identity evidence.

## Submit an application

`POST /v1/organizations/{organizationId}/opportunities/{opportunityId}/applications`

Body:

```json
{
  "coverNote": "Optional application note, up to 5000 characters."
}
```

- `coverNote` is optional and may be null.
- The repository accepts only a published, public and unexpired opportunity in the specified organization.
- Applicants do not need membership in the hiring organization.
- The database enforces one application per applicant and opportunity.
- The opportunity is locked while availability is checked and the application is inserted.
- Submission and its audit event commit in the same transaction.

A duplicate application or an opportunity that is no longer available returns HTTP 409. Invalid body data returns HTTP 400.

## List my applications

`GET /v1/me/opportunity-applications?limit=20&offset=0`

Only `limit` and `offset` are accepted. Defaults are 20 and 0. The repository bounds the page size to 50 and the offset to 10,000. The account ID comes from the verified principal, and PostgreSQL account-scoped RLS limits results to that applicant.

## Withdraw my application

`POST /v1/organizations/{organizationId}/opportunity-applications/{applicationId}/withdraw`

Only the verified applicant can withdraw their own application, and only while its status is `submitted`. The database applies a transaction-local applicant actor context and the update is audited atomically. Missing and non-withdrawable records are returned as HTTP 404 to avoid disclosing another applicant's record.

## Review an application

`PATCH /v1/organizations/{organizationId}/opportunity-applications/{applicationId}/review`

Body:

```json
{
  "decision": "shortlisted"
}
```

Allowed decisions are `shortlisted`, `rejected` and `accepted`. Only active organization owners and admins may review. Membership and application state are loaded inside the repository transaction and rechecked under the organization membership advisory lock. The deny-by-default shared permission policy is applied before mutation. Review and audit event commit atomically.

## Error behavior

- `400`: invalid UUID, body or query input.
- `401`: missing or invalid authenticated principal.
- `403`: an authenticated organization actor lacks review permission.
- `404`: application not found or not available for the requested applicant transition.
- `409`: duplicate submission or invalid opportunity/application state transition.
- `503`: WorkOS verification, identity mapping or database persistence is not configured/available.

## Privacy and scope

Application records and cover notes are private personal data. They are not part of public opportunity projections. This API slice does not add CV/file uploads, automated screening or ranking, interviews, offers, messaging, notifications, retention/deletion workflows or legal approval. Those remain separate product and governance milestones. No production readiness or compliance claim follows from this implementation.
