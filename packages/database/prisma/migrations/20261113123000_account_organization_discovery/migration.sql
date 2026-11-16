-- Allow a verified account to discover only its own active organization memberships.
-- Discovery is account-scoped, not tenant-scoped; normal tenant access remains unchanged.
-- Both policies are SELECT-only and require an account context with no tenant context.

CREATE POLICY organization_memberships_account_discovery
  ON public.organization_memberships
  FOR SELECT
  USING (
    nullif(current_setting('app.tenant_id', true), '') IS NULL
    AND account_id = nullif(current_setting('app.account_id', true), '')::uuid
    AND status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.accounts AS account
      WHERE account.id = organization_memberships.account_id
        AND account.status = 'active'
    )
  );

CREATE POLICY organizations_account_discovery
  ON public.organizations
  FOR SELECT
  USING (
    nullif(current_setting('app.tenant_id', true), '') IS NULL
    AND organizations.status = 'active'
    AND EXISTS (
      SELECT 1
      FROM public.organization_memberships AS membership
      WHERE membership.organization_id = organizations.id
        AND membership.account_id =
          nullif(current_setting('app.account_id', true), '')::uuid
        AND membership.status = 'active'
        AND EXISTS (
          SELECT 1
          FROM public.accounts AS account
          WHERE account.id = membership.account_id
            AND account.status = 'active'
        )
    )
  );

COMMENT ON POLICY organization_memberships_account_discovery
  ON public.organization_memberships IS
  'Allows account-scoped discovery of the caller own memberships only when no tenant context is set.';

COMMENT ON POLICY organizations_account_discovery
  ON public.organizations IS
  'Allows account-scoped discovery of organizations with the caller active membership only when no tenant context is set.';
