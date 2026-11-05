# Test strategy

- Unit tests: domain logic, validation, permissions and policy decisions.
- Integration tests: database transactions, tenancy boundaries, queues and provider adapters. PostgreSQL RLS and append-only audit checks run against a non-owner, non-BYPASSRLS runtime role in GitHub Actions.
- Contract tests: API and event compatibility between domains and clients.
- End-to-end tests: critical public, individual, business and admin journeys.
- Security tests: authorization bypass, tenant isolation, injection, secrets, dependency and container scanning.
- Accessibility tests: automated checks plus manual keyboard and assistive-technology review.

Every high-risk workflow requires explicit negative-path and abuse-case coverage.
