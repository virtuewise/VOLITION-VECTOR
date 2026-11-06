# Security scanning and dependency governance

## Automated gates

- The quality workflow installs from the committed pnpm lockfile with frozen-lockfile semantics and runs the package audit, formatting, lint, typecheck, tests and builds.
- The CodeQL workflow analyzes JavaScript/TypeScript on pull requests, pushes to main and a weekly schedule. Findings are uploaded to GitHub code scanning; repository owners must confirm that code scanning is enabled and that alerts are visible to the security team.
- Dependabot is configured for pnpm dependencies and GitHub Actions updates.

## CodeQL setup ownership

GitHub rejected the advanced-workflow SARIF upload during PR validation because this repository currently has CodeQL default setup enabled. GitHub does not accept advanced-workflow analyses while default setup is enabled. This is a repository-level configuration conflict, not a source extraction failure.

Before enabling this workflow, a repository owner must choose one supported operating mode in repository security settings:

1. Keep default setup and remove/close the advanced workflow proposal, or
2. Disable default setup and use this version-controlled advanced workflow.

Do not change that setting automatically as part of a code PR. Until the owner makes this choice, CodeQL workflow validation remains blocked and code-scanning coverage must be treated as unverified. A successful workflow run and visible alert results are required before calling this gate operational.

## Required review procedure

1. Review live Dependabot alerts and the dependency graph; issue-search results are not a substitute for the alerts API.
2. Remediate using supported patched releases and regenerate `pnpm-lock.yaml` with the pinned pnpm version in a registry-enabled environment.
3. Require frozen-lockfile installation, audit, formatting, lint, typecheck, tests, builds and the exact-head security workflows.
4. Review each code-scanning alert for reachability, impact and fix availability. Document any accepted risk with owner, rationale and revisit date.
5. Do not treat an empty or unavailable alerts response as evidence that there are no vulnerabilities.

## Scope and limitations

CodeQL static analysis does not replace dependency vulnerability monitoring, secret scanning, container/IaC scanning, penetration testing, threat modeling or human review. It does not establish compliance or production readiness. Security findings and alert availability depend on repository settings and GitHub feature entitlement; verify those in the repository UI.
