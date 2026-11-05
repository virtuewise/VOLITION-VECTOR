import { normalizeTenantId } from "./tenant-context.js";

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
  const normalizedTenantId = normalizeTenantId(tenantId);
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

    await client.query("SELECT set_config('app.tenant_id', $1, true)", [
      normalizedTenantId,
    ]);

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
