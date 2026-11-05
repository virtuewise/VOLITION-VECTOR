import { describe, expect, it } from "vitest";
import { normalizeTenantId } from "./tenant-context.js";

describe("normalizeTenantId", () => {
  it("canonicalizes a valid UUID", () => {
    expect(normalizeTenantId(" AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA ")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
  });
  it("rejects malformed and injectable values", () => {
    expect(() => normalizeTenantId("not-a-uuid")).toThrow(TypeError);
    expect(() => normalizeTenantId("'; SET ROLE postgres; --")).toThrow(
      TypeError,
    );
    expect(() => normalizeTenantId("")).toThrow(TypeError);
  });
});
