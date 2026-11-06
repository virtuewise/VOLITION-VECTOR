CREATE TABLE service_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  created_by_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  summary text NOT NULL CHECK (length(btrim(summary)) BETWEEN 1 AND 320),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 10000),
  category text NOT NULL CHECK (category ~ '^[a-z][a-z0-9-]{1,62}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'published', 'paused', 'closed', 'archived')
  ),
  visibility text NOT NULL DEFAULT 'public' CHECK (
    visibility IN ('public', 'organization')
  ),
  delivery_mode text NOT NULL DEFAULT 'remote' CHECK (
    delivery_mode IN ('remote', 'onsite', 'hybrid')
  ),
  pricing_model text NOT NULL DEFAULT 'quote' CHECK (
    pricing_model IN ('fixed', 'hourly', 'starting_at', 'quote')
  ),
  price_amount numeric(14, 2) CHECK (price_amount IS NULL OR price_amount >= 0),
  price_currency char(3),
  location_label text CHECK (
    location_label IS NULL OR length(btrim(location_label)) <= 200
  ),
  expires_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  search_document tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '')
    )
  ) STORED,
  CONSTRAINT service_listings_pricing_check CHECK (
    (pricing_model = 'quote' AND price_amount IS NULL AND price_currency IS NULL)
    OR
    (pricing_model <> 'quote' AND price_amount IS NOT NULL AND price_currency ~ '^[A-Z]{3}$')
  ),
  CONSTRAINT service_listings_expiry_check
    CHECK (expires_at IS NULL OR expires_at > created_at),
  CONSTRAINT service_listings_slug_unique UNIQUE (organization_id, slug)
);

CREATE INDEX service_listings_tenant_status_updated_idx
  ON service_listings(organization_id, status, updated_at DESC);
CREATE INDEX service_listings_public_search_idx
  ON service_listings USING GIN(search_document);
CREATE INDEX service_listings_public_published_idx
  ON service_listings(published_at DESC, id)
  WHERE status = 'published' AND visibility = 'public';

ALTER TABLE service_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_listings FORCE ROW LEVEL SECURITY;

CREATE POLICY service_listings_tenant_access
  ON service_listings
  USING (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  );

CREATE POLICY service_listings_public_read
  ON service_listings
  FOR SELECT
  USING (status = 'published' AND visibility = 'public');

CREATE VIEW public_service_listings WITH (security_invoker = true) AS
SELECT
  id,
  organization_id,
  slug,
  title,
  summary,
  category,
  delivery_mode,
  pricing_model,
  price_amount,
  price_currency,
  location_label,
  published_at,
  expires_at,
  search_document
FROM service_listings
WHERE status = 'published'
  AND visibility = 'public';

COMMENT ON TABLE service_listings IS
  'Organization-owned service offers. Draft and organization-only rows are tenant-isolated by RLS.';
COMMENT ON VIEW public_service_listings IS
  'Safe public projection of published public services; uses invoker RLS and excludes creator account identifiers.';
