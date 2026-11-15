import { describe, expect, it } from "vitest";
import { formatMoney } from "./format-money.js";

describe("formatMoney", () => {
  it("preserves the currency's standard fractional precision", () => {
    expect(formatMoney("10.5", "USD", "en-US")).toBe("$10.50");
  });

  it("uses the currency's zero-decimal precision where appropriate", () => {
    expect(formatMoney("10.5", "JPY", "en-US")).toBe("¥11");
  });

  it("returns null for missing or non-finite amounts", () => {
    expect(formatMoney(null, "USD", "en-US")).toBeNull();
    expect(formatMoney("NaN", "USD", "en-US")).toBeNull();
  });

  it("returns null for invalid currency codes", () => {
    expect(formatMoney("10.5", "US", "en-US")).toBeNull();
  });
});
