-- Private organization profile foundation. Public publication is a separate decision.
-- Apply with the dedicated migration owner; API traffic uses vv_runtime.

CREATE TABLE public.organization_profiles (
  organization_id uuid PRIMARY KEY
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  description text
    CHECK (
      description IS NULL OR
      length(trim(description)) BETWEEN 1 AND 2000
    ),
  website_url text
    CHECK (
      website_url IS NULL OR
      (
        length(website_url) <= 2048
        AND website_url ~ '^https://[^[:space:]]+$'
      )
    ),
  country_code text
    CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  locale text NOT NULL DEFAULT 'en'
    CHECK (locale ~ '^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$'),
  time_zone text NOT NULL DEFAULT 'UTC'
    CHECK (length(trim(time_zone)) BETWEEN 1 AND 64),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.organization_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_profiles_tenant_isolation
  ON public.organization_profiles
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

REVOKE ALL ON TABLE public.organization_profiles FROM PUBLIC;

DO $organization_profile_runtime_grants$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vv_runtime') THEN
    GRANT SELECT, INSERT, UPDATE
      ON TABLE public.organization_profiles TO vv_runtime;
    REVOKE DELETE, TRUNCATE
      ON TABLE public.organization_profiles FROM vv_runtime;
  END IF;
END;
$organization_profile_runtime_grants$;
