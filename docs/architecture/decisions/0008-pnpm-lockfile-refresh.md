# ADR 0008: Regenerate pnpm lockfiles in trusted CI

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Platform engineering

## Context

The repository pins pnpm 12.18.0 and requires frozen-lockfile installation in
quality CI. Dependency manifests must not be merged with a manually edited or
stale lockfile, and lockfile generation needs a registry-enabled environment.

## Decision

- Generate `pnpm-lock.yaml` with the repository-pinned pnpm version in
  GitHub Actions, where the package registry is available.
- For same-repository pull requests that change package manifests or workspace
  configuration, run `pnpm install --lockfile-only --ignore-scripts`.
- Commit only the generated lockfile back to the pull-request branch when it
  changes. Package lifecycle scripts are disabled in this refresh job.
- Do not grant write access to fork-originated pull requests. Their lockfiles
  must be refreshed by a trusted maintainer workflow.
- Keep the quality workflow's `pnpm install --frozen-lockfile` gate as the
  authoritative verification that manifests and lockfile agree.

## Security boundaries

The refresh workflow does not run package scripts and only writes
`pnpm-lock.yaml` on same-repository pull-request branches. It does not modify
repository protections, secrets, or the default branch. Dependency audit,
formatting, lint, typecheck, tests and build remain separate quality gates.
