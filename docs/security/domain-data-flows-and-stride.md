# Domain data-flow and STRIDE baseline

- Status: Engineering draft; review required
- Date: 2026-11-07
- Scope: Identity, marketplace, communication, projects, trust, financial ledger, AI/matching and integrations
- Related: `docs/architecture/overview.md`, `docs/architecture/identity-and-tenancy.md`, `docs/security/threat-model.md`, `docs/security/data-classification.md`
- Decision owner: VOLITION VECTOR engineering and designated security/privacy reviewers

> This document is a structured threat-assessment starting point, not a completed independent security review. Data flows are logical flows derived from the approved architecture and current repository documentation; they are not evidence that every component, provider, control or deployment is implemented. Each domain owner must validate the flow, data classification, threats, controls and residual risk before pilot or production use.

## 1. System context and trust boundaries

### Logical data-flow map

```mermaid
flowchart LR
  U[Web / mobile users] -->|TLS: untrusted request| API[Versioned NestJS API]
  OP[Operators] -->|Privileged access| OPS[Operational control plane]
  API --> ID[Identity adapter and account resolution]
  API --> AUTH[Membership and permission policy]
  API --> DB[(PostgreSQL system of record)]
  API --> CACHE[(Redis cache / rate limits]
  API --> Q[Transactional outbox / workers]
  Q --> MSG[Communication providers]
  Q --> EXT[Identity / credential / payment adapters]
  API --> AI[AI and vector retrieval boundary]
  AI --> VDB[(pgvector / derived indexes)]
  EXT -->|Signed callbacks / webhooks| API
  DB --> AUD[Append-only audit records]
  OPS --> OBS[Logs / metrics / incident evidence]
```

The diagram describes intended logical boundaries. It does not assert that an identity provider, payment provider, credential issuer, production queue, Redis deployment, AI processor or operational control plane is selected or configured.

### Trust boundaries

| ID | Boundary | Untrusted input or risk | Required enforcement |
| --- | --- | --- | --- |
| TB-01 | Browser/mobile to API | User-controlled fields, tokens, object IDs, replay and automation | TLS, schema validation, authentication, rate limits, CSRF protections where applicable |
| TB-02 | Account to account / tenant to tenant | Guessed identifiers, stale membership, confused-deputy access | Trusted principal resolution, active membership, action permission and tenant-scoped SQL/RLS |
| TB-03 | Public projections to private records | Over-fetching, serialization leaks, search/index leakage | Explicit allowlisted projections, field-level classification and access tests |
| TB-04 | API to PostgreSQL / Redis / workers | Privileged credentials, tenant context leakage, stale cache or queue messages | Least-privilege roles, transaction-local tenant context, scoped cache keys and authenticated worker identity |
| TB-05 | Platform to external providers | Provider compromise, misconfiguration, webhook forgery and data over-sharing | Provider adapters, secret isolation, signed callbacks, idempotency and minimum necessary payloads |
| TB-06 | Platform to AI/model services | Prompt injection, training/retention uncertainty, sensitive data disclosure | Data minimization, approved processor terms, isolation, output validation and human review |
| TB-07 | Operator to production | Excess privilege, compromised operator account and untracked access | MFA, just-in-time access, separation of duties, audit and emergency-access review |
| TB-08 | Build/release pipeline to runtime | Dependency compromise, poisoned workflow, artifact substitution | Pinned actions, lockfile, least-privilege CI, SCA/SAST/secret scanning and provenance |

## 2. Domain flows and STRIDE assessment

Threat ratings are qualitative planning priorities, not measured likelihoods. "Required controls" are acceptance criteria unless explicitly identified as an existing repository baseline. Residual risk remains open until controls are implemented and tested.

### 2.1 Identity and organization tenancy

**Flow:** Browser/mobile submits an authentication credential and requested organization context → API identity adapter validates issuer, subject, signature, audience, expiry and session/revocation state → trusted external identity resolves to one active account → membership and permission policy resolve active organization access → transaction sets tenant context → PostgreSQL RLS constrains records → minimal audit event records material actions.

**Data:** Authentication credentials and session metadata (Restricted); external identity subject mapping and account state (Confidential/Restricted); membership and organization records (Confidential); audit metadata (Confidential).

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Stolen, forged, expired or replayed credential impersonates an account | Selected identity/session provider; signature, issuer, audience, expiry and revocation validation; session rotation; MFA/recovery safeguards; negative tests |
| Tampering | Client changes account, organization or role identifiers | Derive account from trusted subject; never trust client tenant/role; server-side permission evaluation; parameterized SQL |
| Repudiation | Sensitive membership or account change cannot be attributed | Append-only, minimal audit event in same transaction as material state change; reliable actor and correlation context |
| Information disclosure | Identity evidence, session material or another tenant's membership is exposed | Restricted evidence storage; no public token/hash exposure; object-level checks; tenant RLS; field allowlists |
| Denial of service | Login, recovery or invitation endpoints are flooded | Per-account/IP/device rate limits, abuse detection, bounded work and safe recovery paths |
| Elevation of privilege | Suspended account, stale membership or forged role reaches protected action | Resolve active account and active membership on every protected request; action-specific deny-by-default policy; revocation tests |

