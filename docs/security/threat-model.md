# Initial threat model

## Assets
Credentials and sessions; identity evidence; private profiles; organization data; messages; payment references and ledger; credential records; audit trail; AI inputs/outputs; administrative controls.

## Trust boundaries
Browser/mobile to API; tenant to tenant; public profile to private account; API to data stores; application to payment/identity/credential providers; worker to queue; operator to production; model provider to platform data.

## Priority threats and controls
- Account takeover: MFA roadmap, secure recovery, rate limits, session rotation and anomaly monitoring.
- Broken access control: deny-by-default policy checks, tenant-scoped queries and object-level authorization tests.
- Cross-tenant leakage: explicit tenant context and isolation tests.
- Injection and unsafe uploads: validation, output encoding, content allowlists, malware scanning and storage isolation.
- Payment abuse: hosted collection, idempotency, signed webhooks, immutable ledger and reconciliation.
- Credential fraud: issuer verification, provenance checks, expiry/revocation and human review.
- AI abuse/bias: data minimization, model governance, evaluation, explanations, appeals and oversight.
- Insider misuse: least privilege, just-in-time access, audit and access reviews.
- Supply-chain compromise: lockfile, provenance, SCA, secret scanning and controlled release.
- Availability attacks: rate limits, quotas, backups, restore drills and incident response.

## Production prerequisites
Formal data-flow diagrams, STRIDE review per domain, DPIA where required, penetration test, incident runbooks, recovery objectives and verified restoration evidence.
