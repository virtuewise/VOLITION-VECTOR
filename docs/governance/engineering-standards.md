# Engineering standards

## Release policy
Use supported stable releases only; prohibit prerelease channels and deprecated production APIs. Pin exact versions and commit the lockfile. Before dependency changes, check release status, runtime compatibility, peer ranges, CVEs, licenses and migration notes. Renovate/Dependabot may open PRs; no blind auto-merge. Resolve lint, type, build and test warnings rather than suppressing them.

## Quality gates
1. Formatting and lint with zero warnings.
2. Strict TypeScript and boundary schema validation.
3. Unit, integration, contract and end-to-end tests.
4. Dependency, license, secret, SAST and container scans.
5. Accessibility checks and assistive-technology review.
6. Migration validation, backup/restore test and rollback plan.
7. Observability, audit events and incident runbooks.
8. SBOM and release provenance for production artifacts.

## Conventions
Explicit domain boundaries; no circular dependencies; authorization never solely in frontend; validate untrusted input; UTC internally; money as integer minor units or exact decimal; idempotency for retried mutations; logs free of secrets, payment data and unnecessary personal data.
