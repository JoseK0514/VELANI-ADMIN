import { assertDeadline } from "./deadline";
import { Pool, type PoolClient } from "pg";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
export const migrations = [
  "0001_admin.sql",
  "0002_identity_review.sql",
  "0003_stable_creation_time.sql",
  "0004_deployment_binding.sql",
  "0005_authorization_epoch.sql",
] as const;
export function database(url: string, max = 3) {
  const pool = new Pool({
    connectionString: url,
    max,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 3000,
    query_timeout: 4000,
  });
  pool.on("error", () => {});
  return pool;
}
export async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const c = await pool.connect();
  try {
    assertDeadline();
    await c.query("BEGIN");
    const result = await work(c);
    assertDeadline();
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
export const journalMigrations = [
  "0001_journal.sql",
  "0002_authorization_epoch.sql",
] as const;
/** Explicit operator actions only. Build/start and handlers never migrate. */
export function migrate(pool: Pool) {
  return applyMigrations(pool, "admin", migrations, "migrations");
}
export function migrateJournal(pool: Pool) {
  return applyMigrations(pool, "admin_journal", journalMigrations, "journal");
}
async function applyMigrations(
  pool: Pool,
  schema: "admin" | "admin_journal",
  files: readonly string[],
  directory: string,
) {
  const c = await pool.connect();
  let unlocked = false;
  try {
    await c.query("SELECT pg_advisory_lock(hashtext($1))", [
      schema + "-migrations",
    ]);
    for (const file of files) {
      const sql = await readFile(
          new URL("../../db/" + directory + "/" + file, import.meta.url),
          "utf8",
        ),
        checksum = createHash("sha256").update(sql).digest("hex"),
        exists = (
          await c.query("SELECT to_regclass($1) AS t", [
            schema + ".schema_migrations",
          ])
        ).rows[0].t;
      if (exists) {
        const old = (
          await c.query(
            `SELECT checksum FROM ${schema}.schema_migrations WHERE version=$1`,
            [file],
          )
        ).rows[0];
        if (old) {
          if (old.checksum !== checksum)
            throw Error("migration_checksum_mismatch");
          continue;
        }
      }
      await c.query("BEGIN");
      try {
        await c.query(sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""));
        if (schema === "admin_journal" && file === "0001_journal.sql")
          await c.query(
            "CREATE TABLE admin_journal.schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT statement_timestamp()); REVOKE ALL ON admin_journal.schema_migrations FROM PUBLIC",
          );
        await c.query(
          `INSERT INTO ${schema}.schema_migrations(version,checksum) VALUES($1,$2)`,
          [file, checksum],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    try {
      await c.query("SELECT pg_advisory_unlock(hashtext($1))", [
        schema + "-migrations",
      ]);
      unlocked = true;
    } finally {
      c.release(!unlocked);
    }
  }
}
