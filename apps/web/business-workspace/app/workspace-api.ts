import {
  isOrganizationList,
  isOrganizationProfile,
  normalizeApiOrigin,
  type BusinessOrganizationProfile,
  type BusinessOrganizationSummary,
} from "./workspace-data";

export type LoadResult<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "unavailable" };

export function getApiOrigin(): string | null {
  return normalizeApiOrigin(
    process.env["VOLITION_API_URL"] ?? process.env["WEB_ORIGIN"],
  );
}

async function getPrivateResource<T>(
  origin: string | null,
  path: string,
  accessToken: string,
  isValid: (value: unknown) => value is T,
): Promise<LoadResult<T>> {
  if (!origin) return { status: "unavailable" };
  try {
    const response = await fetch(origin + path, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      headers: {
        accept: "application/json",
        authorization: "Bearer " + accessToken,
      },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { status: "unavailable" };
    const value: unknown = await response.json();
    return isValid(value)
      ? { status: "ready", value }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export function loadOrganizations(
  origin: string | null,
  accessToken: string,
): Promise<LoadResult<readonly BusinessOrganizationSummary[]>> {
  return getPrivateResource(
    origin,
    "/v1/me/organizations",
    accessToken,
    isOrganizationList,
  );
}

export function loadOrganizationProfile(
  origin: string | null,
  accessToken: string,
  organizationId: string,
): Promise<LoadResult<BusinessOrganizationProfile>> {
  return getPrivateResource(
    origin,
    "/v1/organizations/" + encodeURIComponent(organizationId) + "/profile",
    accessToken,
    (value): value is BusinessOrganizationProfile =>
      isOrganizationProfile(value, organizationId),
  );
}
