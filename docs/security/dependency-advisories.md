# Dependency advisory remediation record

Last reviewed: 2026-11-17

This record captures the package-version review for the workspace lockfile.
It does not state that GitHub Dependabot alerts have been dismissed or that
the repository has no other vulnerabilities.

## Package tree on this PR branch

The CI-generated lockfile resolves:

- `vitest@4.1.12` and `@vitest/mocker@4.1.12`.
- `glob@14.0.6`.
- `minimatch@11.0.8` for the overridden 10.x and 11.x dependency paths,
  plus `minimatch@3.1.5` for an older transitive path.

The root package manifest pins Vitest 4.1.12. No prerelease package is
introduced by this remediation.

## Current advisory dispositions

### Vitest and @vitest/mocker

- **GHSA-82fw-gwwq-j7x9:** the original redirect-mock path traversal advisory
  lists 4.1.11 as patched; 4.1.12 is outside its affected range.
- **GHSA-xp26-3454-mjgp:** the Windows backslash traversal bypass affects
  `@vitest/mocker` 4.1.11 and lists 4.1.12 as patched.
- **GHSA-qxg6-89mg-rqv8:** the manual-mock code-injection advisory affects
  versions before 4.1.12 and lists 4.1.12 as patched.
- **GHSA-p458-7748-mcp3:** the `server.fs.deny` issue affects Vitest 5
  prereleases before 5.0.5, `@vitest/browser`/`@vitest/ui` 5 prereleases
  before 5.0.5, and vite-plus before 1.3.0. The advisory explicitly says
  Vitest 4 and earlier are unaffected; the workspace resolves Vitest 4.1.12.

### glob

- **GHSA-3g3m-2fjr-6pw4:** affected versions end before 14.0.2. The lockfile's
  14.0.6 resolution is outside the affected range.
- **GHSA-5j98-mcp5-4vw2:** the command-injection advisory affects glob 10.2.0
  through 10.4.5 and 11.0.0 through 11.0.3. The 14.0.6 release line is not
  in either affected range.

### minimatch

- **GHSA-g3hv-75wg-m249:** affected versions are before 11.0.1; 11.0.1 is
  patched. The 11.0.8 resolution is outside the affected range.
- **GHSA-cf2h-pxjq-68xw:** the affected 11.x range ends at 11.0.6; 11.0.7 is
  patched. The 11.0.8 resolution is outside the affected range.
- **GHSA-c859-jr93-m5j4:** the affected 11.x range ends at 11.0.7; 11.0.8 is
  listed as patched.
- **GHSA-hqmv-qgp3-jx75:** the current official advisory page (published
  2026-11-11) lists affected versions `>=11.0.3, <=11.0.7` and patched
  version 11.0.8. The lockfile's 11.0.8 resolution is outside that affected
  range. The advisory description's final impact paragraph still says
  "No patched version is currently available", which conflicts with its own
  affected range and patched-version fields. Disposition: package-version
  exposure is **mitigated by 11.0.8**; retain the stale prose discrepancy as
  an upstream documentation issue, not as an unresolved affected version.
  Do not infer that a live Dependabot alert has been dismissed.
- **GHSA-23c5-xmqv-rm74, GHSA-7r86-cg39-jmmj and GHSA-3ppc-4f35-3m26:**
  their published affected ranges do not include the 11.0.x release line.

## Lockfile regeneration and required checks

This PR changes pnpm workspace overrides. The existing
`.github/workflows/pnpm-lock-refresh.yml` regenerates `pnpm-lock.yaml` on
the registry-enabled GitHub-hosted runner with pinned `pnpm@12.18.0`, using
`pnpm install --lockfile-only --ignore-scripts`.

The generated lockfile was committed by that workflow as
`865a727eca51fb0b2b91c411acafc80682e94551` after successful refresh run
`43696561895`. It was not edited manually.

The prior refreshed head passed frozen-lockfile installation, formatting,
lint, strict typecheck, tests, build, dependency audit, dependency review,
secret scan, CodeQL and PostgreSQL tenant integration. Any documentation
update changes the PR head and requires fresh exact-head checks before the
PR can be considered ready.

## Alert visibility limitation

The connected GitHub integration does not expose the repository's
Dependabot-alert or dependency-graph/SBOM endpoints. This record documents
the resolved package tree and public advisory version ranges only. A
repository administrator must recheck live Dependabot alerts after lockfile
refresh and after merge. No alert is marked dismissed or resolved by this
document.
