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
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
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
    value.every((entry) => {
      if (!isRecord(entry)) return false;
      const organizationId = entry["organizationId"];
      const name = entry["name"];
      const slug = entry["slug"];
      const role = entry["role"];
      return (
        typeof organizationId === "string" &&
        UUID_PATTERN.test(organizationId) &&
        typeof name === "string" &&
        name.length > 0 &&
        name.length <= 160 &&
        typeof slug === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
        isRole(role)
      );
    })
  );
}

export function isOrganizationProfile(
  value: unknown,
  expectedOrganizationId: string,
): value is BusinessOrganizationProfile {
  if (!isRecord(value)) return false;

  const organizationId = value["organizationId"];
  const description = value["description"];
  const websiteUrl = value["websiteUrl"];
  const countryCode = value["countryCode"];
  const locale = value["locale"];
  const timeZone = value["timeZone"];
  const updatedAt = value["updatedAt"];

  if (
    typeof organizationId !== "string" ||
    organizationId.toLowerCase() !== expectedOrganizationId.toLowerCase()
  ) {
    return false;
  }
  if (
    description !== null &&
    (typeof description !== "string" || description.length > 2000)
  ) {
    return false;
  }
  if (websiteUrl !== null) {
    if (typeof websiteUrl !== "string") return false;
    try {
      const website = new URL(websiteUrl);
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
    countryCode !== null &&
    (typeof countryCode !== "string" || !/^[A-Z]{2}$/.test(countryCode))
  ) {
    return false;
  }
  if (
    typeof locale !== "string" ||
    locale.length < 2 ||
    locale.length > 35 ||
    !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(locale)
  ) {
    return false;
  }
  if (
    typeof timeZone !== "string" ||
    timeZone.length < 1 ||
    timeZone.length > 64
  ) {
    return false;
  }
  if (
    updatedAt !== null &&
    (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt)))
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
