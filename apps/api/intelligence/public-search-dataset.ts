export const PUBLIC_SEARCH_DATASET_SCHEMA_VERSION = "1.0.0" as const;
export const PUBLIC_SEARCH_DATASET_SOURCE_POLICY =
  "public-opportunity-projection-only" as const;
export const PUBLIC_SEARCH_DATASET_RUBRIC_VERSION =
  "public-opportunity-relevance-v1" as const;

export type PublicSearchOpportunityType =
  "employment" | "project" | "tender" | "partnership" | "volunteering";

export type PublicSearchDatasetReviewStatus = "draft" | "reviewed";
export type PublicSearchDatasetRelevanceGrade = 0 | 1 | 2 | 3;

export interface PublicSearchDatasetJudgment {
  readonly opportunityId: string;
  readonly grade: PublicSearchDatasetRelevanceGrade;
}

export interface PublicSearchDatasetQuery {
  readonly queryId: string;
  readonly q: string;
  readonly opportunityType?: PublicSearchOpportunityType;
  readonly judgments: readonly PublicSearchDatasetJudgment[];
}

export interface PublicSearchRelevanceDataset {
  readonly schemaVersion: typeof PUBLIC_SEARCH_DATASET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly createdAt: string;
  readonly corpusSnapshotAt: string;
  readonly corpusSnapshotId: string;
  readonly cutoff: number;
  readonly sort: "relevance";
  readonly offset: 0;
  readonly sourcePolicy: typeof PUBLIC_SEARCH_DATASET_SOURCE_POLICY;
  readonly rubricVersion: typeof PUBLIC_SEARCH_DATASET_RUBRIC_VERSION;
  readonly reviewStatus: PublicSearchDatasetReviewStatus;
  readonly reviewedAt?: string;
  readonly reviewRecordId?: string;
  readonly limitations: readonly string[];
  readonly queries: readonly PublicSearchDatasetQuery[];
}

const MAX_DATASET_ID_LENGTH = 96;
const MAX_QUERY_COUNT = 250;
const MAX_QUERY_LENGTH = 200;
const MAX_JUDGMENTS_PER_QUERY = 500;
const MAX_TOTAL_JUDGMENTS = 25_000;
const MAX_LIMITATIONS = 20;
const MAX_LIMITATION_LENGTH = 500;
const MAX_CUTOFF = 50;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(label + " must be an object.");
  }
  return value as UnknownRecord;
}

function assertOnlyKeys(
  value: UnknownRecord,
  allowed: readonly string[],
  label: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      throw new TypeError(label + " contains unsupported field: " + key);
    }
  }
}

function readString(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError(
      label +
        " must be a trimmed string between " +
        minimumLength +
        " and " +
        maximumLength +
        " characters without control characters.",
    );
  }
  return value;
}

function readSlug(value: unknown, label: string): string {
  const result = readString(value, label, 1, MAX_DATASET_ID_LENGTH);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result)) {
    throw new TypeError(label + " must be a lowercase kebab-case identifier.");
  }
  return result;
}

function readOpportunityId(value: unknown, label: string): string {
  const result = readString(value, label, 1, 128);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(result)) {
    throw new TypeError(label + " has an invalid public identifier format.");
  }
  return result;
}

function readUuid(value: unknown, label: string): string {
  const result = readString(value, label, 36, 36);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      result,
    )
  ) {
    throw new TypeError(label + " must be an opaque UUID.");
  }
  return result;
}

function readTimestamp(value: unknown, label: string): string {
  const result = readString(value, label, 24, 24);
  if (
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(
      result,
    )
  ) {
    throw new TypeError(label + " must be a canonical UTC ISO timestamp.");
  }

  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) {
    throw new TypeError(label + " must be a valid UTC ISO timestamp.");
  }
  return result;
}

function readArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(label + " must be an array.");
  }
  return value;
}

function isOpportunityType(
  value: unknown,
): value is PublicSearchOpportunityType {
  return (
    value === "employment" ||
    value === "project" ||
    value === "tender" ||
    value === "partnership" ||
    value === "volunteering"
  );
}

