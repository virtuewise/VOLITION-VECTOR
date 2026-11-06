export type ServiceListingId = string & {
  readonly __brand: "ServiceListingId";
};

export type ServiceListingStatus =
  | "draft"
  | "published"
  | "paused"
  | "closed"
  | "archived";

export type ServiceDeliveryMode = "remote" | "onsite" | "hybrid";

export type ServicePricingModel = "fixed" | "hourly" | "starting_at" | "quote";

export interface PublicServiceListing {
  readonly id: ServiceListingId;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly deliveryMode: ServiceDeliveryMode;
  readonly pricingModel: ServicePricingModel;
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly locationLabel: string | null;
  readonly publishedAt: Date;
  readonly expiresAt: Date | null;
}

export interface PublicServiceListingSearch {
  readonly query?: string;
  readonly category?: string;
  readonly deliveryMode?: ServiceDeliveryMode;
  readonly limit?: number;
  readonly offset?: number;
}
