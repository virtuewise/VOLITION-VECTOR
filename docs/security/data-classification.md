# Data classification

| Class        | Examples                                                                      | Minimum handling                                                                      |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Public       | Published opportunities and public organization profile                       | Integrity, moderation and abuse controls                                              |
| Internal     | Product configuration and non-sensitive metrics                               | Authenticated access and change audit                                                 |
| Confidential | Private messages, contracts and non-public profile                            | Least privilege, encryption and retention controls                                    |
| Restricted   | Identity documents, payment-related data, sensitive personal data and secrets | Purpose limitation, segregated access, encryption, short retention and audited access |

Classify each field and event before implementation. Define purpose, lawful basis, retention, access and deletion behavior.

## Transactional outbox payloads

Outbox envelopes are Internal integration records by default. They should contain stable internal identifiers and only the minimum state required by an authorized consumer; the authoritative record remains in its existing domain table.

Do not copy Restricted data into an event payload. In particular, event payloads must not contain credentials or tokens, direct contact/identity attributes, payment card or bank details, raw provider/webhook bodies, private evidence locators, signed URLs or unnecessary personal data. Consumers must retrieve protected records through a separately authorized path.

The database package enforces a conservative field-name denylist and structural/UTF-8 size limits at insertion time. That guardrail is not a content classifier, schema registry, lawful-basis determination or guarantee that an event is non-sensitive. Each producer must still document the event schema, field classifications, purpose, retention and consumer authorization. Exceptions require documented security/privacy review before implementation.
