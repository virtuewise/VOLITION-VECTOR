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
export { PostgresOpportunityRepository } from "./opportunity-repository.js";
export {
  OpportunityAuthorizationError,
  OpportunityInputError,
  OpportunityTransitionError,
} from "./opportunity-repository.js";
export type {
  CreateOpportunityInput,
  OpportunityAction,
  OpportunityAuthorizer,
  OpportunityAuthorizationInput,
  OpportunityRecord,
  OpportunityStatus,
  OpportunityType,
  OpportunityVisibility,
  PublicOpportunityRecord,
  PublicOpportunitySearchInput,
  PublishOpportunityInput,
  UpdateOpportunityDraftInput,
  OpportunityTransitionAction,
} from "./opportunity-repository.js";
export { PostgresServiceListingRepository } from "./service-listing-repository.js";
export {
  ServiceListingAuthorizationError,
  ServiceListingInputError,
  ServiceListingTransitionError,
} from "./service-listing-repository.js";
export type {
  CreateServiceListingInput,
  PublishServiceListingInput,
  PublicServiceListingRecord,
  PublicServiceListingSearchInput,
  ServiceDeliveryMode,
  ServiceListingAction,
  ServiceListingAuthorizationInput,
  ServiceListingAuthorizer,
  ServiceListingRecord,
  ServiceListingStatus,
  ServicePricingModel,
} from "./service-listing-repository.js";
