export type PublicSearchRelevanceGrade = 0 | 1 | 2 | 3;

export interface PublicSearchRelevanceJudgment {
  readonly opportunityId: string;
  readonly grade: PublicSearchRelevanceGrade;
}

export interface PublicSearchEvaluationMetrics {
  readonly cutoff: number;
  readonly precisionAtK: number;
  readonly recallAtK: number | null;
  readonly reciprocalRank: number;
  readonly normalizedDiscountedCumulativeGainAtK: number;
  readonly relevantJudgmentCount: number;
  readonly retrievedRelevantCount: number;
}

export interface PublicSearchEvaluationCase {
  readonly queryId: string;
  readonly rankedOpportunityIds: readonly string[];
  readonly judgments: readonly PublicSearchRelevanceJudgment[];
}

export interface PublicSearchBenchmarkMetrics {
  readonly cutoff: number;
  readonly queryCount: number;
  readonly macroPrecisionAtK: number | null;
  readonly macroRecallAtK: number | null;
  readonly macroReciprocalRank: number | null;
  readonly macroNormalizedDiscountedCumulativeGainAtK: number | null;
  readonly recallEvaluableQueryCount: number;
  readonly ndcgEvaluableQueryCount: number;
  readonly perQuery: readonly {
    readonly queryId: string;
    readonly metrics: PublicSearchEvaluationMetrics;
  }[];
}

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(label + " must be a non-empty string.");
  }
}

function assertCutoff(cutoff: number): void {
  if (!Number.isSafeInteger(cutoff) || cutoff < 1) {
    throw new RangeError("cutoff must be a positive safe integer.");
  }
}

function discountedCumulativeGain(grades: readonly number[]): number {
  return grades.reduce(
    (total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Evaluate a ranked list against explicit, offline relevance judgments.
 *
 * This helper is deliberately independent of participant profiles, tenant
 * data, model providers and runtime request handling. Callers must supply
 * stable public opportunity IDs and curated judgments.
 */
export function evaluatePublicSearchRanking(
  rankedOpportunityIds: readonly string[],
  judgments: readonly PublicSearchRelevanceJudgment[],
  cutoff = 10,
): PublicSearchEvaluationMetrics {
  assertCutoff(cutoff);

  const rankedIds = new Set<string>();
  for (const opportunityId of rankedOpportunityIds) {
    assertIdentifier(opportunityId, "Ranked opportunity ID");
    if (rankedIds.has(opportunityId)) {
      throw new TypeError("Ranked opportunity IDs must be unique.");
    }
    rankedIds.add(opportunityId);
  }

  const relevanceById = new Map<string, PublicSearchRelevanceGrade>();
  for (const judgment of judgments) {
    assertIdentifier(judgment.opportunityId, "Judgment opportunity ID");
    if (relevanceById.has(judgment.opportunityId)) {
      throw new TypeError("Judgment opportunity IDs must be unique.");
    }
    if (
      !Number.isInteger(judgment.grade) ||
      judgment.grade < 0 ||
      judgment.grade > 3
    ) {
      throw new RangeError("Relevance grades must be integers from 0 to 3.");
    }
    relevanceById.set(judgment.opportunityId, judgment.grade);
  }

  const relevantJudgmentCount = judgments.filter(
    (judgment) => judgment.grade > 0,
  ).length;
  const topRankedIds = rankedOpportunityIds.slice(0, cutoff);
  const topRankedGrades = topRankedIds.map(
    (opportunityId) => relevanceById.get(opportunityId) ?? 0,
  );
  const retrievedRelevantCount = topRankedGrades.filter(
    (grade) => grade > 0,
  ).length;
  const firstRelevantIndex = topRankedGrades.findIndex((grade) => grade > 0);
  const idealGrades = judgments
    .map((judgment) => judgment.grade)
    .sort((left, right) => right - left)
    .slice(0, cutoff);
  const idealGain = discountedCumulativeGain(idealGrades);
  const actualGain = discountedCumulativeGain(topRankedGrades);

  return {
    cutoff,
    precisionAtK: retrievedRelevantCount / cutoff,
    recallAtK:
      relevantJudgmentCount === 0
        ? null
        : retrievedRelevantCount / relevantJudgmentCount,
    reciprocalRank:
      firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1),
    normalizedDiscountedCumulativeGainAtK:
      idealGain === 0 ? 0 : actualGain / idealGain,
    relevantJudgmentCount,
    retrievedRelevantCount,
  };
}

/**
 * Aggregate public-search metrics across a versioned set of query cases.
 *
 * Precision and reciprocal rank include every case. Recall and NDCG include
 * only cases with at least one positive relevance judgment; their explicit
 * evaluable-query counts prevent empty-judgment cases from being hidden.
 */
export function evaluatePublicSearchBenchmark(
  cases: readonly PublicSearchEvaluationCase[],
  cutoff = 10,
): PublicSearchBenchmarkMetrics {
  assertCutoff(cutoff);
  if (!Array.isArray(cases)) {
    throw new TypeError("Evaluation cases must be an array.");
  }

  const queryIds = new Set<string>();
  const perQuery = cases.map((evaluationCase) => {
    if (typeof evaluationCase !== "object" || evaluationCase === null) {
      throw new TypeError("Evaluation cases must be objects.");
    }
    assertIdentifier(evaluationCase.queryId, "Query ID");
    if (queryIds.has(evaluationCase.queryId)) {
      throw new TypeError("Evaluation query IDs must be unique.");
    }
    queryIds.add(evaluationCase.queryId);
    if (
      !Array.isArray(evaluationCase.rankedOpportunityIds) ||
      !Array.isArray(evaluationCase.judgments)
    ) {
      throw new TypeError(
        "Each evaluation case must include ranked IDs and judgments arrays.",
      );
    }

    return {
      queryId: evaluationCase.queryId,
      metrics: evaluatePublicSearchRanking(
        evaluationCase.rankedOpportunityIds,
        evaluationCase.judgments,
        cutoff,
      ),
    };
  });

  const recallValues = perQuery.flatMap(({ metrics }) =>
    metrics.recallAtK === null ? [] : [metrics.recallAtK],
  );
  const ndcgValues = perQuery
    .filter(({ metrics }) => metrics.relevantJudgmentCount > 0)
    .map(
      ({ metrics }) => metrics.normalizedDiscountedCumulativeGainAtK,
    );

  return {
    cutoff,
    queryCount: perQuery.length,
    macroPrecisionAtK: average(
      perQuery.map(({ metrics }) => metrics.precisionAtK),
    ),
    macroRecallAtK: average(recallValues),
    macroReciprocalRank: average(
      perQuery.map(({ metrics }) => metrics.reciprocalRank),
    ),
    macroNormalizedDiscountedCumulativeGainAtK: average(ndcgValues),
    recallEvaluableQueryCount: recallValues.length,
    ndcgEvaluableQueryCount: ndcgValues.length,
    perQuery,
  };
}
