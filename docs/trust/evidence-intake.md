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

New records enter as `submitted`. A separate `trust_evidence_decisions` table now records append-only decision history (`verified`, `rejected`, `revoked`, `expired`) with reviewer and timestamp metadata. Subjects can read only decisions attached to their own evidence; organization reads remain tenant-scoped through the evidence record. The runtime role receives SELECT only on this history and cannot insert, update, or delete decisions. A database guard also rejects self-review and decisions made by suspended or closed reviewer accounts, including if a future privileged writer is introduced. A future increment must add a narrowly scoped reviewer authorization boundary and same-transaction audit events before any runtime decision write or evidence status transition is enabled. Issuer authority checks, revocation/expiry semantics and reviewer role authorization remain deferred; the database self-review/inactive-account guards are defense-in-depth only and do not grant review permission.

## Deferred

Organization verification, identity-provider integrations, credential standards and issuer registry, file upload/storage, evidence scanning, review queues, appeals, reputation scoring, public badges, and production verification are not implemented by this increment.
