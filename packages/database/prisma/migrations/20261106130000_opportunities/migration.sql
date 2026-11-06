CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 320),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10000),
  opportunity_type text NOT NULL CHECK (
    opportunity_type IN ('employment', 'project', 'tender', 'partnership', 'volunteering')
  ),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'paused', 'closed', 'archived')
  ),
  visibility text NOT NULL DEFAULT 'public' CHECK (
    visibility IN ('public', 'organization')
  ),
  location_label text CHECK (location_label IS NULL OR length(btrim(location_label)) <= 200),
  is_remote boolean NOT NULL DEFAULT false,
  compensation_min numeric(14, 2) CHECK (compensation_min IS NULL OR compensation_min >= 0),
  compensation_max numeric(14, 2) CHECK (compensation_max IS NULL OR compensation_max >= 0),
  compensation_currency char(3),
  starts_at timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(description, '')
    )
  ) STORED,
  CONSTRAINT opportunities_compensation_range_check
    CHECK (
      compensation_min IS NULL OR
      compensation_max IS NULL OR
      compensation_max >= compensation_min
    ),
  CONSTRAINT opportunities_compensation_currency_check
    CHECK (
      (compensation_min IS NULL AND compensation_max IS NULL AND compensation_currency IS NULL)
      OR
      (
        (compensation_min IS NOT NULL OR compensation_max IS NOT NULL)
        AND compensation_currency ~ '^[A-Z]{3}$'
      )
    ),
  CONSTRAINT opportunities_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT opportunities_slug_unique UNIQUE (organization_id, slug)
);

CREATE INDEX opportunities_tenant_status_updated_idx
  ON opportunities(organization_id, status, updated_at DESC);
CREATE INDEX opportunities_public_search_idx
  ON opportunities USING GIN(search_document);
CREATE INDEX opportunities_public_published_idx
  ON opportunities(published_at DESC, id)
  WHERE status = 'published' AND visibility = 'public';

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities FORCE ROW LEVEL SECURITY;

CREATE POLICY opportunities_tenant_access
  ON opportunities
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY opportunities_public_read
  ON opportunities
  FOR SELECT
  USING (status = 'published' AND visibility = 'public');

CREATE VIEW public_opportunities WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  slug,
  title,
  summary,
  opportunity_type,
  location_label,
  is_remote,
  compensation_min,
  compensation_max,
  compensation_currency,
  published_at,
  expires_at,
  created_at,
  updated_at,
  search_document
FROM opportunities
WHERE status = 'published'
  AND visibility = 'public';

COMMENT ON TABLE opportunities IS
  'Organization-owned opportunity listings. Draft and organization-only rows are tenant-isolated by RLS.';
COMMENT ON VIEW public_opportunities IS
  'Safe public projection of published public opportunities; uses invoker RLS and excludes creator account identifiers.';
