/** PostgreSQL is the authoritative transactional store; Redis is not. */
export type DatabaseHealth = "unknown" | "healthy" | "unhealthy";

export { normalizeTenantId } from "./tenant-context.js";
export { withTenantTransaction } from "./tenant-transaction.js";
export type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
  TenantTransactionClient,
} from "./tenant-transaction.js";
