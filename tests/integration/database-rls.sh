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
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106110000_invitation_rate_limits/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106130000_opportunities/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106150000_service_listings/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106170000_opportunity_applications/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106190000_application_conversations/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106190000_project_workspaces/migration.sql"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -f "$MIGRATIONS_DIR/20261106190000_immutable_journal/migration.sql"

psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE vv_runtime
  LOGIN PASSWORD 'runtime-test'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;

GRANT CONNECT ON DATABASE volition_vector TO vv_runtime;
GRANT USAGE ON SCHEMA public TO vv_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON organizations, organization_memberships, organization_invitations,
     organization_invitation_rate_limits, opportunities, opportunity_applications, conversations, conversation_participants, messages, project_workspaces, project_milestones, service_listings, audit_events, journal_entries, journal_entry_lines
  TO vv_runtime;
GRANT SELECT ON public_opportunities, public_service_listings TO vv_runtime;
GRANT SELECT, INSERT ON journal_entries, journal_entry_lines TO vv_runtime;

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

INSERT INTO organization_invitation_rate_limits
  (organization_id, scope, scope_hash, window_started_at, attempt_count, last_attempt_at)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'actor',
    decode(repeat('11', 32), 'hex'),
    now(),
    1,
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'actor',
    decode(repeat('22', 32), 'hex'),
    now(),
    1,
    now()
  );

INSERT INTO opportunities (
  organization_id,
  created_by_account_id,
  slug,
  title,
  summary,
  description,
  opportunity_type,
  status,
  visibility,
  published_at
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'tenant-one-public',
    'Tenant One Public Role',
    'Public opportunity for tenant one',
    'Detailed public role description',
    'employment',
    'published',
    'public',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'tenant-two-public',
    'Tenant Two Public Project',
    'Public opportunity for tenant two',
    'Detailed public project description',
    'project',
    'published',
    'public',
    now()
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'tenant-one-private-draft',
    'Tenant One Private Draft',
    'Draft must not be publicly discoverable',
    'Private draft description',
    'project',
    'draft',
    'organization',
    NULL
  );

INSERT INTO service_listings (
  organization_id, created_by_account_id, slug, title, summary, description,
  category, status, visibility, delivery_mode, pricing_model, price_amount,
  price_currency, published_at
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-4111-8111-111111111111',
    'tenant-one-public-service',
    'Tenant One Public Consulting',
    'Public consulting service',
    'Consulting description',
    'consulting',
    'published',
    'public',
    'remote',
    'hourly',
    125.00,
    'USD',
    now()
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-4222-8222-222222222222',
    'tenant-two-private-service',
    'Tenant Two Private Draft Service',
    'Private service draft',
    'Private service description',
    'design',
    'draft',
    'organization',
    'hybrid',
    'quote',
    NULL,
    NULL,
    NULL
  );

INSERT INTO accounts (id) VALUES
  ('44444444-4444-4444-8444-444444444444'),
  ('55555555-5555-4555-8555-555555555555');

INSERT INTO opportunity_applications (
  organization_id, opportunity_id, applicant_account_id,
  opportunity_slug_snapshot, opportunity_title_snapshot,
  opportunity_type_snapshot, cover_note
)
SELECT
  organization_id, id, '44444444-4444-4444-8444-444444444444',
  slug, title, opportunity_type, 'Application from tenant one candidate'
FROM opportunities
WHERE slug = 'tenant-one-public';

INSERT INTO opportunity_applications (
  organization_id, opportunity_id, applicant_account_id,
  opportunity_slug_snapshot, opportunity_title_snapshot,
  opportunity_type_snapshot, cover_note
)
SELECT
  organization_id, id, '55555555-5555-4555-8555-555555555555',
  slug, title, opportunity_type, 'Application from tenant two candidate'
FROM opportunities
WHERE slug = 'tenant-two-public';

UPDATE opportunity_applications
SET status = 'accepted',
    reviewed_at = clock_timestamp(),
    reviewed_by_account_id = '11111111-1111-4111-8111-111111111111'
WHERE applicant_account_id = '44444444-4444-4444-8444-444444444444';

INSERT INTO conversations (
  id, organization_id, opportunity_application_id, created_by_account_id
)
SELECT
  '99999999-9999-4999-8999-999999999998',
  organization_id,
  id,
  '11111111-1111-4111-8111-111111111111'
FROM opportunity_applications
WHERE applicant_account_id = '44444444-4444-4444-8444-444444444444';

