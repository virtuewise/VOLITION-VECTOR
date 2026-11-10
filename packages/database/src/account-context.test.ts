import { describe, expect, it } from "vitest";
import { normalizeAccountId } from "./account-context.js";

describe("normalizeAccountId", () => {
  it("canonicalizes a valid UUID", () => {
    expect(
      normalizeAccountId(" 11111111-1111-4111-8111-111111111111 "),
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("rejects malformed and injectable values", () => {
    expect(() => normalizeAccountId("not-a-uuid")).toThrow(TypeError);
    expect(() => normalizeAccountId("'; SET ROLE postgres; --")).toThrow(
      TypeError,
    );
    expect(() => normalizeAccountId("")).toThrow(TypeError);
  });
});
