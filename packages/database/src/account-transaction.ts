import { normalizeAccountId } from "./account-context.js";
import type {
  TenantConnectionPool,
  TenantTransactionClient,
} from "./tenant-transaction.js";

/**
 * Run account-owned database work with a transaction-local account RLS
 * context. The account ID must come from a verified server-side principal;
 * never pass a client-supplied account ID to this helper.
 */
export async function withAccountTransaction<T>(
  pool: TenantConnectionPool,
  accountId: string,
  work: (client: TenantTransactionClient) => Promise<T>,
): Promise<T> {
  const normalizedAccountId = normalizeAccountId(accountId);
  const client = await pool.connect();
  let transactionStarted = false;
  let releaseError: Error | undefined;

  try {
    try {
      await client.query("BEGIN");
      transactionStarted = true;
    } catch (error) {
      releaseError =
        error instanceof Error
          ? error
          : new Error("Failed to establish account database transaction.");
      throw error;
    }

    await client.query("SELECT set_config('app.account_id', $1, true)", [
      normalizedAccountId,
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
        releaseError =
          rollbackError instanceof Error
            ? rollbackError
            : new Error("Failed to roll back account database transaction.");
      }
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}
