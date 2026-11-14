import { readFile, stat } from "node:fs/promises";
import {
  privateTarget,
  verifyPrivateBindings,
} from "../src/server/operations/target";
import { publishFeed } from "../src/server/business/publish";
import { Retention } from "../src/server/retention";
const args = process.argv.slice(2);
const flag = (name: string) => args[args.indexOf(name) + 1];
if (
  !args.includes("--environment") ||
  !args.includes("--input") ||
  !args.includes("--apply")
)
  throw Error(
    "Use --environment test|staging|production --input <owner-only-file> --apply",
  );
const environment = flag("--environment");
if (!["test", "staging", "production"].includes(environment))
  throw Error("invalid_environment");
const path = flag("--input"),
  info = await stat(path);
if (
  (info.mode & 0o077) !== 0 ||
  (process.getuid && info.uid !== process.getuid()) ||
  !info.isFile() ||
  info.size > 2 * 1024 * 1024
)
  throw Error("owner_only_bounded_input_required");
const pool = privateTarget("ADMIN_OPERATOR_DATABASE_URL", environment),
  journal = privateTarget("ADMIN_JOURNAL_OPERATOR_DATABASE_URL", environment);
try {
  await verifyPrivateBindings(pool, journal, environment);
  const input: unknown = JSON.parse(await readFile(path, "utf8"));
  const result = await publishFeed(
    pool,
    {
      environment: environment as "test" | "staging" | "production",
      financeAccountId: process.env.ADMIN_REPORTING_FINANCE_ACCOUNT_ID ?? "",
      healthAccountId: process.env.ADMIN_REPORTING_HEALTH_ACCOUNT_ID ?? "",
    },
    input,
    "operator_recorded",
    new Retention(pool, journal).guard,
  );
  console.log(
    JSON.stringify({
      state: "published",
      environment,
      ...result,
      provenance: "operator_recorded",
    }),
  );
} catch {
  console.error("business_feed_publication_failed");
  process.exitCode = 1;
} finally {
  await pool.end();
  await journal.end();
}
