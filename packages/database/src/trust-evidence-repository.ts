import { normalizeAccountId } from "./tenant-context.js";
import {
  withAccountTransaction,
  type TenantConnectionPool,
  type TenantTransactionClient,
} from "./tenant-transaction.js";

export type TrustEvidenceClaimType =
  | "identity"
  | "qualification"
  | "capability"
  | "work_history";

export type TrustEvidenceStatus =
  | "submitted"
  | "under_review"
  | "verified"
  | "rejected"
  | "revoked"
  | "expired";

export type TrustEvidenceDecisionType =
  | "verified"
  | "rejected"
  | "revoked"
  | "expired";

export interface TrustEvidenceDecisionRecord {
  readonly decision: TrustEvidenceDecisionType;
  readonly decidedAt: Date;
}

export interface TrustEvidenceRecord {
  readonly id: string;
  readonly claimType: TrustEvidenceClaimType;
  readonly claimTitle: string;
  readonly issuerName: string;
  readonly issuerReference: string | null;
  readonly status: TrustEvidenceStatus;
  readonly submittedAt: Date;
  readonly reviewedAt: Date | null;
  readonly decisions: readonly TrustEvidenceDecisionRecord[];
}

interface TrustEvidenceRow {
  readonly id: string;
  readonly claim_type: TrustEvidenceClaimType;
  readonly claim_title: string;
  readonly issuer_name: string;
  readonly issuer_reference: string | null;
  readonly status: TrustEvidenceStatus;
  readonly submitted_at: Date;
  readonly reviewed_at: Date | null;
}

interface TrustEvidenceDecisionRow {
  readonly evidence_id: string;
  readonly decision: TrustEvidenceDecisionType;
  readonly decided_at: Date;
}

export class TrustEvidenceInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TrustEvidenceInputError";
  }
}

function validatePagination(limit: number, offset: number): void {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10_000
  ) {
    throw new TrustEvidenceInputError(
      "Trust evidence pagination parameters are invalid.",
    );
  }
}

/**
 * Private, account-scoped Trust evidence read model.
 *
 * The caller must supply an account ID from a verified internal principal.
 * The repository sets only transaction-local account context and also uses an
 * explicit subject predicate. It never returns object locators or reviewer
 * notes/identifiers to the API.
 */
export class PostgresTrustEvidenceRepository {
  constructor(private readonly pool: TenantConnectionPool) {}

  async listForAccount(
    accountId: string,
    limit = 20,
    offset = 0,
  ): Promise<readonly TrustEvidenceRecord[]> {
    const normalizedAccountId = normalizeAccountId(accountId);
    validatePagination(limit, offset);

    return withAccountTransaction(
      this.pool,
      normalizedAccountId,
      async (client: TenantTransactionClient) => {
        const evidenceResult = await client.query(
          "SELECT evidence.id::text AS id, evidence.claim_type, " +
            "evidence.claim_title, evidence.issuer_name, " +
            "evidence.issuer_reference, evidence.status, " +
            "evidence.submitted_at, evidence.reviewed_at " +
            "FROM trust_evidence AS evidence " +
            "WHERE evidence.subject_account_id = $1 " +
            "ORDER BY evidence.submitted_at DESC, evidence.id ASC " +
            "LIMIT $2 OFFSET $3",
          [normalizedAccountId, limit, offset],
        );
        const evidenceRows =
          evidenceResult.rows as readonly TrustEvidenceRow[];

        if (evidenceRows.length === 0) return [];

        const evidenceIds = evidenceRows.map((row) => row.id);
        const decisionResult = await client.query(
          "SELECT decision.evidence_id::text AS evidence_id, " +
            "decision.decision, decision.decided_at " +
            "FROM trust_evidence_decisions AS decision " +
            "JOIN trust_evidence AS evidence " +
            "ON evidence.id = decision.evidence_id " +
            "WHERE evidence.subject_account_id = $1 " +
            "AND decision.evidence_id = ANY($2::uuid[]) " +
            "ORDER BY decision.decided_at ASC, decision.id ASC",
          [normalizedAccountId, evidenceIds],
        );
        const decisionRows =
          decisionResult.rows as readonly TrustEvidenceDecisionRow[];

        const decisionsByEvidenceId = new Map<
          string,
          TrustEvidenceDecisionRecord[]
        >();
        for (const row of decisionRows) {
          const decisions = decisionsByEvidenceId.get(row.evidence_id) ?? [];
          decisions.push({
            decision: row.decision,
            decidedAt: row.decided_at,
          });
          decisionsByEvidenceId.set(row.evidence_id, decisions);
        }

        return evidenceRows.map((row) => ({
          id: row.id,
          claimType: row.claim_type,
          claimTitle: row.claim_title,
          issuerName: row.issuer_name,
          issuerReference: row.issuer_reference,
          status: row.status,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
          decisions: decisionsByEvidenceId.get(row.id) ?? [],
        }));
      },
    );
  }
}
