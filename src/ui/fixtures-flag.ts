/**
 * Development fixtures guard.
 *
 * Fixtures are the recorded responses in docs/evidence/qualification-sample.json.
 * They can only be turned on when BOTH are true:
 *   - the bundle is a development bundle (NODE_ENV is "development"), and
 *   - NEXT_PUBLIC_ADMIN_DEV_FIXTURES is exactly "1".
 * A production build inlines NODE_ENV as "production", so the guard is false
 * there whatever the flag says, and the fixture module is not bundled
 * (see test/ui-fixtures-guard.test.ts). The page must also be on a loopback host.
 */
export type FixtureEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_ADMIN_DEV_FIXTURES?: string;
};

export function fixturesAllowed(env: FixtureEnv, hostname?: string): boolean {
  if (env.NODE_ENV !== "development") return false;
  if (env.NEXT_PUBLIC_ADMIN_DEV_FIXTURES !== "1") return false;
  if (hostname === undefined) return true;
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}
