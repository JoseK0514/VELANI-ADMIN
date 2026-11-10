import { z } from "zod";
import { transaction } from "../src/server/db";
import {
  prepareOwner,
  reviewIdentity,
  recoverOwner,
} from "../src/server/auth/operator";
import { privateTarget } from "../src/server/operations/target";
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
try {
  let result: unknown;
  if (action === "prepare-owner") result = await prepareOwner(pool, email());
  else if (action === "approve-identity")
    result = await reviewIdentity(
      pool,
      email(),
      z.uuid().parse(process.env.ADMIN_IDENTITY_REQUEST_ID),
    );
  else if (action === "recover-owner")
    result = await recoverOwner(pool, email());
  else if (action === "bind-admin")
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
}
