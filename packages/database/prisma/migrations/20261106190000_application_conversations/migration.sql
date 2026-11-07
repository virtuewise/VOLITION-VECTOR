ALTER TABLE opportunity_applications
  ADD CONSTRAINT opportunity_applications_organization_id_id_unique
  UNIQUE (organization_id, id);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  opportunity_application_id uuid NOT NULL,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT conversations_application_fk
    FOREIGN KEY (organization_id, opportunity_application_id)
    REFERENCES opportunity_applications(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT conversations_application_unique UNIQUE (opportunity_application_id),
  CONSTRAINT conversations_organization_id_id_unique UNIQUE (organization_id, id)
);

CREATE TABLE conversation_participants (
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  participant_type text NOT NULL CHECK (
    participant_type IN ('applicant', 'organization')
  ),
  joined_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_read_at timestamptz,
  PRIMARY KEY (conversation_id, account_id),
  FOREIGN KEY (organization_id, conversation_id)
    REFERENCES conversations(organization_id, id)
    ON DELETE RESTRICT
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  sender_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (organization_id, conversation_id)
    REFERENCES conversations(organization_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX conversations_tenant_created_idx
  ON conversations(organization_id, created_at DESC);
CREATE INDEX conversation_participants_account_idx
  ON conversation_participants(account_id, joined_at DESC);
CREATE INDEX messages_conversation_created_idx
  ON messages(conversation_id, created_at DESC);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;

CREATE POLICY conversations_tenant_read
  ON conversations
  FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY conversations_participant_read
  ON conversations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversation_participants AS participant
      WHERE participant.organization_id = conversations.organization_id
        AND participant.conversation_id = conversations.id
        AND participant.account_id =
          nullif(current_setting('app.account_id', true), '')::uuid
    )
  );

CREATE POLICY conversations_organization_insert
  ON conversations
  FOR INSERT
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND created_by_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  );

CREATE POLICY conversation_participants_tenant_read
  ON conversation_participants
  FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY conversation_participants_account_read
  ON conversation_participants
  FOR SELECT
  USING (
    account_id = nullif(current_setting('app.account_id', true), '')::uuid
  );

CREATE POLICY conversation_participants_organization_insert
  ON conversation_participants
  FOR INSERT
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  );

CREATE POLICY messages_tenant_read
  ON messages
  FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY messages_participant_read
  ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversation_participants AS participant
      WHERE participant.organization_id = messages.organization_id
        AND participant.conversation_id = messages.conversation_id
        AND participant.account_id =
          nullif(current_setting('app.account_id', true), '')::uuid
    )
  );

CREATE POLICY messages_participant_insert
  ON messages
  FOR INSERT
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND sender_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'participant'
    AND EXISTS (
      SELECT 1
      FROM conversation_participants AS participant
      WHERE participant.organization_id = messages.organization_id
        AND participant.conversation_id = messages.conversation_id
        AND participant.account_id = messages.sender_account_id
    )
  );

COMMENT ON TABLE conversations IS
  'Private two-party conversations opened by organization owners/admins for shortlisted or accepted applications.';
COMMENT ON TABLE conversation_participants IS
  'Conversation participant index used for account-scoped RLS and access checks.';
COMMENT ON TABLE messages IS
  'Append-only participant messages; only conversation participants may read or insert messages.';
