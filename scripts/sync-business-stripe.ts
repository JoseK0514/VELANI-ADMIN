import { readFile, stat } from "node:fs/promises";
import {
  privateTarget,
  verifyPrivateBindings,
} from "../src/server/operations/target";
import { Retention } from "../src/server/retention";
import { publishFeed } from "../src/server/business/publish";
import { collectStripeFeed } from "../src/server/business/stripe-read";
const args = process.argv.slice(2),
  flag = (name: string) => args[args.indexOf(name) + 1];
if (
  !args.includes("--environment") ||
  !args.includes("--mapping") ||
  !args.includes("--apply")
)
  throw Error(
    "Use --environment test|staging|production --mapping <owner-only-customer-map> --apply",
  );
const environment = flag("--environment");
if (!["test", "staging", "production"].includes(environment))
  throw Error("invalid_environment");
const path = flag("--mapping"),
  info = await stat(path);
if (
  (info.mode & 0o077) !== 0 ||
  (process.getuid && info.uid !== process.getuid()) ||
  !info.isFile() ||
  info.size > 256 * 1024
)
  throw Error("owner_only_mapping_required");
const pool = privateTarget("ADMIN_OPERATOR_DATABASE_URL", environment),
  journal = privateTarget("ADMIN_JOURNAL_OPERATOR_DATABASE_URL", environment);
try {
  await verifyPrivateBindings(pool, journal, environment);
  const input = await collectStripeFeed({
    key: process.env.ADMIN_REPORTING_STRIPE_KEY ?? "",
    accountId: process.env.ADMIN_REPORTING_FINANCE_ACCOUNT_ID ?? "",
    environment: environment as "test" | "staging" | "production",
    liveReadApproved:
      process.env.ADMIN_REPORTING_LIVE_READS_APPROVED === "true",
    mapping: JSON.parse(await readFile(path, "utf8")),
  });
  const result = await publishFeed(
    pool,
    {
      environment: environment as "test" | "staging" | "production",
      financeAccountId: process.env.ADMIN_REPORTING_FINANCE_ACCOUNT_ID ?? "",
      healthAccountId: process.env.ADMIN_REPORTING_HEALTH_ACCOUNT_ID ?? "",
    },
    input,
    "provider_verified",
    new Retention(pool, journal).guard,
  );
  console.log(
    JSON.stringify({
      state: "published",
      ...result,
      coverage: input.coverage,
      provenance: "provider_verified",
    }),
  );
} catch {
  console.error("business_stripe_sync_failed");
  process.exitCode = 1;
} finally {
  await pool.end();
  await journal.end();
}
