# Private Trust evidence read API

This draft exposes one authenticated, read-only endpoint:

GET /v1/me/trust-evidence?limit=20&offset=0

It returns only evidence metadata belonging to the authenticated internal
account and the type/timestamp of any recorded decisions.

## Authentication and authorization

- Both WorkOSAuthenticationGuard and IdentityContextGuard are required.
- The account ID comes only from the verified server-side principal.
- Request query parameters cannot select an account or organization.
- The database transaction sets app.account_id transaction-locally.
- The repository adds an explicit subject_account_id predicate; forced RLS
  remains authoritative.
- A missing database adapter fails closed with HTTP 503.

## Pagination

- limit defaults to 20 and must be an integer from 1 through 50.
- offset defaults to 0 and must be a safe integer from 0 through 10,000.
- Only limit and offset are accepted; repeated and malformed parameters
  are rejected before database access.
- Results are ordered by submission time descending and evidence ID ascending.
- Decision history is ordered by decision time ascending and ID ascending.

Responses include Cache-Control: private, no-store.

## Response minimization

The endpoint returns evidence ID, claim type/title, issuer name/reference,
current status, submission/review timestamps, and decision type/timestamp
history. It never returns the private object locator, reviewer account ID,
reviewer decision note, raw evidence bytes, signed URLs, or access tokens.

## Explicitly deferred

This API does not submit evidence, upload files, mutate evidence status,
create reviewer decisions, verify issuer authority, issue credentials, or
expose public trust badges. No object-storage adapter, ownership check,
malware scanner, retention/deletion workflow, reviewer authorization, appeals
process, or Staging/Production integration is implemented by this draft.
