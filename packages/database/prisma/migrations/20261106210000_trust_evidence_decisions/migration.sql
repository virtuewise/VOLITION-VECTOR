-- Append-only review history is separated from the mutable evidence projection.
-- Runtime roles can read scoped decisions but cannot create, edit or delete them;
-- a later reviewer workflow must add a narrowly scoped audited write boundary.
CREATE TABLE trust_evidence_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES trust_evidence(id) ON DELETE RESTRICT,
  reviewer_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (
    decision IN ('verified', 'rejected', 'revoked', 'expired')
  ),
  decision_note text CHECK (
    decision_note IS NULL OR length(decision_note) <= 2000
  ),
  decided_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX trust_evidence_decisions_evidence_idx
  ON trust_evidence_decisions(evidence_id, decided_at DESC, id);

ALTER TABLE trust_evidence_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_evidence_decisions FORCE ROW LEVEL SECURITY;

CREATE POLICY trust_evidence_decisions_subject_read
  ON trust_evidence_decisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM trust_evidence AS evidence
      WHERE evidence.id = trust_evidence_decisions.evidence_id
        AND evidence.subject_account_id =
          nullif(current_setting('app.account_id', true), '')::uuid
    )
  );

CREATE POLICY trust_evidence_decisions_organization_read
  ON trust_evidence_decisions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM trust_evidence AS evidence
      WHERE evidence.id = trust_evidence_decisions.evidence_id
        AND evidence.organization_id =
          nullif(current_setting('app.tenant_id', true), '')::uuid
    )
  );

CREATE FUNCTION reject_trust_evidence_decision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'trust evidence decisions are append-only'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER trust_evidence_decisions_immutable
  BEFORE UPDATE OR DELETE ON trust_evidence_decisions
  FOR EACH ROW
  EXECUTE FUNCTION reject_trust_evidence_decision_mutation();

COMMENT ON TABLE trust_evidence_decisions IS
  'Append-only review history. Runtime access is read-only and scoped to the evidence subject or associated organization; reviewer writes require a separately reviewed audited workflow.';
