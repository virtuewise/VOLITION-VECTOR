import type { TrustEvidenceRecord } from "@volition/database";

export const TRUST_EVIDENCE_REPOSITORY = Symbol("TRUST_EVIDENCE_REPOSITORY");

export interface TrustEvidenceRepositoryPort {
  listForAccount(
    accountId: string,
    limit: number,
    offset: number,
  ): Promise<readonly TrustEvidenceRecord[]>;
}
