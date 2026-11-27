import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  validatePublicSearchRelevanceDataset,
  type PublicSearchRelevanceDataset,
} from "./public-search-dataset.js";

function validDataset(): Record<string, unknown> {
  return {
    schemaVersion: "1.0.0",
    datasetId: "public-opportunity-baseline-v1",
    createdAt: "2026-11-27T08:00:00.000Z",
    corpusSnapshotAt: "2026-11-26T12:00:00.000Z",
    cutoff: 10,
    sourcePolicy: "public-opportunity-projection-only",
    rubricVersion: "public-opportunity-relevance-v1",
    reviewStatus: "draft",
    limitations: [
      "Curated public-intent queries do not represent all user search needs.",
      "Judgments cover only the referenced public listing snapshot.",
    ],
    queries: [
      {
        queryId: "community-solar-projects",
        q: "community solar project",
        opportunityType: "project",
        judgments: [
          { opportunityId: "public-opportunity-001", grade: 3 },
          { opportunityId: "public-opportunity-002", grade: 1 },
          { opportunityId: "public-opportunity-003", grade: 0 },
        ],
      },
    ],
  };
}

describe("validatePublicSearchRelevanceDataset", () => {
  it("accepts a draft dataset that follows the public search contract", () => {
    const dataset = validatePublicSearchRelevanceDataset(validDataset());

    expect(dataset).toMatchObject({
      schemaVersion: "1.0.0",
      datasetId: "public-opportunity-baseline-v1",
      cutoff: 10,
      reviewStatus: "draft",
      queries: [
        {
          queryId: "community-solar-projects",
          q: "community solar project",
          opportunityType: "project",
          judgments: [
            { opportunityId: "public-opportunity-001", grade: 3 },
            { opportunityId: "public-opportunity-002", grade: 1 },
            { opportunityId: "public-opportunity-003", grade: 0 },
          ],
        },
      ],
    });
  });

  it("requires an opaque governance reference and date for reviewed datasets", () => {
    const input = {
      ...validDataset(),
      reviewStatus: "reviewed",
      reviewedAt: "2026-11-27T09:00:00.000Z",
      reviewRecordId: "8f4b6b6e-3e70-4f1b-9a15-2a6d1a3c8f20",
    };

    const dataset = validatePublicSearchRelevanceDataset(
      input,
    ) as PublicSearchRelevanceDataset;

    expect(dataset.reviewStatus).toBe("reviewed");
    expect(dataset.reviewRecordId).toBe("8f4b6b6e-3e70-4f1b-9a15-2a6d1a3c8f20");
  });

  it("rejects private, personal and unrecognized metadata instead of retaining it", () => {
    const input = {
      ...validDataset(),
      reviewerIdentity: "person@example.invalid",
      accountId: "account-123",
    };

    expect(() => validatePublicSearchRelevanceDataset(input)).toThrow(
      /unsupported field/i,
    );

    const queryInput = validDataset();
    const query = (queryInput.queries as Record<string, unknown>[])[0]!;
    query.profileText = "private profile data";

    expect(() => validatePublicSearchRelevanceDataset(queryInput)).toThrow(
      /unsupported field/i,
    );
  });

  it("rejects duplicate query IDs and duplicate opportunity judgments", () => {
    const input = validDataset();
    const first = (input.queries as Record<string, unknown>[])[0]!;

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        queries: [first, { ...first }],
      }),
    ).toThrow(/query IDs must be unique/i);

    const duplicateJudgments = {
      ...input,
      queries: [
        {
          ...first,
          judgments: [
            { opportunityId: "public-opportunity-001", grade: 1 },
            { opportunityId: "public-opportunity-001", grade: 2 },
          ],
        },
      ],
    };

    expect(() =>
      validatePublicSearchRelevanceDataset(duplicateJudgments),
    ).toThrow(/unique within each query/i);
  });

  it("rejects unsupported grades, opportunity types and query text", () => {
    const input = validDataset();
    const first = (input.queries as Record<string, unknown>[])[0];

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        queries: [
          {
            ...first,
            judgments: [{ opportunityId: "public-opportunity-001", grade: 4 }],
          },
        ],
      }),
    ).toThrow(/grade must be an integer from 0 to 3/i);

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        queries: [{ ...first, opportunityType: "private" }],
      }),
    ).toThrow(/opportunityType is unsupported/i);

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        queries: [{ ...first, q: " " }],
      }),
    ).toThrow(/search query/i);
  });

  it("rejects invalid cutoffs, timestamps and inconsistent review metadata", () => {
    const input = validDataset();

    expect(() =>
      validatePublicSearchRelevanceDataset({ ...input, cutoff: 51 }),
    ).toThrow(/cutoff must be an integer from 1 to 50/i);

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        corpusSnapshotAt: "2026-11-28T00:00:00.000Z",
      }),
    ).toThrow(/cannot be later than dataset creation/i);

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        reviewStatus: "reviewed",
      }),
    ).toThrow(/require reviewedAt and reviewRecordId/i);

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        reviewedAt: "2026-11-27T09:00:00.000Z",
      }),
    ).toThrow(/draft datasets must not contain review completion metadata/i);
  });

  it("requires explicit judgments and known limitations", () => {
    const input = validDataset();
    const first = (input.queries as Record<string, unknown>[])[0];

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        limitations: [],
      }),
    ).toThrow(/1 to 20 limitations/i);

    expect(() =>
      validatePublicSearchRelevanceDataset({
        ...input,
        queries: [{ ...first, judgments: [] }],
      }),
    ).toThrow(/1 to 500 judgments/i);
  });

  it("keeps the machine-readable schema strict and version-aligned", () => {
    const schemaUrl = new URL(
      "../../../docs/intelligence/public-search-relevance-dataset.schema.json",
      import.meta.url,
    );
    const schema = JSON.parse(readFileSync(schemaUrl, "utf8")) as {
      additionalProperties: boolean;
      properties: Record<string, { const?: string; enum?: readonly unknown[] }>;
      $defs: Record<
        string,
        {
          additionalProperties?: boolean;
          properties?: Record<string, { enum?: readonly unknown[] }>;
        }
      >;
    };

    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.schemaVersion?.const).toBe("1.0.0");
    expect(schema.properties.sourcePolicy?.const).toBe(
      "public-opportunity-projection-only",
    );
    expect(schema.$defs.queryCase?.additionalProperties).toBe(false);
    expect(schema.$defs.judgment?.additionalProperties).toBe(false);
    expect(schema.$defs.judgment?.properties?.grade?.enum).toEqual([0, 1, 2, 3]);
  });
});
