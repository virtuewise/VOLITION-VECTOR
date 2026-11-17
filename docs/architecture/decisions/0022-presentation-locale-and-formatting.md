# ADR 0022: Presentation locale negotiation and formatting

- Status: Proposed for review
- Date: 2026-11-17
- Decision owners: VOLITION VECTOR product, experience and platform engineering

## Context

The localization package currently exposes only a default English locale. Web
and mobile experiences need a shared foundation for locale preferences and
deterministic number, currency and date/time formatting. The platform serves
multiple jurisdictions, so presentation preferences must not silently become
legal, financial or identity decisions.

## Decision

Provide dependency-free, server-compatible locale helpers using the JavaScript
internationalization APIs.

- Canonicalize BCP 47 locale tags and fall back when a preference is absent or
  invalid.
- Parse `Accept-Language` as an ordered presentation preference only. A
  product/account preference supplied by an authorized caller takes precedence.
- Negotiate only against an explicit supported-locale list. Match exact tags
  first, then progressively less-specific subtags.
- Format numbers with an explicit locale.
- Format currency only when the caller supplies an explicit currency code.
  Never infer currency from locale, IP address, country or language.
- Format date/time values only when the caller supplies an explicit time zone.
  This keeps server rendering deterministic and avoids treating locale as a
  time-zone signal. String inputs are limited to ISO 8601 date-only values or
  date-time values with an explicit `Z` or numeric UTC offset; timezone-less
  and implementation-dependent strings are rejected. Calendar dates, clock
  fields and numeric offsets are range-checked before parsing; impossible dates
  are rejected instead of being normalized. Date-only ISO strings are
  interpreted as UTC.
- Keep locale, currency and time-zone inputs separate from authorization,
  residency, citizenship, tax status, jurisdiction, eligibility and payment
  routing.

## Scope

This package provides formatting and negotiation primitives only. It does not
provide translation catalogs, locale persistence, browser detection, currency
conversion, jurisdiction resolution, legal defaults or user-profile storage.
Apps must supply their supported locales and authorized currency/time-zone
context. Translation coverage and initial launch locales remain product
decisions.

## Consequences

The shared package can be used by Next.js, NestJS and Expo without additional
runtime dependencies. Callers must handle unsupported locales explicitly and
must not use an `Accept-Language` header as evidence of a user's country,
residency or legal status. The supported-locale list, fallback policy and
translation catalog require product review before broad rollout.

## Validation

Unit tests cover canonicalization, malformed and duplicate language ranges,
quality ordering, exact and less-specific matching, fallback behavior,
locale-specific number/currency output and explicit time-zone formatting.
