import { migrate, migrateJournal } from "../src/server/db";
import { privateTarget } from "../src/server/operations/target";
const args = process.argv.slice(2),
  environment = args[args.indexOf("--environment") + 1];
if (!args.includes("--apply") || !args.includes("--environment"))
  throw Error(
    "Use --environment test|staging|production --apply; explicit operator credentials required.",
  );
const journal = args.includes("--journal"),
  pool = privateTarget(
    journal
      ? "ADMIN_JOURNAL_OPERATOR_DATABASE_URL"
      : "ADMIN_OPERATOR_DATABASE_URL",
    environment,
  );
try {
  if (journal) await migrateJournal(pool);
  else await migrate(pool);
  console.log(
    JSON.stringify({
      state: "schema_applied",
      environment,
      target: journal ? "journal" : "admin",
    }),
  );
} catch {
  console.error("migration_failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
