import { describe, expect, it } from "vitest";
import {
  parsePublicOpportunityCollection,
  parsePublicServiceCollection,
} from "./public-data.js";

const opportunity = {
  id: "11111111-1111-4111-8111-111111111111",
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "senior-product-designer",
  title: "Senior Product Designer",
  summary: "Design accessible services for a global audience.",
  opportunityType: "employment",
  locationLabel: "Amsterdam",
  isRemote: true,
  compensationMin: "65000.00",
  compensationMax: "80000.00",
  compensationCurrency: "EUR",
  publishedAt: "2026-11-15T08:00:00.000Z",
  expiresAt: null,
};

const service = {
  id: "22222222-2222-4222-8222-222222222222",
  organizationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  slug: "accessible-product-audit",
  title: "Accessible Product Audit",
  summary: "Review a digital product against accessibility requirements.",
  category: "accessibility",
  deliveryMode: "remote",
  pricingModel: "fixed",
  priceAmount: "1200.00",
  priceCurrency: "EUR",
  locationLabel: null,
  publishedAt: "2026-11-15T08:00:00.000Z",
  expiresAt: "2026-12-15T08:00:00.000Z",
};

describe("public marketplace response validation", () => {
  it("accepts a valid public opportunity projection", () => {
    expect(parsePublicOpportunityCollection([opportunity])).toEqual([
      opportunity,
    ]);
  });

  it("rejects an opportunity with an invalid enum or field type", () => {
    expect(
      parsePublicOpportunityCollection([
        { ...opportunity, opportunityType: "internal" },
      ]),
    ).toBeNull();
    expect(
      parsePublicOpportunityCollection([{ ...opportunity, isRemote: "true" }]),
    ).toBeNull();
  });

  it("rejects inconsistent or malformed compensation", () => {
    expect(
      parsePublicOpportunityCollection([
        { ...opportunity, compensationMax: "60000.00" },
      ]),
    ).toBeNull();
    expect(
      parsePublicOpportunityCollection([
        { ...opportunity, compensationCurrency: null },
      ]),
    ).toBeNull();
    expect(
      parsePublicOpportunityCollection([
        { ...opportunity, compensationMin: "NaN" },
      ]),
    ).toBeNull();
  });

  it("rejects invalid identifiers and timestamps", () => {
    expect(
      parsePublicOpportunityCollection([
        { ...opportunity, organizationId: "not-a-uuid" },
      ]),
    ).toBeNull();
    expect(
      parsePublicOpportunityCollection([
        { ...opportunity, publishedAt: "yesterday" },
      ]),
    ).toBeNull();
  });

  it("accepts a valid priced public service projection", () => {
    expect(parsePublicServiceCollection([service])).toEqual([service]);
  });

  it("accepts a quote service only when amount and currency are absent", () => {
    expect(
      parsePublicServiceCollection([
        {
          ...service,
          pricingModel: "quote",
          priceAmount: null,
          priceCurrency: null,
        },
      ]),
    ).not.toBeNull();
    expect(
      parsePublicServiceCollection([
        { ...service, pricingModel: "quote", priceAmount: "100.00" },
      ]),
    ).toBeNull();
  });

  it("rejects invalid service categories, delivery modes and pricing models", () => {
    expect(
      parsePublicServiceCollection([{ ...service, category: "Not A Slug" }]),
    ).toBeNull();
    expect(
      parsePublicServiceCollection([{ ...service, deliveryMode: "unknown" }]),
    ).toBeNull();
    expect(
      parsePublicServiceCollection([{ ...service, pricingModel: "free" }]),
    ).toBeNull();
  });

  it("rejects malformed, oversized and partially invalid collections", () => {
    expect(
      parsePublicOpportunityCollection({ items: [opportunity] }),
    ).toBeNull();
    expect(
      parsePublicOpportunityCollection(
        Array.from({ length: 21 }, () => opportunity),
      ),
    ).toBeNull();
    expect(
      parsePublicServiceCollection([
        service,
        { ...service, title: "" },
      ]),
    ).toBeNull();
  });
});