INSERT INTO conversation_participants (
  organization_id, conversation_id, account_id, participant_type
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '99999999-9999-4999-8999-999999999998',
    '44444444-4444-4444-8444-444444444444',
    'applicant'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '99999999-9999-4999-8999-999999999998',
    '11111111-1111-4111-8111-111111111111',
    'organization'
  );

INSERT INTO messages (
  organization_id, conversation_id, sender_account_id, body
)
VALUES
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '99999999-9999-4999-8999-999999999998',
    '44444444-4444-4444-8444-444444444444',
    'Thank you for considering my application.'
  ),
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '99999999-9999-4999-8999-999999999998',
    '11111111-1111-4111-8111-111111111111',
    'We would like to arrange an introductory call.'
  );

INSERT INTO project_workspaces (
  id, organization_id, opportunity_application_id, opportunity_id,
  client_account_id, provider_account_id, title, description
)
SELECT
  '99999999-9999-4999-8999-999999999998',
  application.organization_id, application.id, application.opportunity_id,
  '11111111-1111-4111-8111-111111111111',
  application.applicant_account_id,
  'Tenant One Project', 'Project created from an accepted opportunity application'
FROM opportunity_applications AS application
WHERE application.applicant_account_id = '44444444-4444-4444-8444-444444444444';

INSERT INTO project_milestones (
  organization_id, project_id, title, description, sequence_number
)
VALUES (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '99999999-9999-4999-8999-999999999998',
  'Discovery', 'Complete discovery and agree scope', 1
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

# Exercise the same startup trust checks used by PostgresTenantConnectionPool.
runtime_role_safe="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 <<'SQL'
SELECT
  NOT role.rolsuper
  AND NOT role.rolbypassrls
  AND NOT role.rolreplication
  AND NOT EXISTS (
    SELECT 1
    FROM pg_class AS c
    JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public'
      AND c.relname = ANY(ARRAY[
        'organizations',
        'organization_memberships',
        'organization_invitations',
        'organization_invitation_rate_limits',
        'opportunities',
        'opportunity_applications',
        'conversations',
        'conversation_participants',
        'messages',
        'project_workspaces',
        'project_milestones',
        'service_listings',
        'audit_events',
        'journal_entries',
        'journal_entry_lines'
      ]::text[])
      AND (
        c.relowner = role.oid OR
        pg_has_role(role.oid, c.relowner, 'MEMBER')
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles AS privileged
    WHERE (
      privileged.rolsuper OR
      privileged.rolbypassrls OR
      privileged.rolreplication
    )
      AND pg_has_role(role.oid, privileged.oid, 'MEMBER')
  )
  AND (
    SELECT count(*) = 15
    FROM pg_class AS c
    JOIN pg_namespace AS nsp ON nsp.oid = c.relnamespace
    WHERE nsp.nspname = 'public'
      AND c.relname = ANY(ARRAY[
        'organizations',
        'organization_memberships',
        'organization_invitations',
        'organization_invitation_rate_limits',
        'opportunities',
        'opportunity_applications',
        'conversations',
        'conversation_participants',
        'messages',
        'project_workspaces',
        'project_milestones',
        'service_listings',
        'audit_events',
        'journal_entries',
        'journal_entry_lines'
      ]::text[])
      AND c.relrowsecurity
      AND c.relforcerowsecurity
  )
FROM pg_roles AS role
WHERE role.rolname = current_user;
SQL
)"
if [[ "$runtime_role_safe" != "t" ]]; then
  echo "Runtime PostgreSQL role or tenant RLS configuration failed the startup gate." >&2
  exit 1
fi

for table in organizations organization_memberships organization_invitations organization_invitation_rate_limits opportunity_applications audit_events; do
  assert_count "$table" "$TENANT_ONE" 1
  assert_count "$table" "$TENANT_TWO" 1
done
# Public rows are visible across tenants; drafts remain tenant-private.
assert_count opportunities "$TENANT_ONE" 3
assert_count opportunities "$TENANT_TWO" 2
assert_count service_listings "$TENANT_ONE" 1
assert_count service_listings "$TENANT_TWO" 2
assert_count conversations "$TENANT_ONE" 1
assert_count conversations "$TENANT_TWO" 0
assert_count conversation_participants "$TENANT_ONE" 2
assert_count conversation_participants "$TENANT_TWO" 0
assert_count messages "$TENANT_ONE" 2
assert_count messages "$TENANT_TWO" 0

tenant_one_drafts="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.tenant_id = '$TENANT_ONE'; SELECT count(*) FROM opportunities WHERE status = 'draft';"
)"
tenant_two_drafts="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.tenant_id = '$TENANT_TWO'; SELECT count(*) FROM opportunities WHERE status = 'draft';"
)"
if [[ "$tenant_one_drafts" != "1" || "$tenant_two_drafts" != "0" ]]; then
  echo "Private opportunity drafts crossed tenant boundaries." >&2
  exit 1
