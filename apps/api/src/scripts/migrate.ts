import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATION_LOCK = "volition-vector:database-migrations";

type MigrationRecord = {
  migration_name: string;
  checksum: string | null;
};

async function runMigrations(): Promise<void> {
  const connectionString = process.env["DATABASE_MIGRATION_URL"];
  if (!connectionString) {
    throw new Error(
      "DATABASE_MIGRATION_URL is required; migrations must use a dedicated migration-owner connection.",
    );
  }

  const databaseEntry = fileURLToPath(import.meta.resolve("@volition/database"));
  const migrationsRoot = resolve(
    dirname(databaseEntry),
    "../prisma/migrations",
  );
  const migrationDirectories = (await readdir(migrationsRoot, {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (migrationDirectories.length === 0) {
    throw new Error(`No database migrations found in ${migrationsRoot}.`);
  }

  const client = new Client({ connectionString });
  let lockAcquired = false;

  try {
    await client.connect();
    await client.query(
      "SELECT pg_advisory_lock(hashtextextended($1, 0))",
      [MIGRATION_LOCK],
    );
    lockAcquired = true;

    await client.query(`
      CREATE TABLE IF NOT EXISTS public.vv_schema_migrations (
        migration_name text PRIMARY KEY,
        checksum text,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const appliedResult = await client.query<MigrationRecord>(
      "SELECT migration_name, checksum FROM public.vv_schema_migrations",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.migration_name, row.checksum]),
    );

    for (const migrationName of migrationDirectories) {
      if (!/^\\d{14}_[a-z0-9_]+$/.test(migrationName)) {
        throw new Error(`Invalid migration directory name: ${migrationName}`);
      }

      const migrationPath = join(
        migrationsRoot,
        migrationName,
        "migration.sql",
      );
      const sql = await readFile(migrationPath, "utf8");
      if (!sql.trim()) {
        throw new Error(`Migration ${migrationName} is empty.`);
      }

      const checksum = createHash("sha256").update(sql).digest("hex");
      const existingChecksum = applied.get(migrationName);

      if (existingChecksum !== undefined) {
        if (existingChecksum === null) {
          // A null checksum is reserved for a verified pre-runner baseline.
          // The next successful runner invocation seals it to the file hash.
          await client.query(
            `UPDATE public.vv_schema_migrations
             SET checksum = $1
             WHERE migration_name = $2 AND checksum IS NULL`,
            [checksum, migrationName],
          );
          console.log(`Recorded existing migration: ${migrationName}`);
          continue;
        }

        if (existingChecksum !== checksum) {
          throw new Error(
            `Applied migration ${migrationName} has changed; create a new migration instead of editing history.`,
          );
        }

        console.log(`Already applied: ${migrationName}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        // Migration files intentionally contain multiple DDL statements and
        // dollar-quoted functions; pg's simple-query protocol executes the
        // complete file as one transaction.
        await client.query(sql);
        await client.query(
          `INSERT INTO public.vv_schema_migrations
             (migration_name, checksum)
           VALUES ($1, $2)`,
          [migrationName, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied migration: ${migrationName}`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    }
  } finally {
    if (lockAcquired) {
      await client
        .query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [
          MIGRATION_LOCK,
        ])
        .catch(() => undefined);
    }
    await client.end();
  }
}

runMigrations().catch((error: unknown) => {
  console.error("Database migration failed.");
  console.error(error);
  process.exitCode = 1;
});
