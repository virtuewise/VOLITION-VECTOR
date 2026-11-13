export type BusinessOrganizationRole = "owner" | "admin" | "member" | "viewer";

export interface BusinessOrganizationSummary {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly role: BusinessOrganizationRole;
}

export interface BusinessOrganizationProfile {
  readonly organizationId: string;
  readonly description: string | null;
  readonly websiteUrl: string | null;
  readonly countryCode: string | null;
  readonly locale: string;
  readonly timeZone: string;
  readonly updatedAt: string | null;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is BusinessOrganizationRole {
  return (
    value === "owner" ||
    value === "admin" ||
    value === "member" ||
    value === "viewer"
  );
}

export function isOrganizationList(
  value: unknown,
): value is readonly BusinessOrganizationSummary[] {
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.organizationId === "string" &&
        UUID_PATTERN.test(entry.organizationId) &&
        typeof entry.name === "string" &&
        entry.name.length > 0 &&
        entry.name.length <= 160 &&
        typeof entry.slug === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug) &&
        isRole(entry.role),
    )
  );
}

export function isOrganizationProfile(
  value: unknown,
  expectedOrganizationId: string,
): value is BusinessOrganizationProfile {
  if (!isRecord(value)) return false;
  if (
    typeof value.organizationId !== "string" ||
    value.organizationId.toLowerCase() !== expectedOrganizationId.toLowerCase()
  ) {
    return false;
  }
  if (
    value.description !== null &&
    (typeof value.description !== "string" || value.description.length > 2000)
  ) {
    return false;
  }
  if (value.websiteUrl !== null) {
    if (typeof value.websiteUrl !== "string") return false;
    try {
      const website = new URL(value.websiteUrl);
      if (
        website.protocol !== "https:" ||
        !website.hostname ||
        website.username ||
        website.password
      ) {
        return false;
      }
    } catch {
      return false;
    }
  }
  if (
    value.countryCode !== null &&
    (typeof value.countryCode !== "string" ||
      !/^[A-Z]{2}$/.test(value.countryCode))
  ) {
    return false;
  }
  if (
    typeof value.locale !== "string" ||
    value.locale.length < 2 ||
    value.locale.length > 35 ||
    !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(value.locale)
  ) {
    return false;
  }
  if (
    typeof value.timeZone !== "string" ||
    value.timeZone.length < 1 ||
    value.timeZone.length > 64
  ) {
    return false;
  }
  if (
    value.updatedAt !== null &&
    (typeof value.updatedAt !== "string" ||
      Number.isNaN(Date.parse(value.updatedAt)))
  ) {
    return false;
  }
  return true;
}

export function normalizeApiOrigin(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    const isLocalhost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (
      (url.protocol !== "https:" &&
        !(isLocalhost && url.protocol === "http:")) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
