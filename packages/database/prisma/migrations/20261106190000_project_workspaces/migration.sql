ALTER TABLE opportunity_applications
  ADD CONSTRAINT opportunity_applications_organization_id_id_unique
  UNIQUE (organization_id, id);

CREATE TABLE project_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  opportunity_application_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  client_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  provider_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'paused', 'completed', 'cancelled')
  ),
  starts_at timestamptz,
  target_completion_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT project_workspaces_application_fk
    FOREIGN KEY (organization_id, opportunity_application_id)
    REFERENCES opportunity_applications(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT project_workspaces_opportunity_fk
    FOREIGN KEY (organization_id, opportunity_id)
    REFERENCES opportunities(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT project_workspaces_one_per_application
    UNIQUE (opportunity_application_id),
  CONSTRAINT project_workspaces_distinct_participants
    CHECK (client_account_id <> provider_account_id),
  CONSTRAINT project_workspaces_completion_check
    CHECK (
      (status = 'completed' AND completed_at IS NOT NULL)
      OR (status <> 'completed' AND completed_at IS NULL)
    ),
  CONSTRAINT project_workspaces_target_date_check
    CHECK (
      target_completion_at IS NULL OR starts_at IS NULL
      OR target_completion_at >= starts_at
    )
);

CREATE INDEX project_workspaces_tenant_status_idx
  ON project_workspaces(organization_id, status, updated_at DESC);
CREATE INDEX project_workspaces_client_idx
  ON project_workspaces(client_account_id, updated_at DESC);
CREATE INDEX project_workspaces_provider_idx
  ON project_workspaces(provider_account_id, updated_at DESC);

ALTER TABLE project_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_workspaces FORCE ROW LEVEL SECURITY;

CREATE POLICY project_workspaces_tenant_read
  ON project_workspaces FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY project_workspaces_participant_read
  ON project_workspaces FOR SELECT
  USING (
    client_account_id = nullif(current_setting('app.account_id', true), '')::uuid
    OR provider_account_id = nullif(current_setting('app.account_id', true), '')::uuid
  );

CREATE POLICY project_workspaces_organization_insert
  ON project_workspaces FOR INSERT
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  );

CREATE POLICY project_workspaces_organization_update
  ON project_workspaces FOR UPDATE
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  );

CREATE TABLE project_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  project_id uuid NOT NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 5000),
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'submitted', 'revision_requested', 'accepted')
  ),
  due_at timestamptz,
  submitted_at timestamptz,
  accepted_at timestamptz,
  accepted_by_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT project_milestones_project_fk
    FOREIGN KEY (organization_id, project_id)
    REFERENCES project_workspaces(organization_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT project_milestones_sequence_unique
    UNIQUE (project_id, sequence_number),
  CONSTRAINT project_milestones_acceptance_check
    CHECK (
      (status = 'accepted' AND accepted_at IS NOT NULL AND accepted_by_account_id IS NOT NULL)
      OR
      (status <> 'accepted' AND accepted_at IS NULL AND accepted_by_account_id IS NULL)
    ),
  CONSTRAINT project_milestones_submission_check
    CHECK (
      status NOT IN ('submitted', 'revision_requested', 'accepted')
      OR submitted_at IS NOT NULL
    )
);

CREATE INDEX project_milestones_tenant_project_idx
  ON project_milestones(organization_id, project_id, sequence_number);

ALTER TABLE project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_milestones FORCE ROW LEVEL SECURITY;

CREATE POLICY project_milestones_tenant_read
  ON project_milestones FOR SELECT
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY project_milestones_participant_read
  ON project_milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_workspaces AS project
      WHERE project.organization_id = project_milestones.organization_id
        AND project.id = project_milestones.project_id
        AND (
          project.client_account_id =
            nullif(current_setting('app.account_id', true), '')::uuid
          OR project.provider_account_id =
            nullif(current_setting('app.account_id', true), '')::uuid
        )
    )
  );

CREATE POLICY project_milestones_organization_write
  ON project_milestones FOR ALL
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    AND current_setting('app.actor_type', true) = 'organization'
  );

CREATE POLICY project_milestones_provider_submit
  ON project_milestones FOR UPDATE
  USING (
    status IN ('pending', 'in_progress', 'revision_requested')
    AND current_setting('app.actor_type', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM project_workspaces AS project
      WHERE project.organization_id = project_milestones.organization_id
        AND project.id = project_milestones.project_id
        AND project.provider_account_id =
          nullif(current_setting('app.account_id', true), '')::uuid
    )
  )
  WITH CHECK (
    status = 'submitted'
    AND submitted_at IS NOT NULL
    AND current_setting('app.actor_type', true) = 'provider'
    AND EXISTS (
      SELECT 1 FROM project_workspaces AS project
      WHERE project.organization_id = project_milestones.organization_id
        AND project.id = project_milestones.project_id
        AND project.provider_account_id =
          nullif(current_setting('app.account_id', true), '')::uuid
    )
  );

COMMENT ON TABLE project_workspaces IS
  'Tenant-owned project created from an accepted opportunity application; client and provider participants may read through account-scoped RLS.';
COMMENT ON TABLE project_milestones IS
  'Ordered project deliverables with organization-controlled acceptance and provider-only submission.';
