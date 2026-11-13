export interface AccountProfile {
  readonly displayName: string | null;
  readonly locale: string;
  readonly timeZone: string;
  readonly updatedAt: string | null;
}

export interface OpportunityApplication {
  readonly id: string;
  readonly opportunityTitle: string;
  readonly opportunityType: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly updatedAt: string;
}

const APPLICATION_STATUSES = new Set([
  "submitted",
  "withdrawn",
  "shortlisted",
  "rejected",
  "accepted",
]);

const UUID_V4_PATTERN = new RegExp(
  "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-" + "[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  "i",
);

function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_PATTERN.test(value);
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function isBoundedText(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

export function normalizeApiOrigin(
  configured: string | undefined,
): string | null {
  if (!configured || configured.trim() !== configured) return null;

  try {
    const url = new URL(configured);
    const secure = url.protocol === "https:";
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    const originOnly =
      url.pathname === "/" && url.search.length === 0 && url.hash.length === 0;

    if ((!secure && !local) || url.username || url.password || !originOnly) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isAccountProfile(value: unknown): value is AccountProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const profile = value as Record<string, unknown>;
  const displayName = profile["displayName"];
  return (
    (displayName === null || isBoundedText(displayName, 120)) &&
    isBoundedText(profile["locale"], 35) &&
    isBoundedText(profile["timeZone"], 64) &&
    (profile["updatedAt"] === null || isDateTime(profile["updatedAt"]))
  );
}

export function isApplicationList(
  value: unknown,
): value is readonly OpportunityApplication[] {
  return (
    Array.isArray(value) &&
    value.length <= 10 &&
    value.every((entry: unknown) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return false;
      }
      const application = entry as Record<string, unknown>;
      const status = application["status"];
      return (
        isUuidV4(application["id"]) &&
        isBoundedText(application["opportunityTitle"], 256) &&
        isBoundedText(application["opportunityType"], 80) &&
        typeof status === "string" &&
        APPLICATION_STATUSES.has(status) &&
        isDateTime(application["submittedAt"]) &&
        isDateTime(application["updatedAt"])
      );
    })
  );
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    date,
  );
}

export function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusClass(value: string): string {
  return "status status-" + value.replace(/[^a-z0-9-]/gi, "").toLowerCase();
}
