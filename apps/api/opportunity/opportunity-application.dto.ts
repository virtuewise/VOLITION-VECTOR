import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { OpportunityApplicationReviewDecision } from "@volition/database";

export class SubmitOpportunityApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5_000)
  coverNote?: string | null;
}

export class ReviewOpportunityApplicationDto {
  @IsIn(["shortlisted", "rejected", "accepted"])
  decision!: OpportunityApplicationReviewDecision;
}
