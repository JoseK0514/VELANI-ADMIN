import { randomUUID } from "node:crypto";
import { readConfig, type AdminConfig } from "./config";
import { database, migrations } from "./db";
import { AuthService } from "./auth/service";
import { PostgresSources } from "./sources/postgres";
import { createHandler, privateHeaders, type Dependencies } from "./http";
import { AdminError } from "./errors";
let singleton: ReturnType<typeof configured> | undefined;
function configured(config: AdminConfig) {
  const pool = database(config.databaseUrl),
    journal = database(config.journalUrl),
    sources = new PostgresSources(config.sources),
    auth = new AuthService(pool, config);
  return { config, pool, journal, sources, auth };
}
function runtime() {
  const config = readConfig(process.env);
  if (!config) throw new AdminError(503, "admin_not_configured");
  return (singleton ??= configured(config));
}
export async function verifyBinding(d: Dependencies) {
  const versions = (
    await d.pool.query(
      "SELECT version FROM admin.schema_migrations ORDER BY version",
    )
  ).rows.map((r) => r.version);
  if (JSON.stringify(versions) !== JSON.stringify(migrations))
    throw new AdminError(503, "schema_not_qualified");
  if (d.config.environment === "test") return;
  const required = [
    "ADMIN_DATABASE_PROJECT_ID",
    "ADMIN_DATABASE_BRANCH_ID",
    "ADMIN_JOURNAL_PROJECT_ID",
    "ADMIN_JOURNAL_BRANCH_ID",
  ];
  if (
    required.some((k) => !process.env[k]) ||
    process.env[required[0]] === process.env[required[2]]
  )
    throw new AdminError(503, "deployment_binding_missing");
  const [a, j, role, jrole] = await Promise.all([
    d.pool.query("SELECT * FROM admin.deployment_binding"),
    d.journal.query("SELECT * FROM admin_journal.binding"),
    d.pool.query(
      "SELECT current_user AS role,rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) OR has_schema_privilege(current_user,'admin','CREATE') OR has_table_privilege(current_user,'admin.audit','UPDATE,DELETE,TRUNCATE') OR has_table_privilege(current_user,'admin.actors','INSERT,UPDATE,DELETE') AS excessive FROM pg_roles r WHERE rolname=current_user",
    ),
    d.journal.query(
      "SELECT current_user AS role,rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls OR rolreplication OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) OR has_schema_privilege(current_user,'admin_journal','CREATE') OR has_table_privilege(current_user,'admin_journal.deletions','INSERT,UPDATE,DELETE,TRUNCATE') AS excessive FROM pg_roles r WHERE rolname=current_user",
    ),
  ]);
  const binding = a.rows[0],
    jb = j.rows[0];
  if (
    role.rows[0]?.excessive ||
    jrole.rows[0]?.excessive ||
    a.rowCount !== 1 ||
    j.rowCount !== 1 ||
    binding.environment !== d.config.environment ||
    jb.environment !== d.config.environment ||
    binding.project_id !== process.env.ADMIN_DATABASE_PROJECT_ID ||
    binding.branch_id !== process.env.ADMIN_DATABASE_BRANCH_ID ||
    binding.journal_project_id !== process.env.ADMIN_JOURNAL_PROJECT_ID ||
    binding.journal_branch_id !== process.env.ADMIN_JOURNAL_BRANCH_ID ||
    jb.project_id !== binding.journal_project_id ||
    jb.branch_id !== binding.journal_branch_id ||
    role.rows[0].role !==
      decodeURIComponent(new URL(d.config.databaseUrl).username) ||
    jrole.rows[0].role !==
      decodeURIComponent(new URL(d.config.journalUrl).username)
  )
    throw new AdminError(503, "deployment_binding_mismatch");
}
export async function handleRequest(request: Request) {
  const requestId = randomUUID();
  const failure = (code: string) =>
    Response.json(
      { schemaVersion: 1, error: { code }, requestId },
      {
        status: 503,
        headers: { ...privateHeaders, "x-request-id": requestId },
      },
    );
  let timer: ReturnType<typeof setTimeout>;
  const work = async () => {
    try {
      const d = runtime();
      await verifyBinding(d);
      return await createHandler(d)(request);
    } catch (e) {
      return failure(e instanceof AdminError ? e.code : "service_unavailable");
    }
  };
  try {
    return await Promise.race([
      work(),
      new Promise<Response>((resolve) => {
        timer = setTimeout(() => resolve(failure("request_timeout")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function ready() {
  try {
    const d = runtime();
    await verifyBinding(d);
    return Response.json(
      { service: "velani-admin", state: "configured", schemaVersion: 1 },
      { headers: privateHeaders },
    );
  } catch {
    return Response.json(
      { service: "velani-admin", state: "unavailable" },
      { status: 503, headers: privateHeaders },
    );
  }
}
