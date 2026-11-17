/**
 * Presentation-only locale negotiation and formatting.
 *
 * Locale preferences are not jurisdiction, residency, currency or time-zone
 * authority. Callers must supply supported locales, currency codes and time
 * zones from separately authorized product/account context.
 */
export const DEFAULT_LOCALE = "en" as const;

const MAX_ACCEPT_LANGUAGE_LENGTH = 1_024;
const MAX_ACCEPT_LANGUAGE_ENTRIES = 20;
const QUALITY_VALUE_PATTERN = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

function canonicalizeLocale(locale: string): string | null {
  const candidate = locale.trim();
  if (candidate.length === 0 || candidate.length > 128) {
    return null;
  }

  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Canonicalize a BCP 47 tag, falling back when the supplied preference is
 * absent or invalid. The fallback is also canonicalized.
 */
export function normalizeLocale(
  locale: string | null | undefined,
  fallbackLocale: string = DEFAULT_LOCALE,
): string {
  const fallback = canonicalizeLocale(fallbackLocale) ?? DEFAULT_LOCALE;

  return locale === null || locale === undefined
    ? fallback
    : (canonicalizeLocale(locale) ?? fallback);
}

/**
 * Parse an Accept-Language header into canonical locale preferences ordered by
 * descending q-value and then original header order. Wildcards, q=0 entries,
 * malformed tags and invalid q-values are ignored.
 */
export function parseAcceptLanguage(
  header: string | null | undefined,
): string[] {
  if (
    header === null ||
    header === undefined ||
    header.length === 0 ||
    header.length > MAX_ACCEPT_LANGUAGE_LENGTH
  ) {
    return [];
  }

  const preferences: Array<{
    locale: string;
    quality: number;
    order: number;
  }> = [];

  const entries = header.split(",").slice(0, MAX_ACCEPT_LANGUAGE_ENTRIES);
  for (const [order, entry] of entries.entries()) {
    const [rawLocale, ...parameters] = entry.split(";");
    const locale = canonicalizeLocale(rawLocale ?? "");
    if (locale === null) {
      continue;
    }

    let quality = 1;
    let qualitySeen = false;
    let valid = true;

    for (const parameter of parameters) {
      const [rawName, rawValue] = parameter.trim().split("=", 2);
      if (rawName?.toLowerCase() !== "q") {
        continue;
      }

      if (
        qualitySeen ||
        rawValue === undefined ||
        !QUALITY_VALUE_PATTERN.test(rawValue)
      ) {
        valid = false;
        break;
      }

      qualitySeen = true;
      quality = Number(rawValue);
    }

    if (valid && quality > 0) {
      preferences.push({ locale, quality, order });
    }
  }

  preferences.sort(
    (left, right) => right.quality - left.quality || left.order - right.order,
  );

  const seen = new Set<string>();
  return preferences.flatMap(({ locale }) => {
    const key = locale.toLowerCase();
    if (seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [locale];
  });
}

/**
 * Select a supported locale by exact match, then progressively less-specific
 * BCP 47 subtags. The fallback must be explicitly supported; otherwise the
 * first valid supported locale is used.
 */
export function negotiateLocale(
  preferences: readonly string[],
  supportedLocales: readonly string[],
  fallbackLocale: string = DEFAULT_LOCALE,
): string {
  const supported = supportedLocales.flatMap((locale) => {
    const canonical = canonicalizeLocale(locale);
    return canonical === null ? [] : [canonical];
  });

  const supportedByKey = new Map(
    supported.map((locale) => [locale.toLowerCase(), locale] as const),
  );

  if (supportedByKey.size === 0) {
    throw new RangeError("At least one valid supported locale is required.");
  }

  const canonicalFallback =
    canonicalizeLocale(fallbackLocale) ?? DEFAULT_LOCALE;
  const fallback =
    supportedByKey.get(canonicalFallback.toLowerCase()) ?? supported[0];

  if (fallback === undefined) {
    throw new RangeError("At least one valid supported locale is required.");
  }

  for (const preference of preferences) {
    const canonical = canonicalizeLocale(preference);
    if (canonical === null) {
      continue;
    }

    const subtags = canonical.split("-");
    while (subtags.length > 0) {
      const candidate = subtags.join("-").toLowerCase();
      const match = supportedByKey.get(candidate);
      if (match !== undefined) {
        return match;
      }
      subtags.pop();
    }
  }

  return fallback;
}

function assertFiniteNumber(value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError("A finite numeric value is required.");
  }
}

/**
 * Format a number using an explicit presentation locale.
 */
export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  assertFiniteNumber(value);
  return new Intl.NumberFormat(normalizeLocale(locale), options).format(value);
}

export type CurrencyFormatOptions = Omit<
  Intl.NumberFormatOptions,
  "currency" | "style"
>;

/**
 * Format money only when the caller supplies an explicit ISO-style currency
 * code. A locale never determines the currency.
 */
export function formatCurrency(
  value: number,
  currency: string,
  locale: string,
  options: CurrencyFormatOptions = {},
): string {
  assertFiniteNumber(value);
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new RangeError("A three-letter currency code is required.");
  }

  return new Intl.NumberFormat(normalizeLocale(locale), {
    ...options,
    style: "currency",
    currency: normalizedCurrency,
  }).format(value);
}

export type DateTimeFormatOptions = Omit<
  Intl.DateTimeFormatOptions,
  "timeZone"
>;

/**
 * Format a date/time in an explicit IANA time zone. String inputs must be
 * ISO 8601 date-only (UTC) or include an explicit UTC offset; ambiguous and
 * implementation-dependent strings are rejected. The time zone is never
 * inferred from locale.
 */
export function formatDateTime(
  value: Date | string | number,
  locale: string,
  timeZone: string,
  options: DateTimeFormatOptions = {},
): string {
  if (typeof value === "string") {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const dateTimeWithOffset =
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(
        value,
      );
    if (!dateOnly && !dateTimeWithOffset) {
      throw new RangeError(
        "Date/time strings must be ISO 8601 with an explicit UTC offset.",
      );
    }
  }

  const date =
    value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError("A valid date/time value is required.");
  }

  const normalizedTimeZone = timeZone.trim();
  if (normalizedTimeZone.length === 0) {
    throw new RangeError("An explicit time zone is required.");
  }

  return new Intl.DateTimeFormat(normalizeLocale(locale), {
    ...options,
    timeZone: normalizedTimeZone,
  }).format(date);
}
