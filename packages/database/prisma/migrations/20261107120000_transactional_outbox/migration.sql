-- Tenant-scoped immutable outbox event envelopes.
-- Delivery state and worker privileges are deliberately separate follow-up work.
CREATE TABLE outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES organizations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL
    CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 200),
  event_name text NOT NULL
    CHECK (
      length(trim(event_name)) BETWEEN 1 AND 160
      AND event_name ~ '^[a-z][a-z0-9_.-]{0,159}$'
    ),
  aggregate_type text NOT NULL
    CHECK (
      length(trim(aggregate_type)) BETWEEN 1 AND 120
      AND aggregate_type ~ '^[a-z][a-z0-9_.-]{0,119}$'
    ),
  aggregate_id text NOT NULL
    CHECK (length(trim(aggregate_id)) BETWEEN 1 AND 200),
  schema_version smallint NOT NULL DEFAULT 1
    CHECK (schema_version > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbox_events_org_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT outbox_events_org_id_unique
    UNIQUE (organization_id, id)
);

CREATE INDEX outbox_events_org_occurred_idx
  ON outbox_events (organization_id, occurred_at DESC, id);

ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_events_tenant_read
  ON outbox_events FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY outbox_events_tenant_insert
  ON outbox_events FOR INSERT
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE FUNCTION prevent_outbox_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'outbox events are append-only';
END;
$$;

CREATE TRIGGER outbox_events_no_update_delete
  BEFORE UPDATE OR DELETE ON outbox_events
  FOR EACH ROW EXECUTE FUNCTION prevent_outbox_event_mutation();

CREATE TRIGGER outbox_events_no_truncate
  BEFORE TRUNCATE ON outbox_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_outbox_event_mutation();

COMMENT ON TABLE outbox_events IS
  'Tenant-scoped immutable event envelopes inserted in the same transaction as their domain change and audit event. Delivery state is stored separately.';
COMMENT ON COLUMN outbox_events.payload IS
  'Minimal versioned event data only; never store credentials, tokens, raw provider payloads or unnecessary personal data.';
