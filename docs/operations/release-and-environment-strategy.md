# Release and environment strategy

Environments: local → ephemeral CI → development → staging → production. Never copy production data into lower environments. Use synthetic or properly anonymized test data.

Promote immutable build artifacts; protect main; use expand/contract migrations; feature flags are not authorization controls; progressively roll out and roll back on health signals; publish SBOM, provenance and release notes; inject secrets at runtime from a managed secret store.

At dependency bootstrap, re-check stable releases, peer compatibility and advisories; pin exact versions, generate pnpm-lock.yaml, then prove install/build/typecheck/lint/test in CI. Do not claim a successful build before those checks run.
