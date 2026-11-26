import { describe, expect, it } from "vitest";
import {
  evaluatePublicSearchBenchmark,
  evaluatePublicSearchRanking,
} from "./public-search-evaluation.js";

describe("evaluatePublicSearchRanking", () => {
  it("returns perfect metrics for a perfectly ordered judged result set", () => {
    const metrics = evaluatePublicSearchRanking(
      ["opportunity-a", "opportunity-b", "opportunity-c"],
      [
        { opportunityId: "opportunity-a", grade: 3 },
        { opportunityId: "opportunity-b", grade: 2 },
        { opportunityId: "opportunity-c", grade: 1 },
      ],
      3,
    );

    expect(metrics).toEqual({
      cutoff: 3,
      precisionAtK: 1,
      recallAtK: 1,
      reciprocalRank: 1,
      normalizedDiscountedCumulativeGainAtK: 1,
      relevantJudgmentCount: 3,
      retrievedRelevantCount: 3,
    });
  });

  it("penalizes relevant opportunities that appear lower in the ranking", () => {
    const metrics = evaluatePublicSearchRanking(
      ["unjudged-opportunity", "opportunity-b", "opportunity-a"],
      [
        { opportunityId: "opportunity-a", grade: 3 },
        { opportunityId: "opportunity-b", grade: 2 },
      ],
      3,
    );

    expect(metrics.precisionAtK).toBeCloseTo(2 / 3);
    expect(metrics.recallAtK).toBe(1);
    expect(metrics.reciprocalRank).toBe(0.5);
    expect(metrics.normalizedDiscountedCumulativeGainAtK).toBeGreaterThan(0);
    expect(metrics.normalizedDiscountedCumulativeGainAtK).toBeLessThan(1);
    expect(metrics.retrievedRelevantCount).toBe(2);
  });

  it("uses the requested cutoff as the precision denominator when fewer results are returned", () => {
    const metrics = evaluatePublicSearchRanking(
      ["opportunity-a"],
      [
        { opportunityId: "opportunity-a", grade: 1 },
        { opportunityId: "opportunity-b", grade: 1 },
      ],
      4,
    );

    expect(metrics.precisionAtK).toBe(0.25);
    expect(metrics.recallAtK).toBe(0.5);
    expect(metrics.reciprocalRank).toBe(1);
  });

  it("marks recall as not evaluable when the judgment set has no relevant result", () => {
    const metrics = evaluatePublicSearchRanking(
      ["opportunity-a"],
      [{ opportunityId: "opportunity-a", grade: 0 }],
      5,
    );

    expect(metrics.recallAtK).toBeNull();
    expect(metrics.reciprocalRank).toBe(0);
    expect(metrics.normalizedDiscountedCumulativeGainAtK).toBe(0);
    expect(metrics.relevantJudgmentCount).toBe(0);
  });

  it("rejects duplicate ranked IDs and duplicate judgments", () => {
    expect(() =>
      evaluatePublicSearchRanking(
        ["opportunity-a", "opportunity-a"],
        [{ opportunityId: "opportunity-a", grade: 1 }],
      ),
    ).toThrow(/ranked opportunity IDs must be unique/i);

    expect(() =>
      evaluatePublicSearchRanking(
        ["opportunity-a"],
        [
          { opportunityId: "opportunity-a", grade: 1 },
          { opportunityId: "opportunity-a", grade: 2 },
        ],
      ),
    ).toThrow(/judgment opportunity IDs must be unique/i);
  });

  it("rejects invalid cutoffs, IDs and relevance grades", () => {
    expect(() => evaluatePublicSearchRanking([], [], 0)).toThrow(
      /cutoff must be a positive safe integer/i,
    );
    expect(() => evaluatePublicSearchRanking([" "], [])).toThrow(
      /ranked opportunity ID must be a non-empty string/i,
    );
    expect(() =>
      evaluatePublicSearchRanking(
        ["opportunity-a"],
        [{ opportunityId: "opportunity-a", grade: 4 as never }],
      ),
    ).toThrow(/relevance grades must be integers from 0 to 3/i);
  });
});

describe("evaluatePublicSearchBenchmark", () => {
  it("aggregates macro metrics and reports evaluable-query counts", () => {
    const benchmark = evaluatePublicSearchBenchmark(
      [
        {
          queryId: "query-relevant",
          rankedOpportunityIds: ["opportunity-a", "opportunity-b"],
          judgments: [
            { opportunityId: "opportunity-a", grade: 3 },
            { opportunityId: "opportunity-b", grade: 1 },
          ],
        },
        {
          queryId: "query-no-positive-judgments",
          rankedOpportunityIds: ["opportunity-c", "opportunity-d"],
          judgments: [
            { opportunityId: "opportunity-c", grade: 0 },
            { opportunityId: "opportunity-d", grade: 0 },
          ],
        },
      ],
      2,
    );

    expect(benchmark).toMatchObject({
      cutoff: 2,
      queryCount: 2,
      macroPrecisionAtK: 0.5,
      macroRecallAtK: 1,
      macroReciprocalRank: 0.5,
      macroNormalizedDiscountedCumulativeGainAtK: 1,
      recallEvaluableQueryCount: 1,
      ndcgEvaluableQueryCount: 1,
    });
    expect(benchmark.perQuery).toHaveLength(2);
    expect(benchmark.perQuery[1]?.metrics.recallAtK).toBeNull();
  });

  it("returns null macro metrics for an empty benchmark", () => {
    expect(evaluatePublicSearchBenchmark([])).toEqual({
      cutoff: 10,
      queryCount: 0,
      macroPrecisionAtK: null,
      macroRecallAtK: null,
      macroReciprocalRank: null,
      macroNormalizedDiscountedCumulativeGainAtK: null,
      recallEvaluableQueryCount: 0,
      ndcgEvaluableQueryCount: 0,
      perQuery: [],
    });
  });

  it("validates the cutoff even when the benchmark has no cases", () => {
    expect(() => evaluatePublicSearchBenchmark([], 0)).toThrow(
      /cutoff must be a positive safe integer/i,
    );
  });

  it("rejects duplicate or blank query IDs and malformed cases", () => {
    const validCase = {
      queryId: "query-a",
      rankedOpportunityIds: ["opportunity-a"],
      judgments: [{ opportunityId: "opportunity-a", grade: 1 as const }],
    };

    expect(() => evaluatePublicSearchBenchmark([validCase, validCase])).toThrow(
      /evaluation query IDs must be unique/i,
    );
    expect(() =>
      evaluatePublicSearchBenchmark([{ ...validCase, queryId: " " }]),
    ).toThrow(/query ID must be a non-empty string/i);
    expect(() =>
      evaluatePublicSearchBenchmark([
        { ...validCase, rankedOpportunityIds: null as never },
      ]),
    ).toThrow(/ranked IDs and judgments arrays/i);
  });
});
