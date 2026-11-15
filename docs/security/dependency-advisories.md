# Dependency advisory remediation record

Last reviewed: 2026-11-15

This record captures the package-version review for the workspace lockfile.
It does not state that GitHub Dependabot alerts have been dismissed or that
the repository has no other vulnerabilities.

## Package dispositions

- **Vitest 4.1.12:** Retain. This version is at or above the published fixes
  for the reviewed Vitest server and browser-mode advisories.
- **@vitest/mocker 4.1.12:** Retain. The reviewed October 2026 redirect-path
  and manual-mock code-injection advisories list 4.1.12 as patched.
- **glob:** The main lockfile had 14.0.2. The CI-generated lockfile now
  resolves 14.0.6. The October 2026 AbortSignal traversal advisory is fixed
  from 14.0.2; 14.0.6 is the stable 14.x release reviewed on 2026-11-15.
- **minimatch:** The main lockfile had 11.0.1 and 11.0.4. The CI-generated
  lockfile now resolves both affected 11.x paths to 11.0.8. The November 10
  advisory affects 11.0.0 through 11.0.6. The November 11 escape-contract
  and cache-retention advisories affect versions through 11.0.7 and list
  11.0.8 as patched.

## Regeneration and verification

This PR changes pnpm workspace overrides. The existing
`.github/workflows/pnpm-lock-refresh.yml` regenerates `pnpm-lock.yaml` on
the GitHub-hosted registry-enabled runner with pinned `pnpm@12.18.0`, using
`pnpm install --lockfile-only --ignore-scripts`.

The generated lockfile was committed by that workflow as
`865a727eca51fb0b2b91c411acafc80682e94551` after successful refresh run
`43696561895`. It was not edited manually.

After refresh, this PR must pass frozen-lockfile installation, formatting,
lint, strict typecheck, tests, build, dependency audit, dependency review,
secret scan, CodeQL and PostgreSQL tenant integration. Recheck the exact
refreshed head SHA before reporting results.

## Alert visibility limitation

The connected GitHub integration does not expose the repository's
Dependabot-alert or dependency-graph/SBOM endpoints. This record documents
package-tree remediation and public advisory dispositions only. A repository
administrator must recheck live Dependabot alerts after lockfile refresh and
after merge. No alert is marked dismissed or resolved by this document.
