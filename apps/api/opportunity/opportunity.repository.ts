import type {
  CreateOpportunityInput,
  OpportunityRecord,
  PublicOpportunityRecord,
  PublicOpportunitySearchInput,
  PublishOpportunityInput,
} from "@volition/database";

export const OPPORTUNITY_REPOSITORY = Symbol("OPPORTUNITY_REPOSITORY");

export interface OpportunityRepositoryPort {
  createDraft(input: CreateOpportunityInput): Promise<OpportunityRecord>;
  publish(input: PublishOpportunityInput): Promise<OpportunityRecord | null>;
  listPublic(
    input?: PublicOpportunitySearchInput,
  ): Promise<readonly PublicOpportunityRecord[]>;
}
