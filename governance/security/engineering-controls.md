# Engineering control baseline

- Stable releases only; exact dependency versions and committed lockfile.
- Strict TypeScript and explicit API contracts.
- No unresolved lint warnings or unreviewed suppressions.
- Required CI: install, format check, lint, typecheck, unit/integration tests, build, dependency audit, secret scan, SAST and container scan.
- Protect default branch; require reviewed pull requests and successful status checks.
- Keep secrets out of source control; use least privilege and managed secret stores.
- Record architecture decisions and material risk acceptances.
- Publish SBOM and release provenance for production artifacts.
- Maintain tested backups, incident response and vulnerability disclosure.
- Certification claims require independent audit evidence.
