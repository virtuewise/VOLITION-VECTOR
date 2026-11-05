-- TRUNCATE does not fire row-level UPDATE/DELETE triggers. Preserve the
-- append-only audit invariant for runtime roles that happen to have TRUNCATE.
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_event_mutation();
