export type OpportunityApplicationId = string & {
  readonly __brand: "OpportunityApplicationId";
};

export type OpportunityApplicationStatus =
  | "submitted"
  | "withdrawn"
  | "shortlisted"
  | "rejected"
  | "accepted";

export type OpportunityApplicationReviewDecision =
  | "shortlisted"
  | "rejected"
  | "accepted";

export interface OpportunityApplication {
  readonly id: OpportunityApplicationId;
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly applicantAccountId: string;
  readonly opportunitySlug: string;
  readonly opportunityTitle: string;
  readonly opportunityType: string;
  readonly coverNote: string | null;
  readonly status: OpportunityApplicationStatus;
  readonly submittedAt: Date;
  readonly updatedAt: Date;
  readonly reviewedAt: Date | null;
  readonly reviewedByAccountId: string | null;
  readonly withdrawnAt: Date | null;
}

export interface SubmitOpportunityApplication {
  readonly organizationId: string;
  readonly opportunityId: string;
  readonly applicantAccountId: string;
  readonly coverNote?: string | null;
}

export interface WithdrawOpportunityApplication {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly applicantAccountId: string;
}

export interface ReviewOpportunityApplication {
  readonly organizationId: string;
  readonly applicationId: string;
  readonly reviewerAccountId: string;
  readonly decision: OpportunityApplicationReviewDecision;
}
