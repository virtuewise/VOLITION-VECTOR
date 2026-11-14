import { describe, expect, it } from "vitest";
import { PostgresProjectWorkspaceRepository } from "./index.js";
import type {
  TenantConnection,
  TenantConnectionPool,
  TenantQueryResult,
} from "./tenant-transaction.js";

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACCOUNT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const workspaceRow = {
  id: PROJECT_ID,
  organization_id: ORGANIZATION_ID,
  opportunity_application_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  opportunity_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  client_account_id: ACCOUNT_ID,
  provider_account_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  title: "Website redesign",
  description: "A scoped website redesign project.",
  status: "active" as const,
  starts_at: null,
  target_completion_at: null,
  completed_at: null,
  created_at: new Date("2026-11-06T10:00:00.000Z"),
  updated_at: new Date("2026-11-06T11:00:00.000Z"),
};

const milestoneRow = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: ORGANIZATION_ID,
  project_id: PROJECT_ID,
  title: "Approved design",
  description: "Submit the approved design files.",
  sequence_number: 1,
  status: "pending" as const,
  due_at: null,
  submitted_at: null,
  accepted_at: null,
  accepted_by_account_id: null,
  created_at: new Date("2026-11-06T10:00:00.000Z"),
  updated_at: new Date("2026-11-06T10:00:00.000Z"),
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

describe("PostgresProjectWorkspaceRepository", () => {
  it("lists only projects in which the account is a participant", async () => {
    const pool = new FakePool((sql) =>
      sql.includes("FROM project_workspaces") ? [workspaceRow] : [],
    );
    const repository = new PostgresProjectWorkspaceRepository(pool);

    const projects = await repository.listForParticipant(
      ORGANIZATION_ID,
      ACCOUNT_ID,
      10,
      5,
    );

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: PROJECT_ID,
      organizationId: ORGANIZATION_ID,
      clientAccountId: ACCOUNT_ID,
      title: "Website redesign",
    });
    const select = pool.statements.find((entry) =>
      entry.sql.includes("FROM project_workspaces"),
    );
    expect(select?.sql).toContain(
      "client_account_id = $2 OR provider_account_id = $2",
    );
    expect(select?.parameters).toEqual([ORGANIZATION_ID, ACCOUNT_ID, 10, 5]);
    expect(pool.statements[1]?.parameters).toEqual([ORGANIZATION_ID]);
    expect(pool.statements[2]?.parameters).toEqual([ACCOUNT_ID]);
    expect(pool.statements.at(-1)?.sql).toBe("COMMIT");
    expect(pool.releaseCalls).toBe(1);
  });

  it("returns null when an account is not a project participant", async () => {
    const pool = new FakePool();
    const repository = new PostgresProjectWorkspaceRepository(pool);

    await expect(
      repository.getForParticipant(ORGANIZATION_ID, PROJECT_ID, ACCOUNT_ID),
    ).resolves.toBeNull();

    const select = pool.statements.find((entry) =>
      entry.sql.includes("FROM project_workspaces"),
    );
    expect(select?.parameters).toEqual([
      ORGANIZATION_ID,
      PROJECT_ID,
      ACCOUNT_ID,
    ]);
    expect(select?.sql).toContain(
      "client_account_id = $3 OR provider_account_id = $3",
    );
  });

  it("joins milestones through a participant-filtered project", async () => {
    const pool = new FakePool((sql) =>
      sql.includes("FROM project_milestones") ? [milestoneRow] : [],
    );
    const repository = new PostgresProjectWorkspaceRepository(pool);

    const milestones = await repository.listMilestonesForParticipant(
      ORGANIZATION_ID,
      PROJECT_ID,
      ACCOUNT_ID,
    );

    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({
      id: milestoneRow.id,
      projectId: PROJECT_ID,
      sequenceNumber: 1,
      status: "pending",
    });
    const select = pool.statements.find((entry) =>
      entry.sql.includes("FROM project_milestones"),
    );
    expect(select?.sql).toContain("JOIN project_workspaces AS project");
    expect(select?.sql).toContain(
      "project.client_account_id = $3 OR project.provider_account_id = $3",
    );
    expect(select?.parameters).toEqual([
      ORGANIZATION_ID,
      PROJECT_ID,
      ACCOUNT_ID,
    ]);
  });

  it("rejects invalid pagination before acquiring a connection", async () => {
    const pool = new FakePool();
    const repository = new PostgresProjectWorkspaceRepository(pool);

    await expect(
      repository.listForParticipant(ORGANIZATION_ID, ACCOUNT_ID, 0, 0),
    ).rejects.toThrow("pagination parameters are invalid");
    expect(pool.connectCalls).toBe(0);
  });

  it("rolls back and releases the connection when a query fails", async () => {
    const pool = new FakePool((sql) => {
      if (sql.includes("FROM project_workspaces")) {
        throw new Error("database unavailable");
      }
      return [];
    });
    const repository = new PostgresProjectWorkspaceRepository(pool);

    await expect(
      repository.getForParticipant(ORGANIZATION_ID, PROJECT_ID, ACCOUNT_ID),
    ).rejects.toThrow("database unavailable");

    expect(pool.statements.at(-1)?.sql).toBe("ROLLBACK");
    expect(pool.releaseCalls).toBe(1);
  });
});
