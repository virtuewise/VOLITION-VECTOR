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

export function normalizeApiOrigin(
  configured: string | undefined,
): string | null {
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const secure = url.protocol === "https:";
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if ((!secure && !local) || url.username || url.password) return null;
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
  return (
    (typeof profile["displayName"] === "string" ||
      profile["displayName"] === null) &&
    typeof profile["locale"] === "string" &&
    typeof profile["timeZone"] === "string" &&
    (typeof profile["updatedAt"] === "string" || profile["updatedAt"] === null)
  );
}

export function isApplicationList(
  value: unknown,
): value is readonly OpportunityApplication[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
        return false;
      }
      const application = entry as Record<string, unknown>;
      return (
        typeof application["id"] === "string" &&
        typeof application["opportunityTitle"] === "string" &&
        typeof application["opportunityType"] === "string" &&
        typeof application["status"] === "string" &&
        typeof application["submittedAt"] === "string" &&
        typeof application["updatedAt"] === "string"
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
