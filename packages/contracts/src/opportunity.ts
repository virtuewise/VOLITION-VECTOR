export type OpportunityId = string & {
  readonly __brand: "OpportunityId";
};

export type OpportunityType =
  | "employment"
  | "project"
  | "tender"
  | "partnership"
  | "volunteering";

export type OpportunityStatus =
  | "draft"
  | "published"
  | "paused"
  | "closed"
  | "archived";

export type OpportunityVisibility = "public" | "organization";

export interface PublicOpportunity {
  readonly id: OpportunityId;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly opportunityType: OpportunityType;
  readonly locationLabel: string | null;
  readonly isRemote: boolean;
  readonly compensationMin: string | null;
  readonly compensationMax: string | null;
  readonly compensationCurrency: string | null;
  readonly publishedAt: Date;
  readonly expiresAt: Date | null;
}

export interface PublicOpportunitySearch {
  readonly query?: string;
  readonly opportunityType?: OpportunityType;
  readonly limit?: number;
  readonly offset?: number;
}
