import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDateTime,
  formatNumber,
  negotiateLocale,
  normalizeLocale,
  parseAcceptLanguage,
} from "./index.js";

describe("locale normalization and negotiation", () => {
  it("canonicalizes locale tags and falls back on invalid input", () => {
    expect(normalizeLocale("en-us")).toBe("en-US");
    expect(normalizeLocale("invalid_tag")).toBe("en");
    expect(normalizeLocale(undefined, "fr-ca")).toBe("fr-CA");
  });

  it("orders Accept-Language by q-value and header order", () => {
    const header = [
      "fr-CA;q=0.8",
      "en-US;q=1",
      "fr;q=0.8",
      "de;q=0",
      "*;q=0.5",
      "invalid_tag;q=0.9",
    ].join(", ");

    expect(parseAcceptLanguage(header)).toEqual(["en-US", "fr-CA", "fr"]);
  });

  it("ignores invalid quality values and duplicate canonical tags", () => {
    expect(
      parseAcceptLanguage(
        "en;q=1.001, fr;q=0.5, FR;q=0.4, de;q=0.000, es;q=0.1234",
      ),
    ).toEqual(["fr"]);
  });

  it("ignores oversized preference headers", () => {
    expect(parseAcceptLanguage("en".repeat(600))).toEqual([]);
  });

  it("matches progressively less-specific supported locales", () => {
    expect(negotiateLocale(["fr-CA", "en-US"], ["en", "fr", "es"], "en")).toBe(
      "fr",
    );
  });

  it("uses an exact supported locale when available", () => {
    expect(negotiateLocale(["pt-BR", "en"], ["en", "pt", "pt-BR"], "en")).toBe(
      "pt-BR",
    );
  });

  it("uses the supported fallback when no preference matches", () => {
    expect(negotiateLocale(["ja-JP"], ["en", "fr"], "fr")).toBe("fr");
    expect(negotiateLocale([], ["en", "fr"], "de")).toBe("en");
  });

  it("requires at least one valid supported locale", () => {
    expect(() => negotiateLocale(["en"], ["invalid_tag"])).toThrow(RangeError);
  });
});

describe("locale-aware formatting", () => {
  it("formats numbers using the requested locale", () => {
    expect(formatNumber(1_234.5, "en-US")).toBe("1,234.5");
    expect(formatNumber(1_234.5, "de-DE")).toBe("1.234,5");
  });

  it("formats currency only with an explicit currency code", () => {
    expect(formatCurrency(1_234.5, "USD", "en-US")).toBe("$1,234.50");
    const euro = formatCurrency(1_234.5, "EUR", "de-DE");
    expect(euro).toContain("1.234,50");
    expect(euro).toContain("€");
  });

  it("rejects non-finite numbers and malformed currency codes", () => {
    expect(() => formatNumber(Number.NaN, "en-US")).toThrow(RangeError);
    expect(() => formatCurrency(10, "US", "en-US")).toThrow(RangeError);
  });

  it("formats date/time values in the explicit time zone", () => {
    const value = "2026-11-17T10:00:00.000Z";
    const options = { dateStyle: "medium", timeStyle: "short" } as const;
    const expected = new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    }).format(new Date(value));

    expect(formatDateTime(value, "en-US", "UTC", options)).toBe(expected);
  });

  it("accepts ISO date-only and offset-qualified strings", () => {
    const options = { dateStyle: "medium", timeStyle: "short" } as const;
    const dateOnly = "2026-11-17";
    const offsetDateTime = "2026-11-17T10:00:00+02:00";

    expect(formatDateTime(dateOnly, "en-US", "UTC", options)).toBe(
      new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone: "UTC",
      }).format(new Date(dateOnly)),
    );
    expect(formatDateTime(offsetDateTime, "en-US", "UTC", options)).toBe(
      new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone: "UTC",
      }).format(new Date(offsetDateTime)),
    );
  });

  it("rejects timezone-less and implementation-dependent date strings", () => {
    expect(() =>
      formatDateTime("2026-11-17T10:00:00", "en-US", "UTC"),
    ).toThrow(/explicit UTC offset/i);
    expect(() =>
      formatDateTime("November 17, 2026 10:00", "en-US", "UTC"),
    ).toThrow(/explicit UTC offset/i);
  });

  it("rejects invalid dates and missing or invalid time zones", () => {
    expect(() => formatDateTime("not-a-date", "en-US", "UTC")).toThrow(
      RangeError,
    );
    expect(() => formatDateTime(Date.now(), "en-US", "")).toThrow(RangeError);
    expect(() =>
      formatDateTime(Date.now(), "en-US", "Mars/Olympus_Mons"),
    ).toThrow(RangeError);
  });
});
