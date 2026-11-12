import { privateTarget, verifyPrivateBindings } from "../server/operations/target";
import { Retention } from "../server/retention";
import { maintenanceHandler } from "./maintenance";
import { maintenanceHeartbeat } from "./heartbeat";

const environment = process.env.ADMIN_ENVIRONMENT;
const run = async () => {
  if (
    !["staging", "production"].includes(environment ?? "") ||
    process.env.NEON_BRANCH_ID !== process.env.ADMIN_DATABASE_BRANCH_ID ||
    !process.env.ADMIN_MAINTENANCE_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.ADMIN_MAINTENANCE_DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED !== process.env.ADMIN_MAINTENANCE_DATABASE_URL
  ) throw Error("private_worker_binding_required");
  // Both injected Postgres URLs must be overridden with this restricted worker
  // role in the provider store. No schema-owner credential enters the process.
  const admin = privateTarget("ADMIN_MAINTENANCE_DATABASE_URL", environment!);
  const journal = privateTarget("ADMIN_JOURNAL_WRITE_DATABASE_URL", environment!);
  try {
    await verifyPrivateBindings(admin, journal, environment!);
    return await new Retention(admin, journal).purge();
  } finally {
    await Promise.all([admin.end(), journal.end()]);
  }
};

export default { fetch: maintenanceHandler(run, `velani-admin-${environment}-retention`, maintenanceHeartbeat(process.env.ADMIN_MAINTENANCE_HEARTBEAT_URL)) };