fi

# A SHA-256 bearer-token hash can locate exactly one invitation before the
# tenant is known. A non-matching hash must reveal no invitation rows.
psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DO $vv$
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
$vv$;
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

# Public RLS and the invoker-security view expose published public rows only.
public_opportunity_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM public_opportunities;"
)"
if [[ "$public_opportunity_count" != "2" ]]; then
  echo "Expected two published public opportunities without tenant context; got $public_opportunity_count" >&2
  exit 1
fi
public_service_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM public_service_listings;"
)"
if [[ "$public_service_count" != "1" ]]; then
  echo "Expected one published public service listing; got $public_service_count" >&2
  exit 1
fi
private_service_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM public_service_listings WHERE slug = 'tenant-two-private-service';"
)"
if [[ "$private_service_count" != "0" ]]; then
  echo "A private service draft leaked into the public service listing view." >&2
  exit 1
fi

tenant_one_applications="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SELECT count(*) FROM opportunity_applications;"
)"
tenant_two_applications="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '55555555-5555-4555-8555-555555555555'; SELECT count(*) FROM opportunity_applications;"
)"
if [[ "$tenant_one_applications" != "1" || "$tenant_two_applications" != "1" ]]; then
  echo "Applicant-scoped RLS did not isolate each candidate's own applications." >&2
  exit 1
fi
applicant_conversation_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SELECT count(*) FROM conversations;"
)"
applicant_message_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SELECT count(*) FROM messages;"
)"
other_applicant_conversation_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '55555555-5555-4555-8555-555555555555'; SELECT count(*) FROM conversations;"
)"
if [[ "$applicant_conversation_count" != "1" || "$applicant_message_count" != "2" || "$other_applicant_conversation_count" != "0" ]]; then
  echo "Conversation or message RLS exposed records outside the participant account." >&2
  exit 1
fi
cross_applicant_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SELECT count(*) FROM opportunity_applications WHERE applicant_account_id = '55555555-5555-4555-8555-555555555555';"
)"
project_provider_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SELECT count(*) FROM project_workspaces;"
)"
if [[ "$project_provider_count" != "1" ]]; then
  echo "The accepted applicant could not read their project workspace." >&2
  exit 1
fi
project_nonparticipant_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '55555555-5555-4555-8555-555555555555'; SELECT count(*) FROM project_workspaces;"
)"
if [[ "$project_nonparticipant_count" != "0" ]]; then
  echo "A non-participant read another account's project workspace." >&2
  exit 1
fi
provider_milestone_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SELECT count(*) FROM project_milestones;"
)"
if [[ "$provider_milestone_count" != "1" ]]; then
  echo "The project provider could not read the project milestone." >&2
  exit 1
fi
expect_failure "provider cannot rewrite milestone scope while submitting" \
  "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SET app.actor_type = 'provider'; UPDATE project_milestones SET status = 'submitted', submitted_at = clock_timestamp(), title = 'Changed scope' WHERE project_id = '99999999-9999-4999-8999-999999999998' AND sequence_number = 1;"

psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "SET app.account_id = '44444444-4444-4444-8444-444444444444'; SET app.actor_type = 'provider'; UPDATE project_milestones SET status = 'submitted', submitted_at = clock_timestamp() WHERE project_id = '99999999-9999-4999-8999-999999999998' AND sequence_number = 1;"
psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -c "SET app.tenant_id = '$TENANT_ONE'; SET app.actor_type = 'organization'; UPDATE project_milestones SET status = 'accepted', accepted_at = clock_timestamp(), accepted_by_account_id = '$ACCOUNT_ONE' WHERE project_id = '99999999-9999-4999-8999-999999999998' AND sequence_number = 1;"

if [[ "$cross_applicant_count" != "0" ]]; then
  echo "An applicant read another candidate's application." >&2
  exit 1
fi

private_public_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SELECT count(*) FROM public_opportunities WHERE slug = 'tenant-one-private-draft';"
)"
if [[ "$private_public_count" != "0" ]]; then
  echo "A private draft leaked into the public opportunity view." >&2
  exit 1
fi

expect_failure "cross-tenant organization insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO organizations (id, name, slug, created_by_account_id) VALUES ('99999999-9999-4999-8999-999999999999', 'Spoofed', 'spoofed-tenant', '$ACCOUNT_ONE');"

