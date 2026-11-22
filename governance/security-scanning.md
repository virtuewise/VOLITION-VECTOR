# Security scanning and dependency governance

## Automated gates

- The quality workflow installs from the committed pnpm lockfile with frozen-lockfile semantics and runs the package audit, formatting, lint, typecheck, tests and builds.
- Repository inspection and the failed advanced-workflow upload establish that GitHub CodeQL default setup is enabled. Retain that repository-managed setup as the active CodeQL configuration; do not add a competing advanced workflow unless the repository owner intentionally changes the mode in security settings.
- Dependabot is configured for pnpm dependencies and GitHub Actions updates.

## CodeQL setup ownership

GitHub rejected the proposed advanced-workflow SARIF upload because CodeQL default setup is enabled. GitHub does not accept advanced-workflow analyses while default setup is enabled. The competing .github/workflows/codeql.yml proposal was therefore removed rather than changing repository security settings.

The repository owner should verify in Security settings that default setup remains enabled, the expected languages and query suite are selected, and alerts are visible to the security team. The connector used for this implementation could not retrieve code-scanning alert records, so visibility and current findings remain unverified here.

If the owner later elects to manage CodeQL through version-controlled advanced configuration, first disable default setup through the repository's authorized settings process, then add and validate the advanced workflow in a separate change. Do not switch modes implicitly in a code PR.

## Required review procedure

1. Review live Dependabot alerts and the dependency graph; issue-search results are not a substitute for the alerts API.
2. Remediate using supported patched releases and regenerate pnpm-lock.yaml with the pinned pnpm version in a registry-enabled environment.
3. Require frozen-lockfile installation, audit, formatting, lint, typecheck, tests, builds and the repository's active security workflows on the exact PR head.
4. Review each code-scanning alert for reachability, impact and fix availability. Document any accepted risk with owner, rationale and revisit date.
5. Do not treat an empty or unavailable alerts response as evidence that there are no vulnerabilities.

## Scope and limitations

CodeQL static analysis does not replace dependency vulnerability monitoring, secret scanning, container/IaC scanning, penetration testing, threat modeling or human review. It does not establish compliance or production readiness. Security findings and alert availability depend on repository settings and GitHub feature entitlement; verify those in the repository UI.

## Temporary Expo minimatch compatibility exception

The dependency-remediation PR retains `minimatch@10.2.6` only through
`@expo/fingerprint@0.21.10` because the current Expo compatibility boundary
does not accept the patched minimatch 11 major. GHSA-g3hv-75wg-m249 remains a
moderate advisory for that copy; this is not a vulnerability-resolution claim
or formal risk acceptance.

Important: `pnpm-workspace.yaml`'s `auditConfig.ignoreGhsas` entry is global
by GHSA identifier, not path-scoped. The security workflow therefore runs
`scripts/check-minimatch-exception.mjs` after frozen installation. That guard
fails if the lockfile adds another affected minimatch consumer, an affected
11.0.3–11.0.7 release, or any `glob` package. The only permitted affected
path is the current Expo fingerprint build-time dependency.

Disposition: temporary compatibility exception pending human security review.
A maintainer must assign the risk owner and review date before merge. Remove
the ignore and guard when Expo publishes a compatible patched dependency or
when the mobile toolchain is upgraded. Production-bundle exclusion has not
been independently verified by this repository.
