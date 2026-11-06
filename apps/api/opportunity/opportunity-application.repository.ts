import type {
  OpportunityApplicationRecord,
  ReviewOpportunityApplicationInput,
  SubmitOpportunityApplicationInput,
  WithdrawOpportunityApplicationInput,
} from "@volition/database";

export const OPPORTUNITY_APPLICATION_REPOSITORY = Symbol(
  "OPPORTUNITY_APPLICATION_REPOSITORY",
);

export interface OpportunityApplicationRepositoryPort {
  submit(
    input: SubmitOpportunityApplicationInput,
  ): Promise<OpportunityApplicationRecord>;
  withdraw(
    input: WithdrawOpportunityApplicationInput,
  ): Promise<OpportunityApplicationRecord | null>;
  review(
    input: ReviewOpportunityApplicationInput,
  ): Promise<OpportunityApplicationRecord | null>;
  listMine(
    applicantAccountId: string,
    limit?: number,
    offset?: number,
  ): Promise<readonly OpportunityApplicationRecord[]>;
}
