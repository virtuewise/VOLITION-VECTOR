-- Distributed invitation throttling without storing raw email addresses.
-- Scope hashes are SHA-256 digests of domain-separated actor IDs or normalized emails.
CREATE TABLE organization_invitation_rate_limits (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('actor', 'email')),
  scope_hash bytea NOT NULL CHECK (octet_length(scope_hash) = 32),
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  last_attempt_at timestamptz NOT NULL,
  PRIMARY KEY (organization_id, scope, scope_hash)
);

CREATE INDEX organization_invitation_rate_limits_last_attempt_idx
  ON organization_invitation_rate_limits(last_attempt_at);

ALTER TABLE organization_invitation_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_invitation_rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_invitation_rate_limits_tenant_isolation
  ON organization_invitation_rate_limits
  USING (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

COMMENT ON TABLE organization_invitation_rate_limits IS
  'Tenant-scoped invitation rate-limit counters. scope_hash is a domain-separated SHA-256 digest; raw emails are never stored.';
