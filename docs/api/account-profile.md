# Account profile API

## Authentication

Both endpoints require a valid WorkOS user access token. The API verifies the
token issuer and configured resource audience, resolves the exact issuer/subject
pair to one active internal account, and then applies the identity-context
guard.

The account ID is taken only from that verified server-side principal. These
routes do not accept an account ID, organization ID or tenant ID from the
client.

## Read profile

`GET /v1/me/profile`

Returns the authenticated account's private profile:

```json
{
  "accountId": "11111111-1111-4111-8111-111111111111",
  "displayName": null,
  "locale": "en",
  "timeZone": "UTC",
  "updatedAt": null
}
```

A profile row is not created by GET. If no row exists, the API returns the
documented safe defaults.

## Update profile

`PATCH /v1/me/profile`

Accepted fields:

| Field         | Rules                                                        |
| ------------- | ------------------------------------------------------------ |
| `displayName` | Optional string or null; 1–120 printable characters when set; null clears it |
| `locale`      | Optional canonicalizable BCP 47 locale, maximum 35 characters |
| `timeZone`    | Optional valid IANA time-zone identifier, maximum 64 characters |

At least one field must be supplied. Unknown fields are rejected by the global
NestJS validation pipe. Empty strings are not a clearing operation; send null
for displayName.

The response is the saved profile. A no-op patch returns the existing profile
without adding an audit event.

## Security and persistence

- Profile rows are private and use PostgreSQL ENABLE and FORCE RLS with
  transaction-local `app.account_id`.
- The account context is parameterized and derived from the verified principal.
- Profile writes and a minimal account audit event commit in one transaction.
- Audit metadata records changed field names only, never profile values.
- The runtime role may SELECT/INSERT/UPDATE account profiles but may not DELETE
  or TRUNCATE them.
- The runtime role may INSERT account audit events only; it may not SELECT,
  UPDATE, DELETE or TRUNCATE them.
- The API startup guard fails closed if the account-owned tables lack forced
  RLS, are owned by or assumable by the runtime role, or the exact grants are
  not present.

This API does not publish profiles to marketplace discovery. Public profile
fields, avatars, biographies, contact details, profile deletion and
retention/export workflows remain deferred pending product and privacy review.