**Repository baseline / gap:** The identity-and-tenancy document describes the authorization sequence and transaction-scoped tenant helper. It explicitly states that the membership API is not authenticated: the current guard validates upstream request shape but does not validate credentials or establish a trusted principal. A production identity provider and middleware remain unselected/unconfigured. This is a release blocker for authenticated workflows.

### 2.2 Marketplace: opportunities, applications and service listings

**Flow:** User submits opportunity/service listing or application → API validates contract and resolves trusted actor/tenant → domain policy authorizes publication, application or state change → PostgreSQL persists tenant-owned data → approved public projection/search exposes only published fields → notifications are emitted through an outbox when implemented.

**Data:** Public listing fields (Public); draft listings, applications, commercial terms and profile details (Confidential); identity and verification evidence (Restricted).

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Attacker applies or edits as another account | Trusted identity and active membership; ownership/participant checks |
| Tampering | Client alters listing owner, status, price or application state | Server-owned fields; validated state transitions; optimistic concurrency/idempotency where needed |
| Repudiation | Publisher or reviewer disputes a material listing/application action | Actor-attributed audit events with transaction coupling |
| Information disclosure | Draft applications or private contact details appear in public search | Explicit public DTOs; search-index allowlists; cross-tenant/object-level tests |
| Denial of service | Listing/application spam exhausts API or moderation capacity | Quotas, rate limits, abuse reporting and bounded search/pagination |
| Elevation of privilege | Ordinary member edits another organization's listing or privileged status | Typed action-specific permission checks and resource ownership verification |

**Open validation:** Public discovery and persistence foundations exist, but full account lifecycle and marketplace workflows are not yet verified end to end. Confirm moderation, abuse, retention and public projection behavior before launch.

### 2.3 Communication and notifications

**Flow:** Participant initiates or reads conversation → API authenticates actor and checks conversation participation → message is validated and persisted → notification intent is recorded transactionally → worker sends minimal notification to configured provider → provider callback is authenticated and deduplicated.

**Data:** Message content, attachments and participant relationships (Confidential); notification destination and delivery metadata (Confidential); sensitive attachments may be Restricted.

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Sender identity or provider callback is forged | Trusted actor identity; provider signature verification; callback secret rotation |
| Tampering | Message, recipient or delivery state is changed after submission | Immutable message authorship; controlled state transitions; signed/validated callbacks |
| Repudiation | Sender disputes message delivery or moderation action | Minimal append-only event history; timestamps and correlation IDs |
| Information disclosure | Non-participant enumerates conversations or notifications reveal message content | Participant-scoped reads; minimal push/email content; private attachment authorization |
| Denial of service | Message floods, large attachments or notification loops | Rate/size limits, malware scanning, quotas and retry ceilings |
| Elevation of privilege | Support/moderation actor reads private conversations without approved purpose | Explicit support permissions, just-in-time elevation, reason capture and audited access |

**Repository baseline / gap:** Conversation persistence and a communication repository/module exist. Complete authenticated participant resolution, notification/consent hooks and abuse/safety controls are not verified as complete.

### 2.4 Project workspaces, milestones and deliverables

**Flow:** Client/provider participant requests workspace or milestone → trusted actor and active membership are resolved → participant and action predicates are checked → tenant transaction reads or changes project state → audit event is committed with material transition → notification intent is queued.

**Data:** Contract scope, project status, milestone details, deliverables and acceptance records (Confidential); attachments and dispute evidence may be Restricted.

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Non-participant claims to be client/provider | Trusted principal; participant relationship derived from persisted project record |
| Tampering | Client changes milestone acceptance or provider changes another party's deliverable | Explicit state machine; actor-specific transition policy; concurrency and idempotency |
| Repudiation | Party denies acceptance, revision or cancellation | Same-transaction audit event, actor, action, target and timestamp |
| Information disclosure | Tenant member who is not a project participant reads project data | Participant predicate in addition to tenant RLS; private attachment authorization |
| Denial of service | Unbounded project/milestone reads or repeated transition requests | Bounded pagination, request quotas and idempotency |
| Elevation of privilege | Participant uses client-supplied account ID to impersonate another participant | Account ID only from trusted principal; active membership and object-level authorization before transaction |

