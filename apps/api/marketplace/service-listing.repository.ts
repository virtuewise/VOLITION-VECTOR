import type {
  CreateServiceListingInput,
  PublicServiceListingRecord,
  PublicServiceListingSearchInput,
  PublishServiceListingInput,
  ServiceListingRecord,
} from "@volition/database";

export const SERVICE_LISTING_REPOSITORY = Symbol("SERVICE_LISTING_REPOSITORY");

export interface ServiceListingRepositoryPort {
  createDraft(input: CreateServiceListingInput): Promise<ServiceListingRecord>;
  publish(
    input: PublishServiceListingInput,
  ): Promise<ServiceListingRecord | null>;
  listPublic(
    input?: PublicServiceListingSearchInput,
  ): Promise<readonly PublicServiceListingRecord[]>;
}
