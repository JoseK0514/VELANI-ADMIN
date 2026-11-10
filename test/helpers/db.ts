import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
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
      await root.query("DROP DATABASE " + name + " WITH (FORCE)");
      await root.end();
    },
  };
}
