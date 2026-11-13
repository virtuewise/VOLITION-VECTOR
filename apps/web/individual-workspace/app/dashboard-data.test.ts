import { describe, expect, it } from "vitest";
import {
  formatDate,
  humanize,
  isAccountProfile,
  isApplicationList,
  statusClass,
} from "./dashboard-data.js";

describe("individual workspace API response contracts", () => {
  it("accepts the private account profile view", () => {
    expect(
      isAccountProfile({
        displayName: "Avery",
        locale: "en-ZA",
        timeZone: "Africa/Johannesburg",
        updatedAt: "2026-11-13T08:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("rejects malformed profile payloads", () => {
    expect(isAccountProfile(null)).toBe(false);
    expect(
      isAccountProfile({
        displayName: "Avery",
        locale: 42,
        timeZone: "Africa/Johannesburg",
        updatedAt: null,
      }),
    ).toBe(false);
  });

  it("accepts the applicant's own application list shape", () => {
    expect(
      isApplicationList([
        {
          id: "application-1",
          opportunityTitle: "Research partnership",
          opportunityType: "project",
          status: "submitted",
          submittedAt: "2026-11-13T08:00:00.000Z",
          updatedAt: "2026-11-13T08:00:00.000Z",
        },
      ]),
    ).toBe(true);
  });

  it("rejects malformed application lists and entries", () => {
    expect(isApplicationList({})).toBe(false);
    expect(
      isApplicationList([
        {
          id: "application-1",
          opportunityTitle: "Research partnership",
          opportunityType: "project",
          status: "submitted",
          submittedAt: "2026-11-13T08:00:00.000Z",
        },
      ]),
    ).toBe(false);
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
    expect(statusClass("accepted<script>")).toBe("status status-acceptedscript");
  });
});
