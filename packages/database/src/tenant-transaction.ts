import {
  normalizeAccountId,
  normalizeTenantId,
} from "./tenant-context.js";

export interface TenantQueryResult {
  readonly rows: readonly unknown[];
}

export interface TenantTransactionClient {
  query(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<TenantQueryResult>;
}

export interface TenantConnection extends TenantTransactionClient {
  /**
   * Release the connection. Pass an error when its transaction/protocol state
   * is uncertain so pool adapters can discard it instead of reusing it.
   */
  release(error?: Error): void;
}

export interface TenantConnectionPool {
  connect(): Promise<TenantConnection>;
}

type TransactionContextSetting = "tenant_id" | "account_id";

/**
 * Run work in a transaction with one transaction-local PostgreSQL RLS context.
 * The setting name is an internal literal union, never caller-controlled SQL.
 */
async function withTransactionContext<T>(
  pool: TenantConnectionPool,
  setting: TransactionContextSetting,
  normalizedId: string,
  work: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let transactionStarted = false;
  let releaseError: Error | undefined;

  try {
    try {
      await client.query("BEGIN");
      transactionStarted = true;
    } catch (error) {
      // BEGIN may have reached PostgreSQL even if its response was lost.
      // Never return a connection with uncertain transaction state to the pool.
      releaseError =
        error instanceof Error
          ? error
          : new Error("Failed to establish database transaction.");
      throw error;
    }

    await client.query(
      "SELECT set_config('app." + setting + "', $1, true)",
      [normalizedId],
    );

    const result = await work(client);
    await client.query("COMMIT");
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        // Preserve the operation error and ensure the pool discards this
        // connection rather than reusing one with an open/unknown transaction.
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Failed to roll back database transaction.");
      }
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

/**
 * Run tenant-owned database work in a transaction with PostgreSQL RLS context.
 *
 * The tenant identifier is validated and bound as a parameter. set_config's
 * third argument makes the setting transaction-local (equivalent to SET LOCAL).
 * The caller must authorize the principal's membership before invoking this
 * function. The pool must use a non-owner role without BYPASSRLS.
 */
export async function withTenantTransaction<T>(
  pool: TenantConnectionPool,
  tenantId: string,
  work: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  return withTransactionContext(
    pool,
    "tenant_id",
    normalizeTenantId(tenantId),
    work,
  );
}

/**
 * Run account-owned database work with transaction-local app.account_id.
 *
 * This helper is for self-scoped account reads and writes whose RLS policy
 * explicitly uses app.account_id. It does not establish organization membership
 * or tenant authority; callers must not use it for organization-scoped actions.
 */
export async function withAccountTransaction<T>(
  pool: TenantConnectionPool,
  accountId: string,
  work: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  return withTransactionContext(
    pool,
    "account_id",
    normalizeAccountId(accountId),
    work,
  );
}
