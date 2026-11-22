# Dependency advisory remediation record

Last reviewed: 2026-11-20

This record captures package-version review and explicitly accepted residual
findings for the workspace lockfile. It does not state that GitHub Dependabot
alerts have been dismissed or that the repository has no other vulnerabilities.

## Advisory status correction — 2026-11-19

The previous section below records the 18 November audit failure, but its
classification as an active high-severity finding is superseded by the
publisher's subsequent withdrawal.

- The [GitHub Advisory Database record](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
  now labels GHSA-fc5q-39xc-vjpf / CVE-2026-112366 **Withdrawn** and states
  that it was withdrawn on 2026-11-18. The page retains the original affected
  version range as historical metadata; it no longer presents the advisory as
  active.
- The upstream [picomatch PR #235](https://github.com/micromatch/picomatch/pull/235)
  was closed without merge on 2026-10-21. The maintainer's comment says not to
  use the disputed glob pattern and not to let untrusted users define regular
  expressions. A later contributor reported submitting a further dispute to
  the CVE Numbering Authorities on 2026-11-17; the GitHub advisory page now
  records withdrawal the following day.
- This is an **advisory withdrawal**, not a patched picomatch release. The
  lockfile still contains the same picomatch package versions; no version
  upgrade, vendor patch, override, or audit suppression is claimed.
- The pre-withdrawal failed runs remain historical evidence only. Fresh
  pinned pnpm 12.18.0 validation completed after the withdrawal:
  - PR #71 head `1c25865670ddfbc7fba0933890278a25f04ad1bd`: Quality gates
    [run 44485371439](https://github.com/virtuewise/VOLITION-VECTOR/actions/runs/44485371439)
    and Security scanning
    [run 44485371414](https://github.com/virtuewise/VOLITION-VECTOR/actions/runs/44485371414)
    both pass.
  - PR #77 head `9f13ac0b96560f133263d7469a8e10f47fdc2959`: Quality gates
    [run 44265783576](https://github.com/virtuewise/VOLITION-VECTOR/actions/runs/44265783576)
    and Security scanning
    [run 44265783628](https://github.com/virtuewise/VOLITION-VECTOR/actions/runs/44265783628)
    both pass.
- The withdrawn GHSA no longer blocks those audit gates. This does not
  establish that all repository advisories or live Dependabot alerts are
  resolved; the documented moderate Expo minimatch path remains a separate
  human-review item.

## Generated dependency tree

The registry-enabled lockfile refresh completed with pinned
`pnpm@12.18.0` in [run 44056394907](https://github.com/virtuewise/VOLITION-VECTOR/actions/runs/44056394907).
That run regenerated the lockfile after the Expo SDK alignment and removal of
the unused glob override, then committed
`ed6aba1202e172911ff9dd252e4122ee28f71282`. It resolves:

- `vitest@4.1.12` and `@vitest/mocker@4.1.12`.
- `minimatch@11.0.8` for consumers on the 11.x API/range.
- `minimatch@10.2.6` for the Expo fingerprint package's declared 10.x
  compatibility range.
- `@nestjs/cli@12.0.13` and `@nestjs/schematics@12.0.13`.
- `@typescript-eslint/parser@8.72.2` and
  `@typescript-eslint/typescript-estree@8.72.2`; the Next ESLint
  configuration also retains `typescript-estree@8.72.1`, which resolves
  minimatch 11.0.8 through the workspace override.
- `@eslint/config-array@0.23.5` resolves minimatch 11.0.8 despite declaring
  `^10.2.4`; this is an intentional major override described below.
- `@expo/fingerprint@0.21.10` no longer depends on glob and retains only
  `minimatch@10.2.6`.
- The generated lockfile contains no package named `glob` at any version.
  It retains `fast-glob@3.3.1` and `is-glob@4.0.3`; these are distinct
  packages and are not the `glob` package covered by GHSA-3g3m or GHSA-5j98.
- `minimatch@3.1.5` remains on an older transitive path; the reviewed
  advisories' patched ranges include that version.
- `picomatch@2.3.2` and `picomatch@4.0.7` remain in the lockfile. The
  advisory was subsequently withdrawn; this is not a package patch or a
  claim that the resolved versions changed.

The Expo SDK 58.0.24 patch updated the SDK 58 package set, including
`@expo/fingerprint@0.21.10`. Its changelog records that this fingerprint
release drops the glob dependency and updates minimatch to `^10.2.6`.
The SDK 58 bundled native module manifest specifies React Native 0.88.1 and
Expo Router ~58.0.31. The mobile app now uses those compatible versions.

Before this update, the security workflow's recursive and production-only
`pnpm why` report showed the older `@expo/fingerprint@0.21.9` glob 13
path under `expo@58.0.23` and
`@volition/mobile@0.1.0 (dependencies)`. That glob path has been removed
from the regenerated lockfile. The current lockfile still shows
`@expo/fingerprint@0.21.10` depending on minimatch 10.2.6, so that
minimatch path remains in pnpm's mobile dependency graph.

Expo's maintainer states that this fingerprint code is build-time tooling,
not shipped in production app bundles, and not a vulnerability in Expo apps.
The upstream issue reporter also recorded an iOS export inspection with no
glob, minimatch, `@expo/config-plugins` or `@expo/config` sources in the
production bundle. This repository has not independently produced and
inspected its own production iOS bundle. Do not claim the package-manager
dependency path is absent or that the remaining advisory is resolved.

## Compatibility review

- The root uses Node 26 and TypeScript 6.0.2. `@typescript-eslint/parser`
  8.72.2 supports TypeScript below 6.1 and its `typescript-estree` package
  uses minimatch `^11.0.1`.
- Nest CLI and schematics 12.0.13 are compatible with the workspace's Node 26
  and TypeScript 6.0.2; the CLI declares minimatch 11.0.5, which the 11.0.8
  override satisfies.
- `@eslint/config-array@0.23.5` still declares minimatch `^10.2.4`.
  The workspace override intentionally supplies 11.0.8. Upstream ESLint
  compatibility investigation reports that this consumer uses
  `new Minimatch(...)` and `.match(...)`, which remain in 11.x, and reports
  equivalent lint results with 10.2.6 and 11.0.3. This remains a major
  override outside the declared semver range; full lint, typecheck, tests
  and build gates are required evidence, not a substitute for an upstream
  range update.
- Expo SDK 58.0.25 uses `@expo/fingerprint@0.21.10`. Expo retains
  minimatch 10.x in this build-time fingerprint package because of breaking
  changes in minimatch 11.x. The workspace therefore keeps the declared
  `@expo/fingerprint>minimatch` 10.2.6 override and does not force a
  potentially incompatible major upgrade.

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

- **GHSA-3g3m-2fjr-6pw4 (Moderate):** affected versions include glob 9.0.0
  through 14.0.1; 14.0.2 and later are patched. The prior Expo SDK 58
  fingerprint glob 13 path has been removed by the SDK 58.0.24 package
  updates. The regenerated lockfile contains no glob 9.x or later package,
  and this advisory is no longer in the pnpm audit ignore list. Live
  Dependabot alert status remains unverified.
- **GHSA-5j98-mcp5-4vw2:** the command-injection advisory affects glob 10.2.0
  through 10.4.5 and 11.0.0 through 11.0.3. The regenerated lockfile has no
  glob package in either affected range.

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
  **moderate residual risk**, not resolved; the package-manager path remains
  in the mobile dependency graph. Expo says the code is build-time tooling
  and not shipped in app bundles, but this repository has not independently
  verified bundle exclusion.
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

### picomatch — withdrawn advisory (2026-11-18)

- **GHSA-fc5q-39xc-vjpf / CVE-2026-112366:** the GitHub Advisory Database
  now labels this record **Withdrawn** and records 2026-11-18 as the
  withdrawal date. The former affected-version metadata is historical and
  must not be presented as a currently active advisory.
- The lockfile still resolves `picomatch@2.3.2` and `picomatch@4.0.7`.
  Neither package version was upgraded or patched by this disposition.
- The historical production-only `pnpm why picomatch` report found both
  versions under the mobile workspace dependency graph through Expo/Metro
  paths. That graph evidence does not establish that picomatch code is
  included in a generated application bundle or invoked with
  attacker-controlled patterns.
- No bundle export/inspection is claimed. Do not describe the package path
  as patched, absent, or independently proven harmless.
- Disposition: **withdrawn advisory; no active high-severity finding remains
  for this GHSA**. Issue #78 was closed as not planned because the publisher
  withdrew the advisory. Reopen assessment only if a new active advisory or
  distinct vulnerability is published. Do not add an audit ignore or vendor
  an unmerged patch for this withdrawn record.

## Narrow pnpm audit and dependency-review exceptions

The workspace pnpm audit and dependency-review allowlists currently contain
only this one moderate GHSA ID associated with the retained Expo fingerprint
path:

- GHSA-g3hv-75wg-m249 (minimatch 10.2.6).

This is not marked resolved. The pnpm audit ignore and dependency-review
allowlist are an explicit, reviewable moderate-risk disposition. The
package-manager dependency path remains present in the mobile dependency
graph. Expo's maintainer assesses the package as build-time tooling and says
it is not shipped in production apps, but this repository has not independently
verified bundle exclusion. A human reviewer must explicitly accept or reject
this moderate residual risk before merge. Remove the ignore when Expo ships
a compatible patched dependency path. No high-severity advisory is ignored.

## Lockfile regeneration and required checks

The lockfile must be generated by
`.github/workflows/pnpm-lock-refresh.yml` on a registry-enabled GitHub-hosted
runner with pinned `pnpm@12.18.0`, using
`pnpm install --lockfile-only --ignore-scripts`. It must not be hand-edited.

The refreshed head must pass frozen installation, formatting, lint, strict
typecheck, tests, build, dependency review (with only the one documented
moderate GHSA exception), pnpm audit (with only the one documented moderate
GHSA exception), secret scanning, CodeQL and PostgreSQL tenant integration
where applicable. The withdrawn picomatch advisory does not block the current audit. The
only documented audit exception is the moderate Expo minimatch finding
GHSA-g3hv-75wg-m249, which remains a human-review item.

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
- https://github.com/micromatch/picomatch/security/advisories/GHSA-fc5q-39xc-vjpf
- https://github.com/expo/expo/issues/52735
- https://github.com/expo/expo/tree/sdk-58/packages/%40expo/fingerprint
- https://github.com/eslint/eslint/issues/21463
- https://github.com/typescript-eslint/typescript-eslint/issues/13125
