import { privateTarget } from "../src/server/operations/target";
import { Retention } from "../src/server/retention";
const args = process.argv.slice(2),
  environment = args[args.indexOf("--environment") + 1];
if (!args.includes("--environment") || !args.includes("--apply"))
  throw Error("Explicit private target and --apply required.");
const admin = privateTarget("ADMIN_MAINTENANCE_DATABASE_URL", environment),
  journal = privateTarget("ADMIN_JOURNAL_WRITE_DATABASE_URL", environment);
try {
  const a = (await admin.query("SELECT * FROM admin.deployment_binding")).rows,
    j = (await journal.query("SELECT * FROM admin_journal.binding")).rows;
  if (
    a.length !== 1 ||
    j.length !== 1 ||
    a[0].environment !== environment ||
    j[0].environment !== environment ||
    a[0].project_id !== process.env.ADMIN_DATABASE_PROJECT_ID ||
    a[0].branch_id !== process.env.ADMIN_DATABASE_BRANCH_ID ||
    a[0].journal_project_id !== process.env.ADMIN_JOURNAL_PROJECT_ID ||
    a[0].journal_branch_id !== process.env.ADMIN_JOURNAL_BRANCH_ID ||
    j[0].project_id !== a[0].journal_project_id ||
    j[0].branch_id !== a[0].journal_branch_id
  )
    throw Error("private_target_binding_mismatch");
  const retention = new Retention(admin, journal),
    result = args.includes("--reconcile-only")
      ? await retention.reconcile()
      : await retention.purge();
  console.log(
    JSON.stringify({ state: "maintenance_complete", environment, ...result }),
  );
} catch {
  console.error("private_maintenance_failed");
  process.exitCode = 1;
} finally {
  await Promise.all([admin.end(), journal.end()]);
}
