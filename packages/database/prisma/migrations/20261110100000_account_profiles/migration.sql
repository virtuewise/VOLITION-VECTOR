-- Private individual account profile and account-scoped audit foundation.
-- Apply with the dedicated migration owner; application traffic uses vv_runtime.

CREATE TABLE public.account_profiles (
  account_id uuid PRIMARY KEY REFERENCES public.accounts(id) ON DELETE CASCADE,
  display_name text
    CHECK (
      display_name IS NULL OR
      length(trim(display_name)) BETWEEN 1 AND 120
    ),
  locale text NOT NULL DEFAULT 'en'
    CHECK (locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  time_zone text NOT NULL DEFAULT 'UTC'
    CHECK (length(time_zone) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.account_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_profiles FORCE ROW LEVEL SECURITY;

CREATE FUNCTION public.touch_account_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$;

CREATE TRIGGER account_profiles_touch_updated_at
  BEFORE UPDATE ON public.account_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_account_profile_updated_at();

CREATE POLICY account_profiles_self_access
  ON public.account_profiles
  USING (
    account_id = nullif(current_setting('app.account_id', true), '')::uuid
  )
  WITH CHECK (
    account_id = nullif(current_setting('app.account_id', true), '')::uuid
  );

CREATE TABLE public.account_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  actor_account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  event_name text NOT NULL
    CHECK (length(trim(event_name)) BETWEEN 1 AND 160),
  resource_type text NOT NULL
    CHECK (length(trim(resource_type)) BETWEEN 1 AND 120),
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT account_audit_events_self_actor
    CHECK (actor_account_id = account_id)
);

CREATE INDEX account_audit_events_account_occurred_idx
  ON public.account_audit_events(account_id, occurred_at DESC);

ALTER TABLE public.account_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY account_audit_events_self_access
  ON public.account_audit_events
  USING (
    account_id = nullif(current_setting('app.account_id', true), '')::uuid
    AND actor_account_id = nullif(current_setting('app.account_id', true), '')::uuid
  )
  WITH CHECK (
    account_id = nullif(current_setting('app.account_id', true), '')::uuid
    AND actor_account_id = nullif(current_setting('app.account_id', true), '')::uuid
  );

CREATE FUNCTION public.prevent_account_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'account_audit_events are append-only';
END;
$$;

CREATE TRIGGER account_audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON public.account_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_account_audit_event_mutation();

CREATE TRIGGER account_audit_events_no_truncate
  BEFORE TRUNCATE ON public.account_audit_events
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.prevent_account_audit_event_mutation();

REVOKE ALL ON TABLE public.account_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.account_audit_events FROM PUBLIC;
REVOKE ALL ON FUNCTION public.touch_account_profile_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_account_audit_event_mutation() FROM PUBLIC;

DO $account_profile_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vv_runtime') THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE public.account_profiles TO vv_runtime;
    GRANT INSERT ON TABLE public.account_audit_events TO vv_runtime;
    REVOKE DELETE, TRUNCATE ON TABLE public.account_profiles FROM vv_runtime;
    REVOKE SELECT, UPDATE, DELETE, TRUNCATE
      ON TABLE public.account_audit_events FROM vv_runtime;
  END IF;
END;
$account_profile_runtime_grants$;
