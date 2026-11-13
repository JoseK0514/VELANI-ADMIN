import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
export async function testDatabase(migrated = true) {
  const uri = process.env.ADMIN_TEST_DATABASE_URL;
  if (!uri) throw Error("Use npm test to start an owned cluster.");
  const u = new URL(uri);
  if (u.hostname !== "127.0.0.1" || u.username !== "velani_admin_test")
    throw Error("Owned database identity required.");
  const name = "admin_test_" + randomBytes(8).toString("hex"),
    root = new Pool({ connectionString: uri });
  await root.query("CREATE DATABASE " + name);
  u.pathname = "/" + name;
  const pool = new Pool({ connectionString: u.href, max: 8 });
  if (migrated)
    for (const file of (await readdir("db/migrations").catch(() => []))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pool.query(await readFile("db/migrations/" + file, "utf8"));
  return {
    pool,
    url: u.href,
    close: async () => {
      await pool.end();
      try {
        // pg Pool.end() can resolve before each TCP connection has finished
        // closing. FORCE races those clients and emits uncaught 57P01 errors.
        // Wait for actual connection drain and refuse leaked fixture clients.
        const deadline = performance.now() + 2000;
        while (true) {
          const active = await root.query(
            "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE datname=$1",
            [name],
          );
          if (active.rows[0].count === 0) break;
          if (performance.now() >= deadline) throw Error("Owned fixture connections did not drain.");
          await delay(10);
        }
        await root.query("DROP DATABASE " + name);
      } finally {
        await root.end();
      }
    },
  };
}
