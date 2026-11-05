# ADR 0006: Tenant-scoped membership mutation transaction

- Status: Proposed
- Date: 2026-11-05
- Decision owners: Volition Vector identity and data domains

## Context

The shared organization membership policy defines role hierarchy, self-mutation
restrictions and active-owner continuity. A policy-only helper cannot prevent
a time-of-check/time-of-use race if actor, target and owner state are loaded
before the mutation transaction.

## Decision

- Use the existing tenant transaction helper and transaction-local RLS context.
- Serialize membership mutations within one organization using a transaction
  advisory lock shared by all calls through this adapter.
- Load actor and target memberships from PostgreSQL under RLS and lock both
  rows before evaluating the injected shared authorization policy.
- Count active owners inside the same serialized transaction.
- Perform the role/status update and append its audit event in that transaction.
  Any write or audit failure rolls back the complete operation.
- Return no mutation result for missing membership state or policy denial.

## Security and integration boundaries

The adapter does not authenticate the actor. Its caller must derive actor and
tenant identifiers from trusted request context. The injected authorizer must
be the shared canManageOrganizationMembership policy, not a client-supplied
decision. The database connection must use the non-owner runtime role without
BYPASSRLS.

The advisory lock protects concurrent mutations only when all membership
writers use this repository and lock key. Direct SQL writers, administrative
scripts and other adapters must follow the same serialization contract.
Production DI wiring, authorization guard integration and live concurrency
tests remain deferred.
