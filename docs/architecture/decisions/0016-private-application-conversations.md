# ADR 0016: Private application conversations and participant access

- Status: Proposed
- Date: 2026-11-06
- Decision owners: Communication and opportunity engineering

## Context

The Days 31–60 roadmap milestone includes messaging. Application-related
messages contain applicant personal data and must be visible only to the
applicant and the organization account explicitly participating in the
conversation.

## Decision

- Create at most one conversation for an opportunity application.
- Only active organization owners/admins may open a conversation, and only
  after the application is shortlisted or accepted.
- Opening a conversation creates exactly two participant records: the
  applicant and the initiating organization account.
- Messages are append-only. Only an account in the conversation participant
  set may read or send messages; messages are limited to 5,000 characters.
- Conversation, participant and message tables all ENABLE and FORCE RLS.
  Tenant reads use `app.tenant_id`; participant reads use
  `app.account_id`. Message inserts require the sender to match the account
  context and exist in the participant set.
- Record conversation creation and each sent message in the tenant audit log
  within the same transaction.
- Register the repository behind the Communication module. Do not add HTTP
  endpoints until authenticated principal/session wiring is complete.

## Boundaries

This milestone does not include attachments, message edits/deletes, read
receipts, typing indicators, notifications, group conversations, moderation
queues or conversation closure. No email/SMS delivery adapter is configured.
The initial workflow is application-linked and organization-initiated only.

## Validation

PostgreSQL integration tests verify tenant isolation, participant-only
conversation/message visibility and rejection of non-participant message
inserts. Repository tests cover eligibility, participant membership, input
limits, account-scoped reads and transactional audit events.
