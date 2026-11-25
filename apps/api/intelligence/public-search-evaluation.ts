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

function assertIdentifier(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(label + " must be a non-empty string.");
  }
}

function discountedCumulativeGain(grades: readonly number[]): number {
  return grades.reduce(
    (total, grade, index) =>
      total + (2 ** grade - 1) / Math.log2(index + 2),
    0,
  );
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
  if (!Number.isSafeInteger(cutoff) || cutoff < 1) {
    throw new RangeError("cutoff must be a positive safe integer.");
  }

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