expect_failure "cross-tenant membership insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO organization_memberships (organization_id, account_id, role) VALUES ('$TENANT_TWO', '$ACCOUNT_ONE', 'member');"

expect_failure "cross-tenant invitation rate-limit insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO organization_invitation_rate_limits (organization_id, scope, scope_hash, window_started_at, attempt_count, last_attempt_at) VALUES ('$TENANT_TWO', 'actor', decode(repeat('33', 32), 'hex'), now(), 1, now());"

expect_failure "cross-tenant opportunity insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO opportunities (organization_id, created_by_account_id, slug, title, summary, description, opportunity_type) VALUES ('$TENANT_TWO', '$ACCOUNT_ONE', 'cross-tenant-test', 'Cross tenant', 'Must fail', 'Cross tenant row', 'project');"

expect_failure "cross-tenant service listing insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO service_listings (organization_id, created_by_account_id, slug, title, summary, description, category, pricing_model) VALUES ('$TENANT_TWO', '$ACCOUNT_ONE', 'cross-tenant-service', 'Cross tenant service', 'Must fail', 'Cross tenant service', 'consulting', 'quote');"

expect_failure "cross-tenant application insert" \
  "SET app.tenant_id = '$TENANT_ONE'; SET app.account_id = '44444444-4444-4444-8444-444444444444'; SET app.actor_type = 'applicant'; INSERT INTO opportunity_applications (organization_id, opportunity_id, applicant_account_id, opportunity_slug_snapshot, opportunity_title_snapshot, opportunity_type_snapshot) SELECT organization_id, id, '44444444-4444-4444-8444-444444444444', slug, title, opportunity_type FROM opportunities WHERE slug = 'tenant-two-public';"

expect_failure "project creation from unaccepted application" \
  "SET app.tenant_id = '$TENANT_TWO'; SET app.actor_type = 'organization'; INSERT INTO project_workspaces (organization_id, opportunity_application_id, opportunity_id, client_account_id, provider_account_id, title, description) SELECT organization_id, id, opportunity_id, '22222222-2222-4222-8222-222222222222', applicant_account_id, 'Premature project', 'Must require accepted application' FROM opportunity_applications WHERE applicant_account_id = '55555555-5555-4555-8555-555555555555';"

expect_failure "project provider must match accepted applicant" \
  "SET app.tenant_id = '$TENANT_ONE'; SET app.actor_type = 'organization'; INSERT INTO project_workspaces (organization_id, opportunity_application_id, opportunity_id, client_account_id, provider_account_id, title, description) SELECT organization_id, id, opportunity_id, '11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555', 'Wrong provider', 'Must be the accepted applicant' FROM opportunity_applications WHERE applicant_account_id = '44444444-4444-4444-8444-444444444444';"

expect_failure "application insert for another applicant" \
  "SET app.tenant_id = '$TENANT_ONE'; SET app.account_id = '44444444-4444-4444-8444-444444444444'; SET app.actor_type = 'applicant'; INSERT INTO opportunity_applications (organization_id, opportunity_id, applicant_account_id, opportunity_slug_snapshot, opportunity_title_snapshot, opportunity_type_snapshot) SELECT organization_id, id, '55555555-5555-4555-8555-555555555555', slug, title, opportunity_type FROM opportunities WHERE slug = 'tenant-one-public';"

expect_failure "audit event update" \
  "SET app.tenant_id = '$TENANT_ONE'; UPDATE audit_events SET event_name = 'tampered' WHERE id = '77777777-7777-4777-8777-777777777777';"

expect_failure "audit event delete" \
  "SET app.tenant_id = '$TENANT_ONE'; DELETE FROM audit_events WHERE id = '77777777-7777-4777-8777-777777777777';"

expect_failure "audit event truncate" "TRUNCATE audit_events;"

assert_count audit_events "$TENANT_ONE" 1
assert_count audit_events "$TENANT_TWO" 1

# Two concurrent owner demotions must serialize on the same canonical tenant
# lock key. The first request leaves one active owner; the second must observe
# that committed state and refuse to remove the final owner.
THIRD_ACCOUNT="33333333-3333-4333-8333-333333333333"
THIRD_MEMBERSHIP="99999999-9999-4999-8999-999999999999"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 <<SQL
INSERT INTO accounts (id) VALUES ('$THIRD_ACCOUNT');
INSERT INTO organization_memberships (id, organization_id, account_id, role)
VALUES ('$THIRD_MEMBERSHIP', '$TENANT_ONE', '$THIRD_ACCOUNT', 'owner');
SQL

