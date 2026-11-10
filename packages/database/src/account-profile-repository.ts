import { normalizeAccountId } from "./account-context.js";
import { withAccountTransaction } from "./account-transaction.js";
import type {
  TenantConnectionPool,
  TenantQueryResult,
} from "./tenant-transaction.js";

export interface AccountProfileRecord {
  readonly accountId: string;
  readonly displayName: string | null;
  readonly locale: string;
  readonly timeZone: string;
  readonly updatedAt: Date;
}

export interface UpdateAccountProfileInput {
  readonly accountId: string;
  readonly displayName?: string | null;
  readonly locale?: string;
  readonly timeZone?: string;
}

interface AccountProfileRow {
  readonly account_id: string;
  readonly display_name: string | null;
  readonly locale: string;
  readonly time_zone: string;
  readonly updated_at: Date | string;
}

function firstRow<T>(result: TenantQueryResult): T | undefined {
  return result.rows[0] as T | undefined;
}

function toRecord(row: AccountProfileRow): AccountProfileRecord {
  const updatedAt =
    row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new Error("Account profile returned an invalid update timestamp.");
  }
  return {
    accountId: row.account_id,
    displayName: row.display_name,
    locale: row.locale,
    timeZone: row.time_zone,
    updatedAt,
  };
}

function normalizeDisplayName(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(normalized)
  ) {
    throw new TypeError(
      "Display name must contain 1 to 120 printable characters.",
    );
  }
  return normalized;
}

function normalizeLocale(value: string): string {
  if (
    value.trim() !== value ||
    value.length > 35 ||
    !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(value)
  ) {
    throw new TypeError("A valid BCP 47 locale is required.");
  }
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    if (!canonical) throw new Error("Locale is empty.");
    return canonical;
  } catch {
    throw new TypeError("A valid BCP 47 locale is required.");
  }
}

function normalizeTimeZone(value: string): string {
  if (value.trim() !== value || value.length < 1 || value.length > 64) {
    throw new TypeError("A valid IANA time zone is required.");
  }
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    throw new TypeError("A valid IANA time zone is required.");
  }
}

/**
 * Private self-service profile persistence. Account RLS context is derived
 * from the verified principal by the API and bound transaction-locally.
 */
export class PostgresAccountProfileRepository {
  constructor(private readonly pool: TenantConnectionPool) {}

  async getForAccount(accountId: string): Promise<AccountProfileRecord | null> {
    const normalizedAccountId = normalizeAccountId(accountId);
    return withAccountTransaction(
      this.pool,
      normalizedAccountId,
      async (client) => {
        const row = firstRow<AccountProfileRow>(
          await client.query(
            "SELECT account_id::text AS account_id, display_name, locale, " +
              "time_zone, updated_at FROM account_profiles " +
              "WHERE account_id = $1",
            [normalizedAccountId],
          ),
        );
        return row ? toRecord(row) : null;
      },
    );
  }

  async updateForAccount(
    input: UpdateAccountProfileInput,
  ): Promise<AccountProfileRecord> {
    const accountId = normalizeAccountId(input.accountId);
    if (
      input.displayName === undefined &&
      input.locale === undefined &&
      input.timeZone === undefined
    ) {
      throw new TypeError("At least one profile field must be provided.");
    }

    const displayName =
      input.displayName === undefined
        ? undefined
        : normalizeDisplayName(input.displayName);
    const locale =
      input.locale === undefined ? undefined : normalizeLocale(input.locale);
    const timeZone =
      input.timeZone === undefined
        ? undefined
        : normalizeTimeZone(input.timeZone);

    return withAccountTransaction(this.pool, accountId, async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        ["account-profile:" + accountId],
      );

      const currentRow = firstRow<AccountProfileRow>(
        await client.query(
          "SELECT account_id::text AS account_id, display_name, locale, " +
            "time_zone, updated_at FROM account_profiles " +
            "WHERE account_id = $1 FOR UPDATE",
          [accountId],
        ),
      );
      const current = currentRow ? toRecord(currentRow) : null;
      const nextDisplayName =
        displayName === undefined
          ? (current?.displayName ?? null)
          : displayName;
      const nextLocale = locale ?? current?.locale ?? "en";
      const nextTimeZone = timeZone ?? current?.timeZone ?? "UTC";

      const changedFields = current
        ? [
            ...(current.displayName === nextDisplayName ? [] : ["displayName"]),
            ...(current.locale === nextLocale ? [] : ["locale"]),
            ...(current.timeZone === nextTimeZone ? [] : ["timeZone"]),
          ]
        : [
            ...(displayName === undefined ? [] : ["displayName"]),
            ...(locale === undefined ? [] : ["locale"]),
            ...(timeZone === undefined ? [] : ["timeZone"]),
          ];

      if (current && changedFields.length === 0) return current;

      const savedRow = firstRow<AccountProfileRow>(
        await client.query(
          "INSERT INTO account_profiles " +
            "(account_id, display_name, locale, time_zone) " +
            "VALUES ($1, $2, $3, $4) " +
            "ON CONFLICT (account_id) DO UPDATE SET " +
            "display_name = EXCLUDED.display_name, " +
            "locale = EXCLUDED.locale, " +
            "time_zone = EXCLUDED.time_zone, " +
            "updated_at = clock_timestamp() " +
            "RETURNING account_id::text AS account_id, display_name, locale, " +
            "time_zone, updated_at",
          [accountId, nextDisplayName, nextLocale, nextTimeZone],
        ),
      );
      if (!savedRow) {
        throw new Error("Account profile write did not return a record.");
      }

      await client.query(
        "INSERT INTO account_audit_events " +
          "(account_id, actor_account_id, event_name, " +
          "resource_type, resource_id, metadata) " +
          "VALUES ($1, $1, $2, 'account_profile', $1::text, $3::jsonb)",
        [
          accountId,
          current ? "account.profile.updated" : "account.profile.created",
          JSON.stringify({ changedFields }),
        ],
      );

      return toRecord(savedRow);
    });
  }
}
