# Trust evidence intake foundation

## Scope

The first Trust engine increment accepts private evidence references for an individual's identity, qualifications, demonstrated capability, and work history. It deliberately does not issue credentials, verify issuers, adjudicate evidence, or expose public trust badges.

## Security and data handling

- Evidence belongs to one subject account and is submitted by that same account.
- Evidence is private by default and protected by forced PostgreSQL RLS.
- A caller can read only evidence for the transaction-local account context. Organization-scoped reads are additionally bounded by the transaction-local tenant context.
- The runtime database role receives SELECT and INSERT only. It receives no UPDATE or DELETE grant, and there are no RLS policies for those operations.
- Store only an opaque private object-storage locator in the database. Do not store evidence bytes, public URLs, signed URLs, access tokens, or unnecessary personal data in this record.
- The locator is not itself proof that the referenced object is safe or authentic. Object authorization, malware scanning, retention, and issuer verification remain separate controls.

## Lifecycle boundary

New records enter as `submitted`. The schema reserves review statuses and reviewer metadata, but runtime review transitions are intentionally unavailable. A future increment must implement reviewer authorization, append-only decision events, transactional audit events, issuer authority checks, revocation/expiry handling, and integration tests before enabling status mutation.

## Deferred

Organization verification, identity-provider integrations, credential standards and issuer registry, file upload/storage, evidence scanning, review queues, appeals, reputation scoring, public badges, and production verification are not implemented by this increment.
