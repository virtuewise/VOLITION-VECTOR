import { describe, expect, it } from "vitest";
import {
  formatDate,
  humanize,
  isAccountProfile,
  isApplicationList,
  normalizeApiOrigin,
  statusClass,
} from "./dashboard-data.js";

const application = {
  id: "11111111-1111-4111-8111-111111111111",
  opportunityTitle: "Research partnership",
  opportunityType: "project",
  status: "submitted",
  submittedAt: "2026-11-13T08:00:00.000Z",
  updatedAt: "2026-11-13T08:00:00.000Z",
};

describe("individual workspace API response contracts", () => {
  it("allows HTTPS and local-only HTTP API origins", () => {
    expect(normalizeApiOrigin("https://api.example.test")).toBe(
      "https://api.example.test",
    );
    expect(normalizeApiOrigin("http://localhost:4000")).toBe(
      "http://localhost:4000",
    );
    expect(normalizeApiOrigin("http://127.0.0.1:4000")).toBe(
      "http://127.0.0.1:4000",
    );
  });

  it("rejects remote HTTP, invalid protocols, credentials and non-origin URLs", () => {
    expect(normalizeApiOrigin("http://api.example.test")).toBeNull();
    expect(normalizeApiOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeApiOrigin("https://user:pass@api.example.test")).toBeNull();
    expect(normalizeApiOrigin("https://api.example.test/v1")).toBeNull();
    expect(normalizeApiOrigin("https://api.example.test?token=x")).toBeNull();
    expect(normalizeApiOrigin("https://api.example.test#fragment")).toBeNull();
    expect(normalizeApiOrigin(" https://api.example.test")).toBeNull();
    expect(normalizeApiOrigin(undefined)).toBeNull();
  });

  it("accepts the private account profile view", () => {
    expect(
      isAccountProfile({
        displayName: "Avery",
        locale: "en-ZA",
        timeZone: "Africa/Johannesburg",
        updatedAt: "2026-11-13T08:00:00.000Z",
      }),
    ).toBe(true);
    expect(
      isAccountProfile({
        displayName: null,
        locale: "en",
        timeZone: "UTC",
        updatedAt: null,
      }),
    ).toBe(true);
  });

  it("rejects malformed or unbounded profile payloads", () => {
    expect(isAccountProfile(null)).toBe(false);
    expect(
      isAccountProfile({
        displayName: "Avery",
        locale: 42,
        timeZone: "Africa/Johannesburg",
        updatedAt: null,
      }),
    ).toBe(false);
    expect(
      isAccountProfile({
        displayName: "Avery",
        locale: "en-ZA",
        timeZone: "Africa/Johannesburg",
        updatedAt: "not-a-date",
      }),
    ).toBe(false);
    expect(
      isAccountProfile({
        displayName: "x".repeat(121),
        locale: "en",
        timeZone: "UTC",
        updatedAt: null,
      }),
    ).toBe(false);
  });

  it("accepts the applicant's own bounded application list", () => {
    expect(isApplicationList([application])).toBe(true);
    expect(isApplicationList([])).toBe(true);
  });

  it("rejects malformed, unknown-status and oversized application lists", () => {
    expect(isApplicationList({})).toBe(false);
    expect(
      isApplicationList([
        {
          ...application,
          status: "administrator",
        },
      ]),
    ).toBe(false);
    expect(
      isApplicationList([
        {
          ...application,
          id: "application-1",
        },
      ]),
    ).toBe(false);
    expect(
      isApplicationList([
        {
          ...application,
          submittedAt: "not-a-date",
        },
      ]),
    ).toBe(false);
    expect(isApplicationList(Array.from({ length: 11 }, () => application))).toBe(
      false,
    );
  });
});

describe("individual workspace display helpers", () => {
  it("renders a safe fallback for invalid dates", () => {
    expect(formatDate("not-a-date")).toBe("Date unavailable");
  });

  it("humanizes underscore-delimited values", () => {
    expect(humanize("shortlisted_for_review")).toBe("Shortlisted For Review");
  });

  it("sanitizes status-derived CSS class names", () => {
    expect(statusClass("accepted<script>")).toBe(
      "status status-acceptedscript",
    );
  });
});
