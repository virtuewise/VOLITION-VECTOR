-- Volition Vector identity and organization tenancy foundation.
-- Apply with a dedicated migration owner. Runtime connections must use a
-- non-owner role without BYPASSRLS; tenant context must be set per transaction.

CREATE TABLE accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  issuer text NOT NULL,
  subject text NOT NULL,
  email text,
  email_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_identities_issuer_subject_unique UNIQUE (issuer, subject)
);
CREATE INDEX external_identities_account_id_idx ON external_identities(account_id);

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_by_account_id uuid NOT NULL REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_memberships_org_account_unique UNIQUE (organization_id, account_id)
);
CREATE INDEX organization_memberships_account_id_idx ON organization_memberships(account_id, status);

CREATE TABLE organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  invited_email text NOT NULL CHECK (length(trim(invited_email)) BETWEEN 3 AND 320),
  role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash bytea NOT NULL CHECK (octet_length(token_hash) = 32),
  invited_by_account_id uuid NOT NULL REFERENCES accounts(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organization_invitations_active_email_unique
  ON organization_invitations(organization_id, lower(invited_email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  actor_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  event_name text NOT NULL CHECK (length(trim(event_name)) BETWEEN 1 AND 160),
  resource_type text NOT NULL CHECK (length(trim(resource_type)) BETWEEN 1 AND 120),
  resource_id text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_org_occurred_idx ON audit_events(organization_id, occurred_at DESC);
CREATE INDEX audit_events_actor_occurred_idx ON audit_events(actor_account_id, occurred_at DESC);

-- Tenant isolation is enforced by PostgreSQL, not only by application filters.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
CREATE POLICY organizations_tenant_isolation ON organizations
  USING (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_memberships FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_memberships_tenant_isolation ON organization_memberships
  USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitations FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_invitations_tenant_isolation ON organization_invitations
  USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (organization_id IS NULL OR organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id IS NULL OR organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE FUNCTION prevent_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_mutation();
