-- Trust evidence intake is account-owned and private by default.
-- Runtime roles may submit and read scoped evidence, but cannot mutate or delete
-- evidence records until a separately reviewed audit-backed review workflow exists.
CREATE TABLE trust_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  submitted_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  claim_type text NOT NULL CHECK (
    claim_type IN ('identity', 'qualification', 'capability', 'work_history')
  ),
  claim_title text NOT NULL CHECK (length(btrim(claim_title)) BETWEEN 1 AND 200),
  issuer_name text NOT NULL CHECK (length(btrim(issuer_name)) BETWEEN 1 AND 200),
  issuer_reference text CHECK (
    issuer_reference IS NULL OR length(btrim(issuer_reference)) BETWEEN 1 AND 500
  ),
  evidence_locator text NOT NULL CHECK (
    length(btrim(evidence_locator)) BETWEEN 1 AND 2048
  ),
  status text NOT NULL DEFAULT 'submitted' CHECK (
    status IN ('submitted', 'under_review', 'verified', 'rejected', 'revoked', 'expired')
  ),
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  decision_note text CHECK (
    decision_note IS NULL OR length(decision_note) <= 2000
  ),
  CONSTRAINT trust_evidence_review_fields_check CHECK (
    (reviewed_at IS NULL AND reviewed_by_account_id IS NULL)
    OR (reviewed_at IS NOT NULL AND reviewed_by_account_id IS NOT NULL)
  ),
  CONSTRAINT trust_evidence_review_status_check CHECK (
    status IN ('submitted', 'under_review')
    OR (reviewed_at IS NOT NULL AND reviewed_by_account_id IS NOT NULL)
  ),
  CONSTRAINT trust_evidence_submitter_is_subject_check CHECK (
    submitted_by_account_id = subject_account_id
  )
);

CREATE INDEX trust_evidence_subject_status_idx
  ON trust_evidence(subject_account_id, status, submitted_at DESC);
CREATE INDEX trust_evidence_organization_idx
  ON trust_evidence(organization_id, submitted_at DESC)
  WHERE organization_id IS NOT NULL;

ALTER TABLE trust_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY trust_evidence_account_read
  ON trust_evidence
  FOR SELECT
  USING (
    subject_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
  );

CREATE POLICY trust_evidence_organization_read
  ON trust_evidence
  FOR SELECT
  USING (
    organization_id =
      nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY trust_evidence_account_submit
  ON trust_evidence
  FOR INSERT
  WITH CHECK (
    subject_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND submitted_by_account_id =
      nullif(current_setting('app.account_id', true), '')::uuid
    AND status = 'submitted'
    AND (
      organization_id IS NULL
      OR organization_id =
        nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

COMMENT ON TABLE trust_evidence IS
  'Private evidence intake. Runtime access is account-scoped for reads and self-submission only; review transitions and deletion require a future audited Trust workflow.';
COMMENT ON COLUMN trust_evidence.evidence_locator IS
  'Opaque private object-storage key; never a public URL, signed URL, or raw evidence payload.';
