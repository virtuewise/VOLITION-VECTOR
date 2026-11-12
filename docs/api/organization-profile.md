# Private organization profile API

## Scope

The first organization-profile slice stores private workspace metadata. It does not publish organization pages or expose profile data through marketplace projections.

## Authentication and authorization

Both routes require the WorkOS access-token guard and the internal identity-context guard. The actor account ID comes only from the verified internal principal; the API accepts no actor or tenant identifier in the request body.

- Active organization members with the shared \`organization:read\` permission may read.
- Active organization owners and administrators with \`organization:update\` may update.
- Suspended accounts, suspended organizations, inactive memberships, cross-tenant requests and unknown states fail closed.
- Organization and membership rows are locked in the same transaction as the profile operation; the current account status is rechecked there without requiring UPDATE privileges on the global accounts table. PostgreSQL tenant RLS is set transaction-locally.

## Routes

- \`GET /v1/organizations/{organizationId}/profile\`
- \`PATCH /v1/organizations/{organizationId}/profile\`

The PATCH body accepts only the fields below. Unknown fields are rejected by the existing global validation pipe.

| Field | Type | Rule |
|---|---|---|
| \`description\` | string or null | 1–2000 printable characters |
| \`websiteUrl\` | string or null | HTTPS URL; credentials are rejected |
| \`countryCode\` | string or null | Two-letter code, normalized uppercase |
| \`locale\` | string | Canonical BCP 47 locale; default \`en\` |
| \`timeZone\` | string | Valid IANA time zone; default \`UTC\` |

An organization with no stored profile receives safe defaults on GET; GET does not create a row.

## Persistence and audit

The \`organization_profiles\` table uses the organization ID as its primary key and foreign key. PostgreSQL ENABLE and FORCE RLS bind rows to \`app.tenant_id\`. The runtime role receives SELECT, INSERT and UPDATE only; DELETE and TRUNCATE are denied.

Profile writes and append-only \`audit_events\` insertion occur in one tenant transaction. Audit metadata records changed field names only, not submitted profile values. No-op PATCH requests do not append audit events.

## Deferred

Public organization pages, logo/avatar storage, legal entity details, verification, contact-person data, public contact information, search indexing, media upload, retention/export/deletion workflows and jurisdiction-specific privacy decisions remain out of scope. No public profile is inferred from this private workspace record.