**Repository baseline / gap:** PR #41 proposes a typed, read-only participant-scoped PostgreSQL repository and tests. It deliberately does not authenticate the supplied account ID and does not add API routes or writes. Project creation, milestone transitions, audit semantics and trusted identity remain deferred. Revalidate this section against the merged implementation before marking it complete.

### 2.5 Trust evidence, verification and moderation

**Flow:** User submits evidence → API verifies purpose, consent/legal basis and upload constraints → evidence is stored in private segregated storage → authorized reviewer receives a restricted work item → reviewer decision and rationale are persisted → public projection exposes only approved minimal status → expiry/revocation and retention jobs update access.

**Data:** Identity documents, credentials and verification artifacts (Restricted); reviewer decisions and risk signals (Confidential/Restricted); public trust status (Public only where approved).

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Fraudulent issuer, reviewer or evidence submitter | Issuer registry and proof verification; reviewer identity and role checks |
| Tampering | Evidence or reviewer decision is altered | Integrity metadata, immutable decision history and controlled correction/revocation workflow |
| Repudiation | Reviewer denies a decision or evidence provenance | Attributed append-only decision events and evidence provenance |
| Information disclosure | Private evidence or reviewer identity leaks through API/search/logs | Segregated private storage; narrow reviewer authorization; no evidence in public projections; log redaction |
| Denial of service | Malicious uploads exhaust storage or scanning capacity | File allowlists, size limits, malware scanning, quotas and quarantine |
| Elevation of privilege | Submitter self-approves evidence or accesses another review | Separation of submitter/reviewer authority; explicit reviewer permission; audited break-glass |

**Repository baseline / gap:** Trust evidence-intake and decision migrations exist. Complete authenticated submission, reviewer authorization, decision/revocation APIs, retention and private storage controls are not verified end to end.

### 2.6 Financial ledger and payment boundary

**Flow:** Authorized business action requests a journal operation → trusted actor and active organization membership are resolved → explicit journal-action policy decides allow/deny → balanced journal header and lines, audit event and minimal outbox event are committed atomically → downstream worker processes an idempotent event → reconciliation monitors outcomes. External payment providers and funds movement are outside this baseline.

**Data:** Journal entries, payment references, reconciliation and refund/dispute metadata (Confidential/Restricted); provider secrets and credentials (Restricted).

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Forged actor or provider event initiates a journal operation | Trusted actor context; signed provider webhook only after separately approved provider integration |
| Tampering | Journal line or posted amount is altered | Balanced double-entry invariants; immutable journal; corrections through separately authorized reversal entries |
| Repudiation | Posting or reversal cannot be attributed | Same-transaction append-only audit event with actor, policy decision and correlation ID |
| Information disclosure | Cross-tenant balances or payment references are exposed | Tenant RLS, explicit tenant predicates and non-enumerating errors |
| Denial of service | Duplicate/replayed commands or event storms cause unbounded work | Idempotency keys, bounded retries, rate limits and reconciliation |
| Elevation of privilege | Membership role is assumed to confer posting/refund authority | Explicit action-specific policy; deny by default; no inferred role grants; separate approval threshold if decided |

**Blocking human decision:** Issue #39 must define who may post, reverse or refund journals and whether a separate finance permission or approval threshold is required. No membership role is presumed to carry financial authority.

**Hard boundary:** No live funds movement, custody, provider integration or authenticated payment route is authorized by this document. Do not expose posting until trusted identity, explicit policy, atomic audit/outbox and PostgreSQL integration evidence are reviewed.

### 2.7 AI, vector retrieval and recommendations

**Flow:** User-provided/profile/listing data is minimized and classified → approved feature pipeline creates embeddings or retrieval features → PostgreSQL/pgvector or approved model processor receives permitted inputs → retrieval is tenant/visibility scoped → model output is validated and presented as decision support → user can correct, opt out where appropriate or appeal consequential outcomes.

**Data:** Profile, capability and behavioral signals (Confidential); sensitive evidence and protected attributes (Restricted and excluded unless specifically approved); embeddings and derived scores inherit source classification.

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Attacker poisons profile or retrieval corpus to impersonate a qualified person | Provenance, account verification signals and abuse monitoring |
| Tampering | Prompt injection or poisoned content changes model instructions/results | Treat retrieved content as untrusted; isolate instructions; validate outputs and tool permissions |
| Repudiation | Recommendation or consequential score cannot be explained | Record model/version, input provenance, explanation, confidence and user-visible effect |
| Information disclosure | Embedding or prompt leaks private profile, messages or restricted evidence | Minimize/redact inputs; tenant and visibility filters before retrieval; processor retention review |
| Denial of service | Expensive prompts or embedding floods exhaust model budget | Quotas, timeouts, token limits, caching and circuit breakers |
| Elevation of privilege | Model output triggers an unauthorized action or tool call | AI is decision support initially; no authority-bearing tools without explicit server policy and human review |

