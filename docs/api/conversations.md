# Conversation participant read API

The conversation API exposes a private, read-only view of application-linked
conversations. It does not open conversations, send messages, close
conversations, edit/delete messages, manage attachments or send notifications.

All routes require a valid WorkOS AuthKit bearer access token. The API resolves
the verified issuer/subject pair to an active internal account. The account ID
is taken only from the server-side principal; request bodies, query parameters
and path segments cannot select an actor account.

## Routes

### List my conversations

`GET /v1/conversations?limit=20&offset=0`

Returns only conversations for which the authenticated account has an explicit
participant record.

- `limit` defaults to 20 and must be between 1 and 50.
- `offset` defaults to 0 and must be a safe integer between 0 and 10,000.
- Only `limit` and `offset` query parameters are accepted.
- Conversations are ordered by most recent message, then creation time.

### List messages in a conversation

`GET /v1/conversations/{conversationId}/messages?limit=50&offset=0`

Returns messages in ascending creation order only for an account in the
conversation participant set.

- `conversationId` must be a UUIDv4.
- `limit` defaults to 50 and must be between 1 and 100.
- `offset` defaults to 0 and must be a safe integer between 0 and 10,000.
- Only `limit` and `offset` query parameters are accepted.
- A non-participant and a conversation with no visible messages both produce
  an empty array; the endpoint does not disclose conversation existence.

## Authorization and data boundaries

Both `WorkOSAuthenticationGuard` and `IdentityContextGuard` are applied.
The actor account ID is derived only from the verified internal principal.
Conversation IDs are locators, not capabilities.

The repository sets transaction-local participant context and PostgreSQL RLS
remains authoritative. Message reads also join the participant table and
explicitly constrain the account ID in SQL. All user-controlled values are
parameterized. Responses include `Cache-Control: private, no-store`.

## Deferred capabilities

The database repository contains audited conversation-opening and message-send
commands, but this API intentionally does not expose them. HTTP write routes
remain deferred pending human review of ADR 0016, the session/revocation policy,
rate limiting, abuse controls and same-transaction audit/notification
requirements. Attachments, read receipts, typing indicators, moderation
queues, message edits/deletes and external delivery adapters are not
implemented by this API.
