import { describe, expect, it } from "vitest";
import { evaluatePublicSearchRanking } from "./public-search-evaluation.js";

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
