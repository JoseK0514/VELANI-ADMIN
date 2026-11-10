import {
  bindAuthorization,
  beginAuthorizationRecovery,
  completeAuthorizationRecovery,
} from "../src/server/operations/authorization";
import { z } from "zod";
import { transaction } from "../src/server/db";
import { prepareOwner, reviewIdentity } from "../src/server/auth/operator";
import {
  privateTarget,
  verifyPrivateBindings,
} from "../src/server/operations/target";
import { adminGrants, journalGrants } from "../src/server/principals";
const args = process.argv.slice(2),
  action = args[0],
  environment = args[args.indexOf("--environment") + 1];
if (!args.includes("--environment") || !args.includes("--apply"))
  throw Error("Explicit --environment and --apply required.");
const journal = action === "bind-journal" || action === "grant-journal",
  pool = privateTarget(
    journal
      ? "ADMIN_JOURNAL_OPERATOR_DATABASE_URL"
      : "ADMIN_OPERATOR_DATABASE_URL",
    environment,
  );
const email = () =>
  z.email().max(254).parse(process.env.ADMIN_OWNER_EMAIL).toLowerCase();
const authActions = [
  "bind-authorization",
  "restore-begin",
  "restore-complete",
  "recover-owner",
];
const authJournal = authActions.includes(action)
  ? privateTarget("ADMIN_JOURNAL_OPERATOR_DATABASE_URL", environment)
  : undefined;
function roots() {
  const take = (name: string) => {
    const value = process.env[name] ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(value)) throw Error("invalid_auth_roots");
    return Buffer.from(value, "base64url");
  };
  return {
    sessionKey: take("ADMIN_SESSION_KEY"),
    encryptionKey: take("ADMIN_AUTH_ENCRYPTION_KEY"),
    cursorKey: take("ADMIN_CURSOR_KEY"),
  };
}
try {
  if (authJournal) await verifyPrivateBindings(pool, authJournal, environment);
  let result: unknown;
  if (action === "prepare-owner") result = await prepareOwner(pool, email());
  else if (action === "approve-identity")
    result = await reviewIdentity(
      pool,
      email(),
      z.uuid().parse(process.env.ADMIN_IDENTITY_REQUEST_ID),
    );
  else if (action === "bind-authorization")
    result = await bindAuthorization(pool, authJournal!, roots());
  else if (action === "restore-begin")
    result = await beginAuthorizationRecovery(pool, authJournal!);
  else if (action === "restore-complete")
    result = await completeAuthorizationRecovery(pool, authJournal!, roots());
  else if (action === "recover-owner") {
    await beginAuthorizationRecovery(pool, authJournal!);
    result = await completeAuthorizationRecovery(pool, authJournal!, roots());
  } else if (action === "bind-admin")
    result = await transaction(pool, async (c) => {
      await c.query(
        "INSERT INTO admin.deployment_binding(environment,project_id,branch_id,journal_project_id,journal_branch_id) VALUES($1,$2,$3,$4,$5)",
        [
          environment,
          process.env.ADMIN_DATABASE_PROJECT_ID,
          process.env.ADMIN_DATABASE_BRANCH_ID,
          process.env.ADMIN_JOURNAL_PROJECT_ID,
          process.env.ADMIN_JOURNAL_BRANCH_ID,
        ],
      );
      return { state: "admin_bound" };
    });
  else if (action === "bind-journal") {
    await pool.query(
      "INSERT INTO admin_journal.binding(environment,project_id,branch_id) VALUES($1,$2,$3)",
      [
        environment,
        process.env.ADMIN_JOURNAL_PROJECT_ID,
        process.env.ADMIN_JOURNAL_BRANCH_ID,
      ],
    );
    result = { state: "journal_bound" };
  } else if (action === "grant-admin" || action === "grant-journal") {
    const sql =
      action === "grant-admin"
        ? adminGrants(
            process.env.ADMIN_WEB_ROLE ?? "",
            process.env.ADMIN_MAINTENANCE_ROLE ?? "",
          )
        : journalGrants(
            process.env.ADMIN_JOURNAL_READ_ROLE ?? "",
            process.env.ADMIN_JOURNAL_WRITE_ROLE ?? "",
          );
    await transaction(pool, async (c) => {
      for (const q of sql) await c.query(q);
    });
    result = { state: "grants_applied" };
  } else throw Error("unsupported_private_action");
  console.log(JSON.stringify({ environment, ...(result as object) }));
} catch {
  console.error("private_operator_failed");
  process.exitCode = 1;
} finally {
  await pool.end();
  if (authJournal) await authJournal.end();
}
