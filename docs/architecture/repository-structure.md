# Repository structure

- apps/web — Next.js web experience
- apps/api — NestJS HTTP API
- apps/mobile — Expo / React Native client
- apps/worker — planned asynchronous job runner
- packages/ui — planned shared accessible components
- packages/design-system — planned tokens, typography, motion and patterns
- packages/database — planned schema, migrations and repositories
- packages/contracts — planned API and event contracts
- packages/validation — planned shared schemas
- packages/permissions — planned authorization primitives
- packages/payments-sdk — planned provider-neutral payment contracts
- packages/ai-sdk — planned model and retrieval adapters
- packages/localization — planned locale and message catalogs
- packages/security — planned security utilities
- infra — local infrastructure and deployment assets
- docs — architecture, governance, product and operations

Only web, API, mobile shells and local PostgreSQL/Redis compose services are present in this first scaffold. Planned packages are not implemented functionality.
