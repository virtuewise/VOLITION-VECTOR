import { describe, expect, it } from "vitest";
import {
  isOrganizationList,
  isOrganizationProfile,
  normalizeApiOrigin,
} from "./workspace-data";

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("business workspace API contracts", () => {
  it("accepts a list of internal organizations with supported membership roles", () => {
    expect(
      isOrganizationList([
        {
          organizationId: ORGANIZATION_ID,
          name: "Example Studio",
          slug: "example-studio",
          role: "owner",
        },
      ]),
    ).toBe(true);
  });

  it("rejects malformed organizations and unknown roles", () => {
    expect(
      isOrganizationList([
        {
          organizationId: ORGANIZATION_ID,
          name: "Example Studio",
          slug: "example-studio",
          role: "superuser",
        },
      ]),
    ).toBe(false);
    expect(isOrganizationList({ organizations: [] })).toBe(false);
  });

  it("accepts a private profile only for the selected organization", () => {
    expect(
      isOrganizationProfile(
        {
          organizationId: ORGANIZATION_ID,
          description: "A professional services studio.",
          websiteUrl: "https://example.com/",
          countryCode: "ZA",
          locale: "en-ZA",
          timeZone: "Africa/Johannesburg",
          updatedAt: "2026-11-13T12:00:00.000Z",
        },
        ORGANIZATION_ID,
      ),
    ).toBe(true);
  });

  it("rejects a mismatched organization, unsafe website and invalid timestamp", () => {
    const profile = {
      organizationId: ORGANIZATION_ID,
      description: null,
      websiteUrl: "javascript:alert(1)",
      countryCode: null,
      locale: "en",
      timeZone: "UTC",
      updatedAt: "not-a-date",
    };
    expect(isOrganizationProfile(profile, ORGANIZATION_ID)).toBe(false);
    expect(
      isOrganizationProfile(
        { ...profile, websiteUrl: null, updatedAt: null },
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
    ).toBe(false);
  });

  it("allows HTTPS API origins and local HTTP only", () => {
    expect(normalizeApiOrigin("https://api.example.com")).toBe(
      "https://api.example.com",
    );
    expect(normalizeApiOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
    expect(normalizeApiOrigin("http://api.example.com")).toBeNull();
    expect(normalizeApiOrigin("https://api.example.com/path")).toBeNull();
  });
});
