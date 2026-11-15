const MAX_PUBLIC_PAGE_SIZE = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const CATEGORY_PATTERN = /^[a-z][a-z0-9-]{1,62}$/;
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export interface PublicOpportunity {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly opportunityType:
    "employment" | "project" | "tender" | "partnership" | "volunteering";
  readonly locationLabel: string | null;
  readonly isRemote: boolean;
  readonly compensationMin: string | null;
  readonly compensationMax: string | null;
  readonly compensationCurrency: string | null;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
}

export interface PublicService {
  readonly id: string;
  readonly organizationId: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly deliveryMode: "remote" | "onsite" | "hybrid";
  readonly pricingModel: "fixed" | "hourly" | "starting_at" | "quote";
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly locationLabel: string | null;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyText(
  value: unknown,
  maximumLength: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function isNullableText(
  value: unknown,
  maximumLength: number,
): value is string | null {
  return value === null || isNonEmptyText(value, maximumLength);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 3 &&
    value.length <= 64 &&
    SLUG_PATTERN.test(value)
  );
}

function isUtcDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UTC_DATE_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isNullableUtcDate(value: unknown): value is string | null {
  return value === null || isUtcDate(value);
}

function isAmount(value: unknown): value is string | null {
  if (value === null) return true;
  return (
    typeof value === "string" &&
    /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) &&
    Number.isFinite(Number(value))
  );
}

function isCurrency(value: unknown): value is string | null {
  return (
    value === null || (typeof value === "string" && /^[A-Z]{3}$/.test(value))
  );
}

function isOpportunityType(
  value: unknown,
): value is PublicOpportunity["opportunityType"] {
  return (
    value === "employment" ||
    value === "project" ||
    value === "tender" ||
    value === "partnership" ||
    value === "volunteering"
  );
}

function isPublicOpportunity(value: unknown): value is PublicOpportunity {
  if (!isRecord(value)) return false;

  const minimum = value["compensationMin"];
  const maximum = value["compensationMax"];
  const currency = value["compensationCurrency"];

  if (
    !isUuid(value["id"]) ||
    !isUuid(value["organizationId"]) ||
    !isSlug(value["slug"]) ||
    !isNonEmptyText(value["title"], 160) ||
    !isNonEmptyText(value["summary"], 320) ||
    !isOpportunityType(value["opportunityType"]) ||
    !isNullableText(value["locationLabel"], 200) ||
    typeof value["isRemote"] !== "boolean" ||
    !isAmount(minimum) ||
    !isAmount(maximum) ||
    !isCurrency(currency) ||
    !isUtcDate(value["publishedAt"]) ||
    !isNullableUtcDate(value["expiresAt"])
  ) {
    return false;
  }

  if ((minimum !== null || maximum !== null) !== (currency !== null)) {
    return false;
  }

  return !(
    minimum !== null &&
    maximum !== null &&
    Number(maximum) < Number(minimum)
  );
}

function isPublicService(value: unknown): value is PublicService {
  if (!isRecord(value)) return false;

  const amount = value["priceAmount"];
  const currency = value["priceCurrency"];
  const pricingModel = value["pricingModel"];

  if (
    !isUuid(value["id"]) ||
    !isUuid(value["organizationId"]) ||
    !isSlug(value["slug"]) ||
    !isNonEmptyText(value["title"], 160) ||
    !isNonEmptyText(value["summary"], 320) ||
    typeof value["category"] !== "string" ||
    !CATEGORY_PATTERN.test(value["category"]) ||
    (value["deliveryMode"] !== "remote" &&
      value["deliveryMode"] !== "onsite" &&
      value["deliveryMode"] !== "hybrid") ||
    (pricingModel !== "fixed" &&
      pricingModel !== "hourly" &&
      pricingModel !== "starting_at" &&
      pricingModel !== "quote") ||
    !isAmount(amount) ||
    !isCurrency(currency) ||
    !isNullableText(value["locationLabel"], 200) ||
    !isUtcDate(value["publishedAt"]) ||
    !isNullableUtcDate(value["expiresAt"])
  ) {
    return false;
  }

  if (pricingModel === "quote") {
    return amount === null && currency === null;
  }

  return amount !== null && currency !== null;
}

function parseCollection<T>(
  payload: unknown,
  isItem: (value: unknown) => value is T,
): readonly T[] | null {
  if (!Array.isArray(payload) || payload.length > MAX_PUBLIC_PAGE_SIZE) {
    return null;
  }

  const items: T[] = [];
  for (const item of payload as unknown[]) {
    if (!isItem(item)) return null;
    items.push(item);
  }
  return items;
}

export function parsePublicOpportunityCollection(
  payload: unknown,
): readonly PublicOpportunity[] | null {
  return parseCollection(payload, isPublicOpportunity);
}

export function parsePublicServiceCollection(
  payload: unknown,
): readonly PublicService[] | null {
  return parseCollection(payload, isPublicService);
}
