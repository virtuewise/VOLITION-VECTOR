# Dependency advisory remediation record

Last reviewed: 2026-11-17

This record captures package-version review and explicitly accepted residual
findings for the workspace lockfile. It does not state that GitHub Dependabot
alerts have been dismissed or that the repository has no other vulnerabilities.

## Package tree targeted by this PR

The registry-enabled lockfile refresh completed successfully in run
`44053478424` and committed generated lockfile commit
`44c739679b5af747d960196dbf337ae426850184`. The current lockfile snapshot
confirms:

- `vitest@4.1.12` and `@vitest/mocker@4.1.12`.
- `glob@14.0.6` for the updated Expo SDK 58 CLI/config packages.
- `minimatch@11.0.8` for packages whose supported API/range accepts 11.x.
- `@nestjs/cli@12.0.13` and `@nestjs/schematics@12.0.13`.
- `@typescript-eslint/parser@8.72.2` and
  `@typescript-eslint/typescript-estree@8.72.2`; the Next ESLint config also
  retains `typescript-estree@8.72.1`, which resolves minimatch 11.0.8 through
  the workspace override.
- `@expo/fingerprint@0.21.9` retains its declared compatible 13.x/10.x ranges,
  resolved to `glob@13.0.6` and `minimatch@10.2.6`. Its nested glob 13 path also
  retains minimatch 10.2.6. This is the only intended remaining 13.x/10.x
  exception.
- `minimatch@3.1.5` remains on an older transitive path; the reviewed
  advisories' patched ranges include that version.

The lockfile snapshot confirms that `@expo/fingerprint@0.21.9` alone retains
`glob@13.0.6` and `minimatch@10.2.6`; the other reviewed glob/minimatch
paths resolve to the 14.x/11.x lines. The security workflow now emits
recursive and production-only `pnpm why` output. That output must be inspected
before merge; if a retained path is in a production dependency graph, the
exception must be revisited.

## Compatibility review

- The root uses Node 26 and TypeScript 6.0.2. `@typescript-eslint/parser`
  8.72.2 supports TypeScript below 6.1 and its `typescript-estree` package
  uses minimatch `^11.0.1`.
- Nest CLI 12.0.13 requires Node >=20.11, uses TypeScript ~6.0.2 and
  declares minimatch 11.0.5; the 11.0.8 override satisfies that range.
- glob 14.0.6 declares minimatch `^11.0.5`; minimatch 11.0.8 satisfies it.
- `@eslint/config-array@0.23.5` still declares minimatch `^10.2.4`.
  The workspace override intentionally supplies 11.0.8. Upstream ESLint
  compatibility investigation reports that this consumer uses
  `new Minimatch(...)` and `.match(...)`, which remain in 11.x, and reports
  equivalent lint results with 10.2.6 and 11.0.3. This remains a major
  override outside the declared semver range; the repository's full lint,
  typecheck, tests and build gates are required evidence, not a substitute
  for an upstream range update.
- Expo's SDK 58 fingerprint dependency is treated differently. The Expo
  maintainers state that the fingerprint package retains minimatch 10.x
  because of breaking changes in 11.x, and that the relevant glob/minimatch
  advisories are development-tooling DoS findings rather than production-app
  vulnerabilities. This PR therefore does not force the fingerprint path
  across those majors. The security workflow prints recursive and
  production-only dependency paths so reviewers can verify the actual
  workspace graph.

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

- **GHSA-3g3m-2fjr-6pw4 (Moderate):** affected versions include glob 13.x and
  releases through 14.0.1; 14.0.2 and later are patched. Most consumers move
  to 14.0.6. The Expo fingerprint path remains on 13.0.6 to avoid the
  upstream-documented major-version break. Disposition: **moderate
  development-tooling exception**, not resolved.
- **GHSA-5j98-mcp5-4vw2:** the command-injection advisory affects glob 10.2.0
  through 10.4.5 and 11.0.0 through 11.0.3. The 14.0.6 release line is not
  in either affected range; 13.0.6 is not in these specific ranges.

### minimatch

