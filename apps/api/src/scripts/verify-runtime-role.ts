import { createPostgresTenantConnectionPool } from "../../identity/postgres-tenant-connection.pool.js";

async function verifyRuntimeRole(): Promise<void> {
  const connectionString = process.env["RUNTIME_DATABASE_URL"];
  if (!connectionString) {
    throw new Error(
      "RUNTIME_DATABASE_URL is required for the runtime-role startup check.",
    );
  }

  const pool = createPostgresTenantConnectionPool(connectionString);
  try {
    await pool.onModuleInit();
    console.log("PostgreSQL runtime-role startup guard passed.");
  } finally {
    await pool.onModuleDestroy();
  }
}

verifyRuntimeRole().catch((error: unknown) => {
  console.error("PostgreSQL runtime-role startup guard failed.");
  console.error(error);
  process.exitCode = 1;
});
