import { it, expect } from "vitest";
import { readConfig } from "../src/server/config";
const key = (n: number) => Buffer.alloc(32, n).toString("base64url");
const env = {
  ADMIN_ENABLED: "true",
  ADMIN_ENVIRONMENT: "test",
  ADMIN_ORIGIN: "http://127.0.0.1:3999",
  ADMIN_DATABASE_URL: "postgresql://velani_admin_web@127.0.0.1:5555/admin_test",
  ADMIN_JOURNAL_DATABASE_URL:
    "postgresql://velani_admin_journal_read@127.0.0.1:5555/journal_test",
  ADMIN_OWNER_EMAIL: "owner@example.invalid",
  ADMIN_SESSION_KEY: key(1),
  ADMIN_AUTH_ENCRYPTION_KEY: key(2),
  ADMIN_CURSOR_KEY: key(3),
  ADMIN_OIDC_CLIENT_ID: "fixture-client",
  ADMIN_OIDC_CLIENT_SECRET: "fixture-only-client-secret",
};
it("enables a complete isolated test configuration and binds the exact origin and identity", () => {
  expect(readConfig(env)).toMatchObject({
    environment: "test",
    origin: "http://127.0.0.1:3999",
    ownerEmail: "owner@example.invalid",
  });
});
it("fails closed on missing configuration, unsafe origin, reused roots and external test databases", () => {
  for (const patch of [
    { ADMIN_ENABLED: "false" },
    { ADMIN_SESSION_KEY: "" },
    { ADMIN_ORIGIN: "https://evil.example/admin" },
    { ADMIN_AUTH_ENCRYPTION_KEY: key(1) },
    { ADMIN_DATABASE_URL: "postgresql://owner@production.neon.tech/admin" },
  ])
    expect(readConfig({ ...env, ...patch })).toBeNull();
});
it("requires HTTPS and restricted runtime roles in non-test environments", () => {
  expect(readConfig({ ...env, ADMIN_ENVIRONMENT: "production" })).toBeNull();
});