/**
 * Validate an untrusted, offline public-search relevance dataset.
 *
 * The strict allowlist is intentional: account IDs, tenant IDs, profile data,
 * reviewer identities, protected traits and arbitrary metadata are rejected
 * rather than silently carried into evaluation artifacts.
 */
export function validatePublicSearchRelevanceDataset(
  input: unknown,
): PublicSearchRelevanceDataset {
  const dataset = asRecord(input, "Dataset");
  assertOnlyKeys(
    dataset,
    [
      "schemaVersion",
      "datasetId",
      "createdAt",
      "corpusSnapshotAt",
      "corpusSnapshotId",
      "cutoff",
      "sort",
      "offset",
      "sourcePolicy",
      "rubricVersion",
      "reviewStatus",
      "reviewedAt",
      "reviewRecordId",
      "limitations",
      "queries",
    ],
    "Dataset",
  );

  if (dataset["schemaVersion"] !== PUBLIC_SEARCH_DATASET_SCHEMA_VERSION) {
    throw new TypeError("Unsupported public-search dataset schema version.");
  }
  if (dataset["sourcePolicy"] !== PUBLIC_SEARCH_DATASET_SOURCE_POLICY) {
    throw new TypeError(
      "Dataset source policy must use the public projection.",
    );
  }
  if (dataset["rubricVersion"] !== PUBLIC_SEARCH_DATASET_RUBRIC_VERSION) {
    throw new TypeError("Unsupported public-search relevance rubric version.");
  }

  const datasetId = readSlug(dataset["datasetId"], "Dataset ID");
  const createdAt = readTimestamp(dataset["createdAt"], "Dataset createdAt");
  const corpusSnapshotAt = readTimestamp(
    dataset["corpusSnapshotAt"],
    "Corpus snapshot timestamp",
  );
  const corpusSnapshotId = readUuid(
    dataset["corpusSnapshotId"],
    "Corpus snapshot ID",
  );
  if (Date.parse(corpusSnapshotAt) > Date.parse(createdAt)) {
    throw new RangeError(
      "Corpus snapshot cannot be later than dataset creation.",
    );
  }

  if (
    typeof dataset["cutoff"] !== "number" ||
    !Number.isSafeInteger(dataset["cutoff"]) ||
    dataset["cutoff"] < 1 ||
    dataset["cutoff"] > MAX_CUTOFF
  ) {
    throw new RangeError("Dataset cutoff must be an integer from 1 to 50.");
  }

  if (dataset["sort"] !== "relevance") {
    throw new TypeError("Dataset sort must be relevance.");
  }
  if (dataset["offset"] !== 0) {
    throw new TypeError("Dataset offset must be zero.");
  }

  if (
    dataset["reviewStatus"] !== "draft" &&
    dataset["reviewStatus"] !== "reviewed"
  ) {
    throw new TypeError("Dataset reviewStatus must be draft or reviewed.");
  }

  let reviewedAt: string | undefined;
  let reviewRecordId: string | undefined;
  const hasReviewedAt = Object.prototype.hasOwnProperty.call(
    dataset,
    "reviewedAt",
  );
  const hasReviewRecordId = Object.prototype.hasOwnProperty.call(
    dataset,
    "reviewRecordId",
  );

  if (dataset["reviewStatus"] === "reviewed") {
    if (!hasReviewedAt || !hasReviewRecordId) {
      throw new TypeError(
        "Reviewed datasets require reviewedAt and reviewRecordId.",
      );
    }
    reviewedAt = readTimestamp(dataset["reviewedAt"], "Dataset reviewedAt");
    reviewRecordId = readUuid(dataset["reviewRecordId"], "Review record ID");
    if (Date.parse(reviewedAt) < Date.parse(createdAt)) {
      throw new RangeError("Dataset review cannot predate dataset creation.");
    }
  } else if (hasReviewedAt || hasReviewRecordId) {
    throw new TypeError(
      "Draft datasets must not contain review completion metadata.",
    );
  }

  const limitations = readArray(dataset["limitations"], "Dataset limitations");
  if (limitations.length < 1 || limitations.length > MAX_LIMITATIONS) {
    throw new RangeError("Dataset must include 1 to 20 limitations.");
  }
  const validatedLimitations = limitations.map((limitation, index) =>
    readString(
      limitation,
      "Dataset limitation " + index,
      1,
      MAX_LIMITATION_LENGTH,
    ),
  );

  const queryCases = readArray(dataset["queries"], "Dataset queries");
  if (queryCases.length < 1 || queryCases.length > MAX_QUERY_COUNT) {
    throw new RangeError("Dataset must include 1 to 250 query cases.");
  }

  const queryIds = new Set<string>();
  let totalJudgments = 0;
  const queries = queryCases.map((queryValue, queryIndex) => {
    const query = asRecord(queryValue, "Query case " + queryIndex);
    assertOnlyKeys(
      query,
      ["queryId", "q", "opportunityType", "judgments"],
      "Query case",
    );

    const queryId = readSlug(query["queryId"], "Query ID");
    if (queryIds.has(queryId)) {
      throw new TypeError("Dataset query IDs must be unique.");
    }
    queryIds.add(queryId);

    const q = readString(query["q"], "Search query", 1, MAX_QUERY_LENGTH);
    let opportunityType: PublicSearchOpportunityType | undefined;
    if (query["opportunityType"] !== undefined) {
      if (!isOpportunityType(query["opportunityType"])) {
        throw new TypeError("Query opportunityType is unsupported.");
      }
      opportunityType = query["opportunityType"];
    }

    const judgmentValues = readArray(query["judgments"], "Query judgments");
    if (
      judgmentValues.length < 1 ||
      judgmentValues.length > MAX_JUDGMENTS_PER_QUERY
    ) {
      throw new RangeError("Each query must include 1 to 500 judgments.");
    }
    totalJudgments += judgmentValues.length;
    if (totalJudgments > MAX_TOTAL_JUDGMENTS) {
      throw new RangeError("Dataset cannot exceed 25000 total judgments.");
    }

    const opportunityIds = new Set<string>();
    const judgments = judgmentValues.map((judgmentValue, judgmentIndex) => {
      const judgment = asRecord(judgmentValue, "Judgment " + judgmentIndex);
      assertOnlyKeys(judgment, ["opportunityId", "grade"], "Judgment");

      const opportunityId = readOpportunityId(
        judgment["opportunityId"],
        "Judgment opportunity ID",
      );
      if (opportunityIds.has(opportunityId)) {
        throw new TypeError(
          "Opportunity IDs must be unique within each query.",
        );
      }
      opportunityIds.add(opportunityId);

      if (
        typeof judgment["grade"] !== "number" ||
        !Number.isInteger(judgment["grade"]) ||
        judgment["grade"] < 0 ||
        judgment["grade"] > 3
      ) {
        throw new RangeError("Judgment grade must be an integer from 0 to 3.");
      }

      return {
        opportunityId,
        grade: judgment["grade"] as PublicSearchDatasetRelevanceGrade,
      };
    });

    return {
      queryId,
      q,
      ...(opportunityType === undefined ? {} : { opportunityType }),
      judgments,
    };
  });

  return {
    schemaVersion: PUBLIC_SEARCH_DATASET_SCHEMA_VERSION,
    datasetId,
    createdAt,
    corpusSnapshotAt,
    corpusSnapshotId,
    cutoff: dataset["cutoff"],
    sort: "relevance",
    offset: 0,
    sourcePolicy: PUBLIC_SEARCH_DATASET_SOURCE_POLICY,
    rubricVersion: PUBLIC_SEARCH_DATASET_RUBRIC_VERSION,
    reviewStatus: dataset["reviewStatus"],
    ...(reviewedAt === undefined ? {} : { reviewedAt }),
    ...(reviewRecordId === undefined ? {} : { reviewRecordId }),
    limitations: validatedLimitations,
    queries,
  };
}
