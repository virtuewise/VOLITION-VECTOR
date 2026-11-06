ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_organization_id_id_unique
  UNIQUE (organization_id, id);

CREATE TABLE opportunity_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  applicant_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  opportunity_slug_snapshot text NOT NULL,
  opportunity_title_snapshot text NOT NULL,
  opportunity_type_snapshot text NOT NULL,
  cover_note text CHECK (
    cover_note IS NULL OR length(btrim(cover_note)) <= 5000
  ),
  status text NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'withdrawn', 'shortlisted', 'rejected', 'accepted')
  ),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  withdrawn_at timestamptz,
  CONSTRAINT opportunity_applications_opportunity_fk
    FOREIGN KEY (organization_id, opportunity_id)
    REFERENCES opportunities(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT opportunity_applications_review_fields_check CHECK (
    (reviewed_at IS NULL AND reviewed_by_account_id IS NULL)
    OR
    (reviewed_at IS NOT NULL AND reviewed_by_account_id IS NOT NULL)
  ),
  CONSTRAINT opportunity_applications_withdrawn_at_check CHECK (
    (status = 'withdrawn' AND withdrawn_at IS NOT NULL)
    OR
    (status <> 'withdrawn' AND withdrawn_at IS NULL)
  ),
  CONSTRAINT opportunity_applications_unique_applicant
    UNIQUE (opportunity_id, applicant_account_id)
);

CREATE INDEX opportunity_applications_tenant_status_idx
  ON opportunity_applications(organization_id, opportunity_id, status, submitted_at DESC);
CREATE INDEX opportunity_applications_applicant_idx
  ON opportunity_applications(applicant_account_id, submitted_at DESC);

ALTER TABLE opportunity_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_applications FORCE ROW LEVEL SECURITY;

CREATE POLICY opportunity_applications_tenant_read
  ON opportunity_applications
  FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY opportunity_applications_applicant_read
  ON opportunity_applications
  FOR SELECT
  USING (
    applicant_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
  );

CREATE POLICY opportunity_applications_applicant_insert
  ON opportunity_applications
  FOR INSERT
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.tenant_id', true), '')::uuid
    AND applicant_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'applicant'
  );

CREATE POLICY opportunity_applications_organization_update
  ON opportunity_applications
  FOR UPDATE
  USING (
    organization_id =
      nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  )
  WITH CHECK (
    organization_id =
      nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  );

CREATE POLICY opportunity_applications_applicant_withdraw
  ON opportunity_applications
  FOR UPDATE
  USING (
    applicant_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'applicant'
    AND status = 'submitted'
  )
  WITH CHECK (
    applicant_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'applicant'
    AND status = 'withdrawn'
  );

COMMENT ON TABLE opportunity_applications IS
  'Private applications scoped to an opportunity tenant. Applicant and organization actions use separate transaction-local RLS actor contexts.';
