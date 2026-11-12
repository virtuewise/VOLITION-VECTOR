# ADR 0025: Private organization profile persistence

- Status: Proposed
- Date: 2026-11-12
- Decision owners: Identity and Workspace engineering
- Related plan: Days 16–30, Identity and workspace
- Related ADRs: 0002, 0007, 0023

## Context

The organization row currently contains a legal/workspace name, slug and lifecycle status. Organization members need a small editable workspace profile, but this first slice must not create a public organization directory, bypass internal membership permissions or make unreviewed legal/contact claims.

## Decision

Add a private profile keyed by organization ID with:
- optional description (maximum 2,000 printable characters);
- optional HTTPS website URL (no embedded credentials);
- optional two-letter country code;
- canonical BCP 47 locale (default \`en\`);
- validated IANA time zone (default \`UTC\`).

The initial fields are operational workspace metadata, not verified legal-entity attributes. The API exposes only authenticated GET and PATCH routes under the organization workspace.

## Authorization and transaction boundary

- Resolve the actor only from the verified internal principal.
- Require an active account, active organization and active membership.
- Use the shared \`canAccessOrganization\` policy with \`organization:read\` for GET and \`organization:update\` for PATCH.
- Lock organization and membership rows inside the same transaction that reads or writes the profile, and recheck current account status there without granting the runtime role UPDATE privileges on the global accounts table.
- Set PostgreSQL \`app.tenant_id\` transaction-locally and rely on ENABLE plus FORCE RLS.
- Unknown, missing, inactive and cross-tenant state fails closed without disclosing organization existence.

Owners and administrators can update. Any active member with organization-read permission can read. No provider role or client-supplied permission claim is trusted.

## Audit and database controls

Profile write and audit append commit or roll back together. Audit metadata contains changed field names only, never profile values. No-op updates do not emit events. The profile table is tenant-owned; the runtime role receives SELECT/INSERT/UPDATE and is denied DELETE/TRUNCATE. The migration owner remains separate from application runtime credentials.

## Consequences and deferred decisions

The private profile is not added to public opportunity/service projections. Public publication, logo storage, verified legal identity, contact-person details, address, social links, search indexing, media upload, retention/export/deletion, privacy notices and jurisdictional legal review remain separate product and governance decisions.

This ADR does not establish a legal basis, certification, production readiness or a public organization directory.
