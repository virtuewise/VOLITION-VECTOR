import type {
  CreateOpportunityInput,
  OpportunityRecord,
  UpdateOpportunityDraftInput,
  PublicOpportunityRecord,
  PublicOpportunitySearchInput,
  PublishOpportunityInput,
} from "@volition/database";

export const OPPORTUNITY_REPOSITORY = Symbol("OPPORTUNITY_REPOSITORY");

export interface OpportunityRepositoryPort {
  createDraft(input: CreateOpportunityInput): Promise<OpportunityRecord>;
  updateDraft(
    input: UpdateOpportunityDraftInput,
  ): Promise<OpportunityRecord | null>;
  publish(input: PublishOpportunityInput): Promise<OpportunityRecord | null>;
  pause(input: PublishOpportunityInput): Promise<OpportunityRecord | null>;
  close(input: PublishOpportunityInput): Promise<OpportunityRecord | null>;
  archive(input: PublishOpportunityInput): Promise<OpportunityRecord | null>;
  listPublic(
    input?: PublicOpportunitySearchInput,
  ): Promise<readonly PublicOpportunityRecord[]>;
}
