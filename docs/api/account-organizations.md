# Account organization discovery API

## List my organizations

`GET /v1/me/organizations`

Requires a valid WorkOS user access token. The API verifies the token, resolves its issuer/subject pair to exactly one active internal account, and derives the account ID from that verified principal.

The request accepts no account ID, organization ID, tenant ID, organization slug or WorkOS organization claim as authority.

Example response:

```json
[
  {
    "organizationId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "name": "Example Studio",
    "slug": "example-studio",
    "role": "owner"
  }
]
```

The API returns only organizations whose internal organization is active, whose membership for the authenticated account is active, and whose account remains active. An account with no active organizations receives an empty array. The response does not include member lists, invitation details, financial records, private profile data or tenant resources.

## Database isolation

The repository runs in a transaction with transaction-local `app.account_id`; it does not set `app.tenant_id` and does not accept a tenant ID from the request.

Two SELECT-only RLS policies support discovery:

- `organization_memberships_account_discovery` exposes the authenticated account's own active memberships only when no tenant context is set and the account is active.
- `organizations_account_discovery` exposes active organizations only when the authenticated account has an active membership.

The policies do not grant writes. Existing tenant policies remain authoritative for tenant-scoped reads and mutations. The API startup guard fails closed if either policy or the required SELECT privileges are absent.

## Authorization boundary

The organization ID returned by this endpoint is a navigation identifier, not a capability or proof of authorization. Every later tenant request must independently resolve the verified account's active membership, verify the resource's owning organization and evaluate the requested action-specific permission inside the same tenant transaction, under the appropriate locks, before mutation.

Do not substitute a WorkOS organization claim, client-supplied organization ID or slug for the internal authorization check.
