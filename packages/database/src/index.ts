/** PostgreSQL is the authoritative transactional store; Redis is not. */
export type DatabaseHealth = "unknown" | "healthy" | "unhealthy";

export { normalizeTenantId } from "./tenant-context.js";
export { withTenantTransaction } from "./tenant-transaction.js";
export { PostgresInvitationRepository } from "./invitation-repository.js";
export type {
  AcceptInvitationRecord,
  CreatedInvitationRecord,
  CreatePendingInvitationRecord,
} from "./invitation-repository.js";
export type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
  TenantTransactionClient,
} from "./tenant-transaction.js";
