# Security scanning and dependency governance

## Automated gates

- The quality workflow installs from the committed pnpm lockfile with frozen-lockfile semantics and runs the package audit, formatting, lint, typecheck, tests and builds.
- The CodeQL workflow analyzes JavaScript/TypeScript on pull requests, pushes to main and a weekly schedule. Findings are uploaded to GitHub code scanning; repository owners must confirm that code scanning is enabled and that alerts are visible to the security team.
- Dependabot is configured for pnpm dependencies and GitHub Actions updates.

## Required review procedure

1. Review live Dependabot alerts and the dependency graph; issue-search results are not a substitute for the alerts API.
2. Remediate using supported patched releases and regenerate `pnpm-lock.yaml` with the pinned pnpm version in a registry-enabled environment.
3. Require frozen-lockfile installation, audit, formatting, lint, typecheck, tests, builds and the exact-head security workflows.
4. Review each code-scanning alert for reachability, impact and fix availability. Document any accepted risk with owner, rationale and revisit date.
5. Do not treat an empty or unavailable alerts response as evidence that there are no vulnerabilities.

## Scope and limitations

CodeQL static analysis does not replace dependency vulnerability monitoring, secret scanning, container/IaC scanning, penetration testing, threat modeling or human review. It does not establish compliance or production readiness. Security findings and alert availability depend on repository settings and GitHub feature entitlement; verify those in the repository UI.
