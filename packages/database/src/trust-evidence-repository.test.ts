import { describe, expect, it } from "vitest";
import { PostgresTrustEvidenceRepository } from "./trust-evidence-repository.js";
import type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
} from "./tenant-transaction.js";

const ACCOUNT_ID = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID = "99999999-9999-4999-8999-999999999991";
const SUBMITTED_AT = new Date("2026-11-06T09:00:00.000Z");
const REVIEWED_AT = new Date("2026-11-07T09:00:00.000Z");

const evidenceRow = {
  id: EVIDENCE_ID,
  claim_type: "qualification" as const,
  claim_title: "Candidate qualification",
  issuer_name: "Example Institute",
  issuer_reference: "credential-001",
  status: "verified" as const,
  submitted_at: SUBMITTED_AT,
  reviewed_at: REVIEWED_AT,
};

const decisionRow = {
  evidence_id: EVIDENCE_ID,
  decision: "verified" as const,
  decided_at: REVIEWED_AT,
};

class FakePool implements TenantConnectionPool {
  readonly statements: Array<{
    readonly sql: string;
    readonly parameters: readonly unknown[];
  }> = [];
  connectCalls = 0;
  releaseCalls = 0;

  constructor(
    private readonly rowsForQuery: (
      sql: string,
      parameters: readonly unknown[],
    ) => readonly unknown[] = () => [],
  ) {}

  async connect(): Promise<TenantConnection> {
    this.connectCalls += 1;
    return {
      query: async (
        sql: string,
        parameters: readonly unknown[] = [],
      ): Promise<TenantQueryResult> => {
        this.statements.push({ sql, parameters });
        return { rows: this.rowsForQuery(sql, parameters) };
      },
      release: () => {
        this.releaseCalls += 1;
      },
    };
  }
}

describe("PostgresTrustEvidenceRepository", () => {
  it("lists only the account's evidence metadata and decision types", async () => {
    const pool = new FakePool((sql) => {
      if (sql.includes("FROM trust_evidence AS evidence")) {
        return [evidenceRow];
      }
      if (sql.includes("FROM trust_evidence_decisions AS decision")) {
        return [decisionRow];
      }
      return [];
    });
    const repository = new PostgresTrustEvidenceRepository(pool);

    const records = await repository.listForAccount(ACCOUNT_ID, 10, 5);

    expect(records).toEqual([
      {
        id: EVIDENCE_ID,
        claimType: "qualification",
        claimTitle: "Candidate qualification",
        issuerName: "Example Institute",
        issuerReference: "credential-001",
        status: "verified",
        submittedAt: SUBMITTED_AT,
        reviewedAt: REVIEWED_AT,
        decisions: [{ decision: "verified", decidedAt: REVIEWED_AT }],
      },
    ]);

    expect(pool.statements[1]?.sql).toBe(
      "SELECT set_config('app.account_id', $1, true)",
    );
    const evidenceQuery = pool.statements.find((entry) =>
      entry.sql.includes("FROM trust_evidence AS evidence"),
    );
    expect(evidenceQuery?.sql).toContain(
      "WHERE evidence.subject_account_id = $1",
    );
    expect(evidenceQuery?.parameters).toEqual([ACCOUNT_ID, 10, 5]);
    expect(evidenceQuery?.sql).not.toContain("evidence_locator");

    const decisionQuery = pool.statements.find((entry) =>
      entry.sql.includes("FROM trust_evidence_decisions AS decision"),
    );
    expect(decisionQuery?.sql).toContain("JOIN trust_evidence AS evidence");
    expect(decisionQuery?.sql).toContain(
      "WHERE evidence.subject_account_id = $1",
    );
    expect(decisionQuery?.sql).toContain(
      "decision.evidence_id = ANY($2::uuid[])",
    );
    expect(decisionQuery?.sql).not.toContain("decision_note");
    expect(decisionQuery?.parameters).toEqual([ACCOUNT_ID, [EVIDENCE_ID]]);
    expect(pool.statements.at(-1)?.sql).toBe("COMMIT");
    expect(pool.releaseCalls).toBe(1);
  });

  it("does not query decision history when the evidence page is empty", async () => {
    const pool = new FakePool();
    const repository = new PostgresTrustEvidenceRepository(pool);

    await expect(repository.listForAccount(ACCOUNT_ID)).resolves.toEqual([]);

    expect(
      pool.statements.some((entry) =>
        entry.sql.includes("FROM trust_evidence_decisions"),
      ),
    ).toBe(false);
    expect(pool.statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("rejects invalid account IDs before acquiring a connection", async () => {
    const pool = new FakePool();
    const repository = new PostgresTrustEvidenceRepository(pool);

    await expect(repository.listForAccount("not-an-account")).rejects.toThrow(
      TypeError,
    );
    expect(pool.connectCalls).toBe(0);
  });

  it("rejects invalid pagination before acquiring a connection", async () => {
    const pool = new FakePool();
    const repository = new PostgresTrustEvidenceRepository(pool);

    await expect(repository.listForAccount(ACCOUNT_ID, 51, 0)).rejects.toThrow(
      "pagination parameters are invalid",
    );
    await expect(
      repository.listForAccount(ACCOUNT_ID, 20, 10_001),
    ).rejects.toThrow("pagination parameters are invalid");
    expect(pool.connectCalls).toBe(0);
  });

  it("rolls back and releases the connection when decision history fails", async () => {
      const pool = new FakePool((sql) => {
        if (sql.includes("FROM trust_evidence AS evidence")) {
          return [evidenceRow];
        }
        if (sql.includes("FROM trust_evidence_decisions AS decision")) {
          throw new Error("decision history unavailable");
        }
        return [];
      });
      const repository = new PostgresTrustEvidenceRepository(pool);

      await expect(repository.listForAccount(ACCOUNT_ID)).rejects.toThrow(
        "decision history unavailable",
      );

      expect(pool.statements.at(-1)?.sql).toBe("ROLLBACK");
      expect(pool.releaseCalls).toBe(1);
  });
});
