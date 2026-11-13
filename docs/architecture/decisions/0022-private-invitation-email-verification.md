# ADR 0022: Private verified-email predicate for invitation acceptance

- Status: Accepted for implementation
- Date: 2026-11-09
- Decision owners: Identity and platform engineering

## Context

Invitation acceptance must confirm that the authenticated account has a verified
external-identity email matching the pending invitation. The PostgreSQL runtime
role deliberately has no direct SELECT access to
external_identities.email or external_identities.email_verified. The existing
repository queried those columns directly, so the acceptance transaction could
not succeed under the documented least-privilege runtime role.

## Decision

- Add a narrowly scoped PostgreSQL SECURITY DEFINER predicate that returns
  only a boolean eligibility result.
- Require the current transaction-local tenant context, invitation ID, exact
  32-byte token hash, active account ID, pending/unexpired invitation state,
  normalized invited email and a verified external-identity email match.
- Use a fixed pg_catalog search path and fully qualify all table references.
- Revoke function execution from PUBLIC; grant it only to the application
  runtime role when that role exists.
- Keep direct runtime SELECT on external identity email columns denied.
- Call the predicate only after the repository has located and locked the
  invitation under its normal tenant transaction context.

## Security and validation

The function does not return email data or expose the token hash. Possession of
the matching token hash is required for a positive result. A missing tenant
context, wrong tenant, wrong token, expired/revoked/consumed invitation,
inactive account, unverified identity or mismatched email returns false.

PostgreSQL integration coverage verifies the runtime role can execute the
predicate without direct email-column SELECT, that PUBLIC cannot execute it,
and that tenant, token, email and verified-identity mismatches fail closed.

The migration is re-applicable for the integration harness, while the tracked
migration runner remains responsible for checksum enforcement and ordered
application in deployed environments. No API endpoint or production email
delivery provider is enabled by this change.
