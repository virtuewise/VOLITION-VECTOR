# Contributing

- Work from an approved issue or product requirement; record material decisions as ADRs.
- Use short-lived branches and focused pull requests.
- Never commit credentials, personal data, production exports or private keys.
- Add tests for behavior and regression fixes; update docs and threat models when boundaries change.
- Use supported stable releases only. No alpha, beta, RC, canary, nightly or deprecated production APIs.
- Pin exact dependency versions and commit the lockfile. Resolve warnings rather than suppressing them.

## Required gates
Formatting, lint with zero warnings, strict typecheck, unit/integration/contract/E2E tests, build, dependency/license/secret/SAST/container scans, accessibility checks, migration validation and backup restoration evidence.

## PR checklist
- [ ] Acceptance criteria and scope are clear.
- [ ] Server-side authorization and tenant isolation are tested.
- [ ] Input validation and error handling are covered.
- [ ] Privacy, accessibility and localization are considered.
- [ ] Tests and documentation are updated.
- [ ] No secrets or sensitive data are introduced.