**Open validation:** Architecture requires explainability, correction, opt-out where appropriate, appeal and human review for consequential decisions. Model provider, retention terms, evaluation and production data flows are not established by this baseline.

### 2.8 External integrations and asynchronous events

**Flow:** Domain service writes state and outbox record in one transaction → worker claims event → adapter sends minimum payload using scoped secret → provider returns response or signed callback → callback is verified and deduplicated → event outcome is recorded and retried/dead-lettered under policy.

**Data:** Provider configuration and credentials (Restricted); event payloads and delivery metadata (Confidential); payload classification must not exceed the receiving provider's approved purpose.

| STRIDE | Scenario | Required controls and evidence |
| --- | --- | --- |
| Spoofing | Forged webhook or worker identity | Signature verification, timestamp/replay window, secret rotation and workload identity |
| Tampering | Queue payload or provider response is modified | Authenticated transport, payload schema/version, integrity validation and state transition checks |
| Repudiation | Provider delivery or internal processing cannot be reconstructed | Correlation/event IDs, minimal immutable event history and provider response references |
| Information disclosure | Secrets or unnecessary tenant data leak to provider/logs | Secret manager, payload minimization, redaction and processor review |
| Denial of service | Provider outage or poison event causes retry storm | Exponential backoff with jitter, bounded retries, circuit breaker and dead-letter operations |
| Elevation of privilege | Compromised integration secret accesses unrelated tenant/provider resources | Per-provider/per-environment credentials, least privilege, scoped rotation and access review |

**Repository baseline / gap:** Provider adapters and a complete transactional outbox are not verified as implemented. Do not represent an integration as operational until secret/configuration boundaries, signature verification, idempotency, retries, dead-letter handling and operational ownership are tested.

## 3. Cross-cutting controls and verification evidence

| Control | Minimum evidence before pilot | Current evidence boundary |
| --- | --- | --- |
| Authentication | Selected provider, validated middleware, account resolution and invalid/revoked credential tests | Not implemented/verified as production integration |
| Authorization | Typed action permissions, active membership and object-level/cross-tenant negative tests | Shared permission policy exists; complete per-domain enforcement remains open |
| Tenant isolation | RLS tests under actual non-owner runtime role; absent/malicious context tests | PostgreSQL RLS integration workflow exists; confirm coverage per domain |
| Audit | Atomic audit coupling, immutability and restricted reader tests | Append-only persistence exists; domain coupling remains incomplete |
| Outbox | Atomic write, idempotent delivery, retry/dead-letter tests and runbook | Complete transactional outbox not verified |
| Secrets | Managed store, rotation and no-secret-in-logs evidence | Security workflow scans repository history; runtime secret operations need separate evidence |
| Dependencies/build | Frozen lockfile, dependency review/audit, CodeQL and secret scanning | CI workflows exist; repository-level alert configuration and SBOM/provenance remain separately verifiable |
| Privacy | Purpose/lawful basis, processor inventory, retention/deletion and DPIA decision | Privacy principles documented; jurisdiction-specific review remains open |
| Operations | Incident, revocation, key rotation, backup/restore runbooks and RPO/RTO proof | Not established by CI success |
| Independent assurance | Penetration test, accessibility and load/reliability findings with remediation | Not established |

## 4. Required review workflow

For each domain, the accountable owner and security/privacy reviewer must:

1. Validate the data-flow diagram against deployed components, real data stores, processors, queues and operational access.
2. Inventory each field/event, classification, purpose, lawful basis, retention and deletion behavior.
3. Record threat actor, preconditions, impact, likelihood rationale, existing control, required mitigation, owner and due date for each threat.
4. Verify mitigations with negative tests and operational evidence; link exact CI runs, test artifacts and runbooks.
5. Record residual risk and obtain an explicit, attributable risk acceptance from the authorized decision owner.
6. Reassess after material architecture, provider, data-purpose or jurisdiction changes.

### Exit criteria

This draft may be marked reviewed only when all eight domain flows are validated, threats are individually owned and prioritized, controls are evidenced, privacy/legal decisions are recorded, and residual risks are accepted by authorized owners. Independent penetration testing, DPIA where required, restore proof and production launch approval remain separate gates.

## 5. Explicit non-claims

This document does not certify security, privacy, regulatory compliance or production readiness. It does not establish a selected identity, payment, credential, messaging or AI provider; prove any external integration is configured; grant financial permissions; or authorize live funds movement. Green CI is necessary but insufficient evidence for release.
