#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${RUNTIME_DATABASE_URL:?RUNTIME_DATABASE_URL is required}"

TENANT_ONE="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
TENANT_TWO="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
ACCOUNT_ONE="11111111-1111-4111-8111-111111111111"

# Valid balanced entry is committed atomically with its lines.
psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
SET LOCAL app.tenant_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
INSERT INTO journal_entries
  (id, organization_id, idempotency_key, reference_type, reference_id, currency, created_by_account_id)
VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'payment-capture-001', 'payment_capture', 'capture-001', 'EUR',
   '11111111-1111-4111-8111-111111111111');
INSERT INTO journal_entry_lines
  (organization_id, journal_entry_id, account_code, side, amount_minor)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'provider_clearing', 'debit', 12500),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'customer_payable', 'credit', 12500);
COMMIT;
SQL

one_count="$(psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
  -c "SET app.tenant_id = '$TENANT_ONE'; SELECT count(*) FROM journal_entries;")"
two_count="$(psql "$RUNTIME_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 \
  -c "SET app.tenant_id = '$TENANT_TWO'; SELECT count(*) FROM journal_entries;")"
if [[ "$one_count" != "1" || "$two_count" != "0" ]]; then
  echo "Journal tenant isolation failed: tenant one=$one_count tenant two=$two_count" >&2
  exit 1
fi

expect_failure() {
  local description="$1"
  local sql="$2"
  if psql "$RUNTIME_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    echo "Expected journal operation to fail: $description" >&2
    exit 1
  fi
  echo "Verified journal rejection: $description"
}

expect_failure "duplicate tenant idempotency key" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO journal_entries (organization_id, idempotency_key, reference_type, reference_id, currency, created_by_account_id) VALUES ('$TENANT_ONE', 'payment-capture-001', 'payment_capture', 'capture-duplicate', 'EUR', '$ACCOUNT_ONE');"

expect_failure "cross-tenant journal header insert" \
  "SET app.tenant_id = '$TENANT_ONE'; INSERT INTO journal_entries (organization_id, idempotency_key, reference_type, reference_id, currency, created_by_account_id) VALUES ('$TENANT_TWO', 'cross-tenant-001', 'payment_capture', 'capture-cross', 'EUR', '$ACCOUNT_ONE');"

expect_failure "unbalanced journal commit" \
  "BEGIN; SET LOCAL app.tenant_id = '$TENANT_ONE'; INSERT INTO journal_entries (organization_id, idempotency_key, reference_type, reference_id, currency, created_by_account_id) VALUES ('$TENANT_ONE', 'unbalanced-001', 'payment_capture', 'capture-unbalanced', 'EUR', '$ACCOUNT_ONE'); INSERT INTO journal_entry_lines (organization_id, journal_entry_id, account_code, side, amount_minor) SELECT '$TENANT_ONE', id, 'cash', 'debit', 100 FROM journal_entries WHERE idempotency_key = 'unbalanced-001'; INSERT INTO journal_entry_lines (organization_id, journal_entry_id, account_code, side, amount_minor) SELECT '$TENANT_ONE', id, 'payable', 'credit', 99 FROM journal_entries WHERE idempotency_key = 'unbalanced-001'; COMMIT;"

# Exercise immutable triggers with the migration owner, independently of the
# runtime role's intentionally narrow SQL grants. FORCE RLS still applies to
# the owner, so set tenant context to ensure each row-level trigger sees a row
# rather than allowing an empty UPDATE/DELETE to pass unnoticed.
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SET app.tenant_id = '$TENANT_ONE'; UPDATE journal_entries SET reference_id = 'tampered' WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';" >/dev/null 2>&1; then
  echo "Journal header update unexpectedly succeeded." >&2
  exit 1
fi
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SET app.tenant_id = '$TENANT_ONE'; DELETE FROM journal_entries WHERE id = 'aaaaaaaa-0000-4000-8000-000000000001';" >/dev/null 2>&1; then
  echo "Journal header delete unexpectedly succeeded." >&2
  exit 1
fi
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SET app.tenant_id = '$TENANT_ONE'; UPDATE journal_entry_lines SET amount_minor = 1 WHERE journal_entry_id = 'aaaaaaaa-0000-4000-8000-000000000001';" >/dev/null 2>&1; then
  echo "Journal line update unexpectedly succeeded." >&2
  exit 1
fi
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "SET app.tenant_id = '$TENANT_ONE'; DELETE FROM journal_entry_lines WHERE journal_entry_id = 'aaaaaaaa-0000-4000-8000-000000000001';" >/dev/null 2>&1; then
  echo "Journal line delete unexpectedly succeeded." >&2
  exit 1
fi
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "TRUNCATE journal_entries;" >/dev/null 2>&1; then
  echo "Journal header truncate unexpectedly succeeded." >&2
  exit 1
fi
if psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "TRUNCATE journal_entry_lines;" >/dev/null 2>&1; then
  echo "Journal line truncate unexpectedly succeeded." >&2
  exit 1
fi

echo "PostgreSQL immutable journal, tenant isolation, idempotency and balance checks passed."
