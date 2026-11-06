-- Immutable, tenant-scoped double-entry journal persistence.
-- Apply with the migration owner; runtime access is granted separately.
CREATE TABLE journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL
    CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 200),
  reference_type text NOT NULL
    CHECK (reference_type ~ '^[a-z][a-z0-9_]{1,79}$'),
  reference_id text NOT NULL
    CHECK (length(trim(reference_id)) BETWEEN 1 AND 200),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_entries_org_idempotency_unique
    UNIQUE (organization_id, idempotency_key),
  CONSTRAINT journal_entries_org_id_unique UNIQUE (organization_id, id)
);

CREATE INDEX journal_entries_org_created_idx
  ON journal_entries (organization_id, created_at DESC);

CREATE TABLE journal_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  account_code text NOT NULL
    CHECK (account_code ~ '^[a-z][a-z0-9_]{1,79}$'),
  side text NOT NULL CHECK (side IN ('debit', 'credit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT journal_entry_lines_entry_fk
    FOREIGN KEY (organization_id, journal_entry_id)
    REFERENCES journal_entries (organization_id, id) ON DELETE RESTRICT
);

CREATE INDEX journal_entry_lines_entry_idx
  ON journal_entry_lines (organization_id, journal_entry_id);
CREATE INDEX journal_entry_lines_account_idx
  ON journal_entry_lines (organization_id, account_code);

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_entries_tenant_isolation ON journal_entries
  USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY journal_entry_lines_tenant_isolation ON journal_entry_lines
  USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE FUNCTION prevent_journal_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'journal records are append-only';
END;
$$;

CREATE TRIGGER journal_entries_no_update_delete
  BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();
CREATE TRIGGER journal_entries_no_truncate
  BEFORE TRUNCATE ON journal_entries
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_journal_mutation();
CREATE TRIGGER journal_entry_lines_no_update_delete
  BEFORE UPDATE OR DELETE ON journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION prevent_journal_mutation();
CREATE TRIGGER journal_entry_lines_no_truncate
  BEFORE TRUNCATE ON journal_entry_lines
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_journal_mutation();

CREATE FUNCTION assert_journal_entry_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target_organization_id uuid;
  target_entry_id uuid;
  line_count bigint;
  debit_count bigint;
  credit_count bigint;
  debit_total numeric;
  credit_total numeric;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN
    target_organization_id := NEW.organization_id;
    target_entry_id := NEW.id;
  ELSE
    target_organization_id := NEW.organization_id;
    target_entry_id := NEW.journal_entry_id;
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE side = 'debit'),
    count(*) FILTER (WHERE side = 'credit'),
    coalesce(sum(amount_minor) FILTER (WHERE side = 'debit'), 0),
    coalesce(sum(amount_minor) FILTER (WHERE side = 'credit'), 0)
  INTO line_count, debit_count, credit_count, debit_total, credit_total
  FROM journal_entry_lines
  WHERE organization_id = target_organization_id
    AND journal_entry_id = target_entry_id;

  IF line_count < 2 OR debit_count = 0 OR credit_count = 0
     OR debit_total <> credit_total THEN
    RAISE EXCEPTION 'journal entry % must contain at least two lines and balanced debit and credit totals',
      target_entry_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;

-- Deferred checks see the complete header + lines transaction, never an
-- intermediate insert order. A header without lines cannot commit.
CREATE CONSTRAINT TRIGGER journal_entries_balance_check
  AFTER INSERT ON journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_entry_balanced();
CREATE CONSTRAINT TRIGGER journal_entry_lines_balance_check
  AFTER INSERT ON journal_entry_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION assert_journal_entry_balanced();

-- Runtime role intentionally receives SELECT/INSERT only; no update/delete.
