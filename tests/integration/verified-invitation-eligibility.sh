#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RUNTIME_DATABASE_URL:?RUNTIME_DATABASE_URL is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATION="$ROOT_DIR/packages/database/prisma/migrations/20261109100000_verified_invitation_eligibility/migration.sql"
TENANT_ONE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
INVITATION_ID="55555555-5555-4555-8555-555555555555"
ACCOUNT_VERIFIED="77777777-7777-4777-8777-777777777777"
ACCOUNT_UNVERIFIED="88888888-8888-4888-8888-888888888888"

# The RLS harness provisions vv_runtime after the base migrations. Reapplying
# this idempotent function migration after role creation grants EXECUTE only
# to that role. The tracked migration runner still records the canonical hash.
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$MIGRATION"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO accounts (id) VALUES
  ('$ACCOUNT_VERIFIED'),
  ('$ACCOUNT_UNVERIFIED');

INSERT INTO external_identities
  (account_id, issuer, subject, email, email_verified)
VALUES
  (
    '$ACCOUNT_VERIFIED',
    'https://issuer.example/user_management/client',
    'verified-invitation-recipient',
    'one@example.test',
    true
  ),
  (
    '$ACCOUNT_UNVERIFIED',
    'https://issuer.example/user_management/client',
    'unverified-invitation-recipient',
    'one@example.test',
    false
  );

GRANT EXECUTE
  ON FUNCTION public.is_invitation_acceptance_eligible(uuid, bytea, uuid, text)
  TO vv_runtime;
SQL

function_privileges="$(psql "$DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 <<'SQL'
SELECT
  has_function_privilege(
    'vv_runtime',
    'public.is_invitation_acceptance_eligible(uuid,bytea,uuid,text)',
    'EXECUTE'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_proc AS proc_record
    JOIN pg_namespace AS proc_schema ON proc_schema.oid = proc_record.pronamespace
    CROSS JOIN LATERAL aclexplode(
      COALESCE(proc_record.proacl, acldefault('f', proc_record.proowner))
    ) AS privilege
    WHERE proc_schema.nspname = 'public'
      AND proc_record.proname = 'is_invitation_acceptance_eligible'
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  );
SQL
)"
if [[ "$function_privileges" != "t" ]]; then
  echo "Invitation eligibility function must be executable by vv_runtime only, not PUBLIC." >&2
  exit 1
fi

expect_failure() {
  local description="$1"
  local sql="$2"
  if psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "Expected runtime-role rejection: $description" >&2
    exit 1
  fi
  echo "Verified runtime-role rejection: $description"
}

expect_failure "runtime cannot select external identity email" \
  "SELECT email FROM external_identities LIMIT 1;"
expect_failure "runtime cannot select external identity email verification state" \
  "SELECT email_verified FROM external_identities LIMIT 1;"

check_predicate() {
  local expected="$1"
  local description="$2"
  local arguments="$3"
  local actual
  actual="$(
    psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT set_config('app.tenant_id', '$TENANT_ONE', true);
SELECT public.is_invitation_acceptance_eligible($arguments);
ROLLBACK;
SQL
  )"
  actual="$(printf '%s\n' "$actual" | tail -n 1)"
  if [[ "$actual" != "$expected" ]]; then
    echo "Invitation eligibility failed: $description (expected $expected, got $actual)." >&2
    exit 1
  fi
  echo "Verified invitation eligibility: $description"
}

check_predicate "t" "verified recipient with matching tenant, token and email" \
  "'$INVITATION_ID', decode(repeat('01', 32), 'hex'), '$ACCOUNT_VERIFIED', 'one@example.test'"
check_predicate "f" "wrong token hash" \
  "'$INVITATION_ID', decode(repeat('02', 32), 'hex'), '$ACCOUNT_VERIFIED', 'one@example.test'"
check_predicate "f" "email mismatch" \
  "'$INVITATION_ID', decode(repeat('01', 32), 'hex'), '$ACCOUNT_VERIFIED', 'other@example.test'"
check_predicate "f" "unverified external identity" \
  "'$INVITATION_ID', decode(repeat('01', 32), 'hex'), '$ACCOUNT_UNVERIFIED', 'one@example.test'"

without_tenant="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT public.is_invitation_acceptance_eligible('$INVITATION_ID', decode(repeat('01', 32), 'hex'), '$ACCOUNT_VERIFIED', 'one@example.test');"
)"
if [[ "$without_tenant" != "f" ]]; then
  echo "Invitation eligibility did not fail closed without tenant context." >&2
  exit 1
fi

echo "Verified invitation acceptance eligibility preserves private email columns and tenant context."
