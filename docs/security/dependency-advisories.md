# Dependency advisory remediation record

Last reviewed: 2026-11-15

This record captures the package-version review for the workspace lockfile. It is not a statement that GitHub Dependabot alerts have been dismissed or that the repository has no other vulnerabilities.

| Package | Version found in main lockfile | Advisory / disposition |
| --- | --- | --- |
| `vitest` | `4.1.12` | Retain. The current release is at or above the published fixes for the reviewed Vitest server and browser-mode advisories. |
| `@vitest/mocker` | `4.1.12` | Retain. The reviewed October 2026 redirect-path and manual-mock code-injection advisories list `4.1.12` as patched. |
| `glob` | `14.0.2` | Advance to `14.0.6` in the dependency-remediation PR. The October 2026 AbortSignal traversal advisory is fixed from `14.0.2`; `14.0.6` is the current stable 14.x release reviewed on 2026-11-15. |
| `minimatch` | `11.0.1`, `11.0.4` | Advance both 11.x resolution paths to `11.0.8`. The November 10 advisory affects `11.0.0`–`11.0.6`; the November 11 escape-contract and cache-retention advisories affect through `11.0.7` and list `11.0.8` as patched. |

## Regeneration and verification

The dependency PR changes only pnpm workspace overrides. The repository's existing `.github/workflows/pnpm-lock-refresh.yml` regenerates `pnpm-lock.yaml` on the GitHub-hosted registry-enabled runner with the pinned `pnpm@12.18.0`, using `pnpm install --lockfile-only --ignore-scripts`. The generated lockfile is committed by that workflow; it must not be edited manually.

After refresh, the PR must pass frozen-lockfile installation, formatting, lint, strict typecheck, tests, build, dependency audit, dependency review, secret scan, CodeQL and PostgreSQL tenant integration. Recheck the exact refreshed head SHA before reporting results.

## Alert visibility limitation

The connected GitHub integration currently does not expose the repository's Dependabot-alert or dependency-graph/SBOM endpoints. Therefore this record documents package-tree remediation and public advisory dispositions only. A repository administrator must recheck live Dependabot alerts after the lockfile refresh and after merge; no alert is marked dismissed or resolved by this document.
