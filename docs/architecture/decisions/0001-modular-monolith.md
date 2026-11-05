# ADR 0001: Start with a modular monolith

- Status: Accepted
- Date: 2026-11-05

## Context

The platform spans many domains, but needs fast iteration, transactional integrity and a manageable operational footprint.

## Decision

Use a TypeScript monorepo with modular NestJS application boundaries and one authoritative PostgreSQL database initially. Extract a service only when evidence supports it.

## Consequences

Simpler deployment, shared contracts and easier transactions. Domain dependency rules, ownership and tests are required to prevent a distributed monolith inside one process.
