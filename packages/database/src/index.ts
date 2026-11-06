/** PostgreSQL is the authoritative transactional store; Redis is not. */
export type DatabaseHealth = "unknown" | "healthy" | "unhealthy";

export { normalizeTenantId } from "./tenant-context.js";
export { withTenantTransaction } from "./tenant-transaction.js";
export { PostgresMembershipRepository } from "./membership-repository.js";
export { PostgresInvitationRepository } from "./invitation-repository.js";
export type {
  AcceptInvitationRecord,
  CreatedInvitationRecord,
  CreatePendingInvitationRecord,
  InvitationAuthorizationInput,
  InvitationAuthorizer,
} from "./invitation-repository.js";
export { InvitationAuthorizationError } from "./invitation-repository.js";
export type {
  MembershipMutationAction,
  MembershipMutationAuthorizer,
  MembershipMutationPolicyInput,
  MembershipMutationResult,
  MembershipRole,
  MembershipStatus,
  MutateMembershipInput,
} from "./membership-repository.js";
export type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
  TenantTransactionClient,
} from "./tenant-transaction.js";
