#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RUNTIME_DATABASE_URL:?RUNTIME_DATABASE_URL is required}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/packages/database/prisma/migrations"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261105133000_identity_tenancy/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261105145000_audit_event_truncate_guard/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261105153000_invitation_token_lookup/migration.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE vv_runtime
  LOGIN PASSWORD 'runtime-test'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

GRANT CONNECT ON DATABASE volition_vector TO vv_runtime;
GRANT USAGE ON SCHEMA public TO vv_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON organizations, organization_memberships, organization_invitations, audit_events
  TO vv_runtime;

-- Deliberately grant TRUNCATE in this test: the trigger must preserve the
-- append-only invariant even if a runtime grant is accidentally too broad.
GRANT TRUNCATE ON audit_events TO vv_runtime;

INSERT INTO accounts (id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

INSERT INTO organizations (id, name, slug, created_by_account_id) VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'Tenant One',
    'tenant-one',
    '11111111-1111-4111-8111-111111111111'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'Tenant Two',
    'tenant-two',
    '22222222-2222-4222-8222-222222222222'
  );

INSERT INTO organization_memberships
  (id, organization_id, account_id, role) VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'owner'
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'owner'
  );

INSERT INTO organization_invitations
  (id, organization_id, invited_email, role, token_hash, invited_by_account_id, expires_at)
VALUES
  (
    '55555555-5555-4555-8555-555555555555',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'one@example.test',
    'member',
    decode(repeat('01', 32), 'hex'),
    '11111111-1111-4111-8111-111111111111',
    now() + interval '1 day'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'two@example.test',
    'member',
    decode(repeat('02', 32), 'hex'),
    '22222222-2222-4222-8222-222222222222',
    now() + interval '1 day'
  );

INSERT INTO audit_events
  (id, organization_id, actor_account_id, event_name, resource_type, resource_id)
VALUES
  (
    '77777777-7777-4777-8777-777777777777',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'member.created',
    'membership',
    'membership-one'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'member.created',
    'membership',
    'membership-two'
  );
SQL

assert_count() {
  local table="$1"
  local tenant_id="$2"
  local expected="$3"
  local actual
  actual="$(
    psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
      -c "SET app.tenant_id = '$tenant_id'; SELECT count(*) FROM $table;"
  )"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $expected rows in $table for tenant $tenant_id; got $actual" >&2
    exit 1
  fi
}

expect_failure() {
  local description="$1"
  local sql="$2"
  if psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "Expected database operation to fail: $description" >&2
    exit 1
  fi
  echo "Verified rejection: $description"
}

TENANT_ONE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
TENANT_TWO="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ACCOUNT_ONE="11111111-1111-4111-8111-111111111111"

for table in organizations organization_memberships organization_invitations audit_events; do
  assert_count "$table" "$TENANT_ONE" 1
  assert_count "$table" "$TENANT_TWO" 1
done

# A SHA-256 bearer-token hash can locate exactly one invitation before the
# tenant is known. A non-matching hash must reveal no invitation rows.
psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $
BEGIN
  PERFORM set_config('app.invitation_token_hash', repeat('01', 32), true);
  IF (SELECT count(*) FROM organization_invitations) <> 1 THEN
    RAISE EXCEPTION 'token hash lookup did not isolate the matching invitation';
  END IF;
  PERFORM set_config('app.invitation_token_hash', repeat('03', 32), true);
  IF (SELECT count(*) FROM organization_invitations) <> 0 THEN
    RAISE EXCEPTION 'non-matching token hash exposed an invitation';
  END IF;
END
$;
ROLLBACK;
SQL

without_tenant="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM organizations;"
)"
if [[ "$without_tenant" != "0" ]]; then
  echo "Expected no tenant rows without transaction context; got $without_tenant" >&2
  exit 1
fi

expect_failure "cross-tenant organization insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO organizations (id, name, slug, created_by_account_id) VALUES ('99999999-9999-4999-8999-999999999999', 'Spoofed', 'spoofed-tenant', '$ACCOUNT_ONE');"

expect_failure "cross-tenant membership insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO organization_memberships (organization_id, account_id, role) VALUES ('$TENANT_TWO', '$ACCOUNT_ONE', 'member');"

expect_failure "audit event update" \
  "SET app.tenant_id = '$TENANT_ONE'; UPDATE audit_events SET event_name = 'tampered' WHERE id = '77777777-7777-4777-8777-777777777777';"

expect_failure "audit event delete" \
  "SET app.tenant_id = '$TENANT_ONE'; DELETE FROM audit_events WHERE id = '77777777-7777-4777-8777-777777777777';"

expect_failure "audit event truncate" "TRUNCATE audit_events;"

assert_count audit_events "$TENANT_ONE" 1
assert_count audit_events "$TENANT_TWO" 1

echo "PostgreSQL tenant RLS and append-only audit integration checks passed."
