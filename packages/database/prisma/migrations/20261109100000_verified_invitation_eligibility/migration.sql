-- Keep verified identity email values private from the application runtime role.
-- The API receives only a boolean eligibility result after it has locked the
-- tenant-scoped invitation row and supplied its token hash.
CREATE OR REPLACE FUNCTION public.is_invitation_acceptance_eligible(
  p_invitation_id uuid,
  p_token_hash bytea,
  p_account_id uuid,
  p_verified_email text
)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_invitations AS invitation
    JOIN public.accounts AS account
      ON account.id = p_account_id
     AND account.status = 'active'
    JOIN public.external_identities AS external_identity
      ON external_identity.account_id = account.id
     AND external_external_identity.email_verified IS TRUE
    WHERE invitation.id = p_invitation_id
      AND invitation.token_hash = p_token_hash
      AND invitation.organization_id::text =
        current_setting('app.tenant_id', true)
      AND invitation.accepted_at IS NULL
      AND invitation.revoked_at IS NULL
      AND invitation.expires_at > clock_timestamp()
      AND p_token_hash IS NOT NULL
      AND octet_length(p_token_hash) = 32
      AND p_account_id IS NOT NULL
      AND p_verified_email IS NOT NULL
      AND length(btrim(p_verified_email)) BETWEEN 3 AND 320
      AND lower(btrim(invitation.invited_email)) =
        lower(btrim(p_verified_email))
      AND lower(btrim(external_identity.email)) =
        lower(btrim(p_verified_email))
  );
$function$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.is_invitation_acceptance_eligible(uuid, bytea, uuid, text)
  FROM PUBLIC;

DO $grant_runtime$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vv_runtime') THEN
    GRANT EXECUTE
      ON FUNCTION public.is_invitation_acceptance_eligible(uuid, bytea, uuid, text)
      TO vv_runtime;
  END IF;
END;
$grant_runtime$;

COMMENT ON FUNCTION public.is_invitation_acceptance_eligible(uuid, bytea, uuid, text)
  IS 'Returns only whether an active account has a verified email matching the tenant-scoped pending invitation; does not expose identity email data.';
