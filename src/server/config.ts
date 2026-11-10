export type Environment = "test" | "staging" | "production";
export type SourceName = "control" | "catalog" | "velani";
export type SourceConfig = {
  url: string;
  projectId: string;
  branchId: string;
  database: string;
  role: string;
  environment: Environment;
};
export type AdminConfig = {
  environment: Environment;
  origin: string;
  ownerEmail: string;
  databaseUrl: string;
  journalUrl: string;
  sessionKey: Buffer;
  encryptionKey: Buffer;
  cursorKey: Buffer;
  oidcClientId: string;
  oidcClientSecret: string;
  writesEnabled: boolean;
  sources: Partial<Record<SourceName, SourceConfig>>;
};
const loopback = (h: string) => ["127.0.0.1", "localhost", "[::1]"].includes(h);
function dsn(
  raw: string | undefined,
  mode: Environment,
  prefix: string,
): URL | null {
  try {
    const u = new URL(raw ?? "");
    if (
      !["postgres:", "postgresql:"].includes(u.protocol) ||
      !u.username ||
      !u.pathname.slice(1) ||
      u.hash
    )
      return null;
    if (mode === "test") {
      if (!loopback(u.hostname)) return null;
    } else if (
      loopback(u.hostname) ||
      !u.hostname.endsWith(".neon.tech") ||
      !u.username.startsWith(prefix) ||
      !["require", "verify-full", "verify-ca"].includes(
        u.searchParams.get("sslmode") ?? "",
      )
    )
      return null;
    return u;
  } catch {
    return null;
  }
}
export function readConfig(
  env: Readonly<Record<string, string | undefined>>,
): AdminConfig | null {
  if (
    env.ADMIN_ENABLED !== "true" ||
    !["test", "staging", "production"].includes(env.ADMIN_ENVIRONMENT ?? "")
  )
    return null;
  const environment = env.ADMIN_ENVIRONMENT as Environment;
  try {
    const origin = new URL(env.ADMIN_ORIGIN ?? "");
    if (
      origin.href !== origin.origin + "/" ||
      origin.username ||
      origin.password ||
      origin.hash ||
      origin.search
    )
      return null;
    if (
      environment === "test"
        ? !(origin.protocol === "http:" && loopback(origin.hostname))
        : origin.protocol !== "https:" || loopback(origin.hostname)
    )
      return null;
    const app = dsn(env.ADMIN_DATABASE_URL, environment, "velani_admin_web"),
      journal = dsn(
        env.ADMIN_JOURNAL_DATABASE_URL,
        environment,
        "velani_admin_journal_read",
      );
    if (!app || !journal || app.href === journal.href) return null;
    const keys = [
      env.ADMIN_SESSION_KEY,
      env.ADMIN_AUTH_ENCRYPTION_KEY,
      env.ADMIN_CURSOR_KEY,
    ];
    if (
      keys.some(
        (k) =>
          !k ||
          !/^[A-Za-z0-9_-]{43}$/.test(k) ||
          Buffer.from(k, "base64url").length !== 32,
      ) ||
      new Set(keys).size !== 3
    )
      return null;
    const ownerEmail = (env.ADMIN_OWNER_EMAIL ?? "").trim().toLowerCase();
    if (
      ownerEmail.length > 254 ||
      !/^\S+@[^@\s]+\.[^@\s]+$/.test(ownerEmail) ||
      !env.ADMIN_OIDC_CLIENT_ID ||
      !env.ADMIN_OIDC_CLIENT_SECRET
    )
      return null;
    const sources: AdminConfig["sources"] = {};
    for (const name of ["control", "catalog", "velani"] as const) {
      const prefix = "ADMIN_SOURCE_" + name.toUpperCase(),
        raw = env[prefix + "_DATABASE_URL"];
      if (!raw) continue;
      const u = dsn(raw, environment, "velani_admin_" + name + "_reader");
      const projectId = env[prefix + "_PROJECT_ID"],
        branchId = env[prefix + "_BRANCH_ID"];
      if (!u || !projectId || !branchId) return null;
      sources[name] = {
        url: u.href,
        projectId,
        branchId,
        database: decodeURIComponent(u.pathname.slice(1)),
        role: decodeURIComponent(u.username),
        environment,
      };
    }
    return {
      environment,
      origin: origin.origin,
      ownerEmail,
      databaseUrl: app.href,
      journalUrl: journal.href,
      sessionKey: Buffer.from(keys[0]!, "base64url"),
      encryptionKey: Buffer.from(keys[1]!, "base64url"),
      cursorKey: Buffer.from(keys[2]!, "base64url"),
      oidcClientId: env.ADMIN_OIDC_CLIENT_ID,
      oidcClientSecret: env.ADMIN_OIDC_CLIENT_SECRET,
      writesEnabled: env.ADMIN_WRITES_ENABLED === "true",
      sources,
    };
  } catch {
    return null;
  }
}
