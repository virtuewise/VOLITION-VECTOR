-- Resolve an invitation tenant by bearer token hash before tenant context exists.
-- The policy exposes only the row whose SHA-256 hash the caller already holds.
CREATE POLICY organization_invitations_token_lookup
  ON organization_invitations
  FOR SELECT
  USING (
    encode(token_hash, 'hex') =
      nullif(current_setting('app.invitation_token_hash', true), '')
  );