lock_test_dir="$(mktemp -d)"
trap 'rm -rf "$lock_test_dir"' EXIT

run_owner_demotion() {
  local actor_account_id="$1"
  local target_account_id="$2"
  local lock_tenant_id="$3"
  local output_file="$4"

  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 >"$output_file" <<SQL
BEGIN;
SELECT set_config('app.tenant_id', '$TENANT_ONE', true);
SELECT 'WAITING_FOR_LOCK';
SELECT pg_advisory_xact_lock(
  hashtextextended(
    'organization-memberships:' || lower('$lock_tenant_id'),
    0
  )
);
SELECT 'LOCK_ACQUIRED';
SELECT pg_sleep(2);
DO \$membership\$
DECLARE
  active_owner_count integer;
  updated_membership_id text;
BEGIN
  SELECT count(*) INTO active_owner_count
  FROM organization_memberships
  WHERE organization_id = '$TENANT_ONE'::uuid
    AND role = 'owner'
    AND status = 'active';

  IF active_owner_count > 1 THEN
    UPDATE organization_memberships
    SET role = 'member', updated_at = clock_timestamp()
    WHERE organization_id = '$TENANT_ONE'::uuid
      AND account_id = '$target_account_id'::uuid
      AND role = 'owner'
      AND status = 'active'
    RETURNING id::text INTO updated_membership_id;

    IF updated_membership_id IS NOT NULL THEN
      INSERT INTO audit_events
        (organization_id, actor_account_id, event_name, resource_type, resource_id, metadata)
      VALUES (
        '$TENANT_ONE'::uuid,
        '$actor_account_id'::uuid,
        'organization.membership.change-role',
        'organization_membership',
        updated_membership_id,
        jsonb_build_object('targetAccountId', '$target_account_id', 'role', 'member')
      );
    END IF;
  END IF;
END
\$membership\$;
COMMIT;
SQL
}

run_owner_demotion \
  "$ACCOUNT_ONE" \
  "$THIRD_ACCOUNT" \
  "${TENANT_ONE^^}" \
  "$lock_test_dir/first.log" &
first_demotion_pid=$!

for attempt in $(seq 1 100); do
  if grep -q '^LOCK_ACQUIRED$' "$lock_test_dir/first.log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$first_demotion_pid" 2>/dev/null; then
    wait "$first_demotion_pid"
    echo "First membership transaction exited before acquiring its lock." >&2
    exit 1
  fi
  sleep 0.05
done

if ! grep -q '^LOCK_ACQUIRED$' "$lock_test_dir/first.log"; then
  echo "First membership transaction did not acquire its advisory lock." >&2
  exit 1
fi

run_owner_demotion \
  "$THIRD_ACCOUNT" \
  "$ACCOUNT_ONE" \
  "$TENANT_ONE" \
  "$lock_test_dir/second.log" &
second_demotion_pid=$!

for attempt in $(seq 1 100); do
  if grep -q '^WAITING_FOR_LOCK$' "$lock_test_dir/second.log" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$second_demotion_pid" 2>/dev/null; then
    wait "$second_demotion_pid"
    echo "Second membership transaction exited before requesting its lock." >&2
    exit 1
  fi
  sleep 0.01
done

if ! grep -q '^WAITING_FOR_LOCK$' "$lock_test_dir/second.log"; then
  echo "Second membership transaction did not request its advisory lock." >&2
  exit 1
fi
if grep -q '^LOCK_ACQUIRED$' "$lock_test_dir/second.log"; then
  echo "Case-variant tenant UUIDs did not serialize on one advisory lock." >&2
  exit 1
fi
if ! kill -0 "$first_demotion_pid" 2>/dev/null; then
  echo "First membership transaction released its lock before the contention check." >&2
  exit 1
fi

wait "$first_demotion_pid"
wait "$second_demotion_pid"

active_owner_count="$(
  psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
    -c "SET app.tenant_id = '$TENANT_ONE'; SELECT count(*) FROM organization_memberships WHERE role = 'owner' AND status = 'active';"
)"
if [[ "$active_owner_count" != "1" ]]; then
  echo "Concurrent membership mutations left $active_owner_count active owners; expected exactly one." >&2
  exit 1
fi

assert_count organization_memberships "$TENANT_ONE" 2
assert_count audit_events "$TENANT_ONE" 2
assert_count audit_events "$TENANT_TWO" 1

bash "$ROOT_DIR/tests/integration/payments-journal.sh"

echo "PostgreSQL tenant RLS, project workspaces, private conversations, immutable journal, append-only audit and concurrent owner-continuity checks passed."
