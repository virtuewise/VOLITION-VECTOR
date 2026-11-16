# Dependency advisory remediation record

Last reviewed: 2026-11-16

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
  lockfile now resolves both 11.x paths to 11.0.8. GHSA-cf2h affects
  11.0.0 through 11.0.6 and lists 11.0.7 as patched. GHSA-c859 affects
  7.4.0 through 11.0.7 and lists 11.0.8 as patched. The 11.0.8 upgrade
  addresses those two advisories.
- **Unresolved moderate finding — GHSA-hqmv-qgp3-jx75:** The advisory affects
  11.0.3 through 11.0.7. Its structured metadata lists 11.0.8 as patched,
  but the advisory body still says no patched version is available. Treat
  this finding as unresolved until the maintainer clarifies the discrepancy
  or publishes a verifiably fixed release. This PR does not claim that
  11.0.8 fixes the cache-retention issue. The current main version 11.0.1
  is a stated negative control; 11.0.4 is affected. The live repository
  alert still requires administrator recheck.

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

## Additional advisory review — 2026-11-16

The public advisory records were rechecked after the original lockfile refresh:

- **glob — GHSA-3g3m-2fjr-6pw4:** affected versions are 9.0.0 through 14.0.1; 14.0.2 is patched. The lockfile's 14.0.6 resolution is outside the affected range.
- **minimatch — GHSA-g3hv-75wg-m249:** affected versions are 7.0.0 through versions before 11.0.1; 11.0.1 is patched. The 11.0.8 resolution is outside the affected range.
- **minimatch — GHSA-cf2h-pxjq-68xw:** the 11.x affected range ends at 11.0.6; 11.0.7 is patched. The lockfile's 11.0.8 resolution is outside the affected range.
- **minimatch — GHSA-c859-jr93-m5j4:** the affected range ends at 11.0.7; 11.0.8 is listed as patched.
- **minimatch — GHSA-23c5-xmqv-rm74 and GHSA-7r86-cg39-jmmj:** the published affected ranges cover 10.2.x and earlier release lines; they do not include 11.0.8.
- **minimatch — GHSA-3ppc-4f35-3m26:** the published affected ranges likewise do not include the 11.0.x release line.

The separate **GHSA-hqmv-qgp3-jx75** discrepancy remains unresolved: its structured metadata lists 11.0.8 as patched while the advisory description still says that no patched version is available. The conservative disposition above is unchanged; do not claim this finding resolved until the maintainer clarifies the advisory or a release-level fix is independently verified.

These are public advisory/version-range assessments, not a substitute for the repository's live Dependabot alert inventory. The connected GitHub integration still cannot retrieve that inventory or the dependency-graph SBOM. A repository administrator must recheck the live alerts after lockfile refresh and after merge.
