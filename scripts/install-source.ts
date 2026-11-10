import { readFile } from "node:fs/promises";
import { database, transaction } from "../src/server/db";
const args = process.argv.slice(2),
  get = (key: string) => args[args.indexOf(key) + 1],
  name = get("--source"),
  environment = get("--environment");
if (
  !args.includes("--apply") ||
  !args.includes("--source") ||
  !args.includes("--environment") ||
  !["control", "catalog", "velani"].includes(name) ||
  !["test", "staging", "production"].includes(environment) ||
  process.env.ADMIN_OPERATOR_CONFIRM !== "reviewed-private-action"
)
  throw Error("Explicit reviewed source/environment/apply required.");
const prefix = "ADMIN_SOURCE_" + name.toUpperCase(),
  url = new URL(process.env.ADMIN_SOURCE_OPERATOR_DATABASE_URL ?? ""),
  role = process.env[prefix + "_ROLE"] ?? "",
  project = process.env[prefix + "_PROJECT_ID"],
  branch = process.env[prefix + "_BRANCH_ID"];
if (
  !new RegExp("^velani_admin_" + name + "_reader(?:_[a-f0-9]{8,32})?$").test(
    role,
  ) ||
  !project ||
  !branch ||
  !process.env[prefix + "_EXPECTED_HOST"] ||
  url.hostname !== process.env[prefix + "_EXPECTED_HOST"] ||
  url.pathname.slice(1) !== process.env[prefix + "_DATABASE_NAME"]
)
  throw Error("Pinned source identity required.");
if (
  environment === "test"
    ? !["127.0.0.1", "localhost"].includes(url.hostname)
    : !url.hostname.endsWith(".neon.tech") ||
      !["require", "verify-ca", "verify-full"].includes(
        url.searchParams.get("sslmode") ?? "",
      )
)
  throw Error("Invalid source endpoint.");
const pool = database(url.href, 1);
try {
  await transaction(pool, async (c) => {
    const r = (
      await c.query(
        "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=$1",
        [role],
      )
    ).rows[0];
    if (!r || r.rolsuper || r.rolcreatedb || r.rolcreaterole || r.rolbypassrls)
      throw Error("Source reader must exist and be restricted.");
    const exists = (
      await c.query(
        "SELECT to_regclass('velani_admin_projection.binding') AS t",
      )
    ).rows[0].t;
    if (exists)
      throw Error(
        "Projection already exists; review version/ownership instead of overwriting.",
      );
    const sql = await readFile("db/source-views/" + name + ".sql", "utf8");
    await c.query(sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""));
    await c.query(
      "INSERT INTO velani_admin_projection.binding(system,environment,project_id,branch_id,version) VALUES($1,$2,$3,$4,1)",
      [name, environment, project, branch],
    );
    await c.query("GRANT USAGE ON SCHEMA velani_admin_projection TO " + role);
    await c.query(
      "GRANT SELECT ON ALL TABLES IN SCHEMA velani_admin_projection TO " + role,
    );
  });
  console.log(
    JSON.stringify({
      state: "source_projection_installed",
      source: name,
      environment,
      project,
      branch,
    }),
  );
} catch {
  console.error("source_projection_install_failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