- **GHSA-23c5-xmqv-rm74 (High):** minimatch 10.x before 10.2.3 is affected;
  10.2.3 is patched. The retained Expo version 10.2.6 is outside the affected
  range. 11.0.8 is also outside the affected range.
- **GHSA-7r86-cg39-jmmj (High):** minimatch 10.x before 10.2.3 is affected;
  10.2.3 is patched. The retained Expo version 10.2.6 is outside the affected
  range.
- **GHSA-3ppc-4f35-3m26 (High):** minimatch 10.x before 10.2.1 is affected;
  10.2.1 is patched. The retained Expo version 10.2.6 is outside the affected
  range.
- **GHSA-g3hv-75wg-m249 (Moderate):** the current advisory identifies
  minimatch 10.2.6 as affected and 11.0.1 as patched. The Expo fingerprint
  path intentionally retains 10.2.6 for upstream compatibility. Disposition:
  **moderate development-tooling exception**, not resolved.
- **GHSA-cf2h-pxjq-68xw:** the affected 11.x range ends at 11.0.6; 11.0.7 is
  patched. The 11.0.8 resolution is outside the affected range.
- **GHSA-c859-jr93-m5j4:** the affected 11.x range ends at 11.0.7; 11.0.8 is
  listed as patched.
- **GHSA-hqmv-qgp3-jx75:** the current official advisory page (published
  2026-11-11) lists affected versions `>=11.0.3, <=11.0.7` and patched
  version 11.0.8. The 11.0.8 resolution is outside that affected range. The
  advisory description's final impact paragraph still says no patched
  version is available, contradicting its own range and patched-version
  fields. Disposition: package-version exposure is **mitigated by 11.0.8**;
  retain the stale prose discrepancy as an upstream documentation issue.
  Do not infer that a live Dependabot alert has been dismissed.

## Narrow pnpm audit exceptions

The security workflow fails on moderate or higher findings. The workspace
therefore ignores only the two GHSA IDs associated with the retained Expo
fingerprint path:

- GHSA-3g3m-2fjr-6pw4 (glob 13.0.6).
- GHSA-g3hv-75wg-m249 (minimatch 10.2.6).

These are not marked resolved. The ignore list is an explicit, reviewable
risk disposition for the upstream-compatible development-tooling path. It
must be removed when Expo ships a compatible patched dependency path. The
security workflow prints recursive and production-only `pnpm why) output
for glob and minimatch so reviewers can verify that the retained path does
not enter production dependencies. If a production path is found, this
exception must be revisited before merge.

## Lockfile regeneration and required checks

This PR changes package manifests and pnpm workspace overrides. The existing
`.github/workflows/pnpm-lock-refresh.yml` regenerates `pnpm-lock.yaml` on
the registry-enabled GitHub-hosted runner with pinned `pnpm@12.18.0`, using
`pnpm install --lockfile-only --ignore-scripts`.

The lockfile must not be edited manually. The refreshed head must pass frozen
installation, formatting, lint, strict typecheck, tests, build, dependency
review, the documented pnpm audit exceptions, secret scanning, CodeQL and
PostgreSQL tenant integration where applicable.

## Alert visibility limitation

The connected GitHub integration does not expose the repository's
Dependabot-alert or dependency-graph/SBOM endpoints. This record documents
the package tree and public advisory dispositions only. A repository
administrator must recheck live Dependabot alerts after lockfile refresh and
after merge. No alert is marked dismissed or resolved by this document.

## Upstream references

- https://github.com/isaacs/minimatch/security/advisories/GHSA-23c5-xmqv-rm74
- https://github.com/isaacs/minimatch/security/advisories/GHSA-7r86-cg39-jmmj
- https://github.com/isaacs/minimatch/security/advisories/GHSA-3ppc-4f35-3m26
- https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249
- https://github.com/isaacs/node-glob/security/advisories/GHSA-3g3m-2fjr-6pw4
- https://github.com/expo/expo/issues/52735
- https://github.com/eslint/eslint/issues/21463
- https://github.com/typescript-eslint/typescript-eslint/issues/13125
