import { readConfig } from "../../src/server/config";
export function fixtureConfig(url: string) {
  const c = readConfig({
    ADMIN_ENABLED: "true",
    ADMIN_ENVIRONMENT: "test",
    ADMIN_ORIGIN: "http://127.0.0.1:3999",
    ADMIN_DATABASE_URL: url,
    ADMIN_JOURNAL_DATABASE_URL: url.replace(
      /\/[a-z0-9_]+$/,
      "/journal_fixture",
    ),
    ADMIN_OWNER_EMAIL: "owner@example.invalid",
    ADMIN_SESSION_KEY: Buffer.alloc(32, 1).toString("base64url"),
    ADMIN_AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64url"),
    ADMIN_CURSOR_KEY: Buffer.alloc(32, 3).toString("base64url"),
    ADMIN_OIDC_CLIENT_ID: "fixture-client",
    ADMIN_OIDC_CLIENT_SECRET: "fixture-client-secret",
    ADMIN_WRITES_ENABLED: "true",
  });
  if (!c) throw Error("Invalid owned configuration");
  return c;
}
