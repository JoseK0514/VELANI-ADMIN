import { database } from "../db";
/** Private process only. No HTTP import; credentials never enter web config. */
export function privateTarget(
  name:
    | "ADMIN_OPERATOR_DATABASE_URL"
    | "ADMIN_MAINTENANCE_DATABASE_URL"
    | "ADMIN_JOURNAL_OPERATOR_DATABASE_URL"
    | "ADMIN_JOURNAL_WRITE_DATABASE_URL",
  environment: string,
) {
  if (
    !["test", "staging", "production"].includes(environment) ||
    process.env.ADMIN_OPERATOR_CONFIRM !== "reviewed-private-action"
  )
    throw Error("explicit_private_target_required");
  const u = new URL(process.env[name] ?? "");
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !u.pathname.slice(1)
  )
    throw Error("invalid_private_target");
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (
    environment === "test"
      ? !loopback
      : loopback ||
        !u.hostname.endsWith(".neon.tech") ||
        !["require", "verify-full", "verify-ca"].includes(
          u.searchParams.get("sslmode") ?? "",
        )
  )
    throw Error("invalid_private_target");
  if (
    !process.env.ADMIN_DATABASE_PROJECT_ID ||
    !process.env.ADMIN_DATABASE_BRANCH_ID ||
    !process.env.ADMIN_JOURNAL_PROJECT_ID ||
    !process.env.ADMIN_JOURNAL_BRANCH_ID ||
    process.env.ADMIN_DATABASE_PROJECT_ID ===
      process.env.ADMIN_JOURNAL_PROJECT_ID
  )
    throw Error("explicit_project_binding_required");
  if (
    name === "ADMIN_MAINTENANCE_DATABASE_URL" &&
    !/^velani_admin_maintenance(?:_[a-f0-9]{8,32})?$/.test(
      decodeURIComponent(u.username),
    )
  )
    throw Error("invalid_maintenance_role");
  if (
    name === "ADMIN_JOURNAL_WRITE_DATABASE_URL" &&
    !/^velani_admin_journal_write(?:_[a-f0-9]{8,32})?$/.test(
      decodeURIComponent(u.username),
    )
  )
    throw Error("invalid_journal_role");
  return database(u.href, 1);
}
