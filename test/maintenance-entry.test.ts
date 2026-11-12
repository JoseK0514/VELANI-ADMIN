import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ target: vi.fn(), bindings: vi.fn(), purge: vi.fn() }));
vi.mock("../src/server/operations/target", () => ({ privateTarget: mocks.target, verifyPrivateBindings: mocks.bindings }));
vi.mock("../src/server/retention", () => ({ Retention: class { purge = mocks.purge; } }));
const delivery = (name = "velani-admin-staging-retention") => new Request("https://worker.neon.tech/maintenance", { method: "POST", headers: { "x-neon-trigger-invocation-id": "local-tick", "content-type": "application/json" }, body: JSON.stringify({ version: 1, invocation_id: "local-tick", trigger: { type: "schedule", id: "local-trigger", name }, data: { scheduled_at: "2026-11-12T12:00:00Z" } }) });
async function worker(over: Record<string, string> = {}) {
  vi.resetModules();
  const limited = "postgresql://velani_admin_maintenance:fictional@ep-staging.neon.tech/velani_admin?sslmode=require";
  for (const [key, value] of Object.entries({ ADMIN_ENVIRONMENT: "staging", NEON_BRANCH_ID: "br-staging", ADMIN_DATABASE_BRANCH_ID: "br-staging", ADMIN_MAINTENANCE_DATABASE_URL: limited, DATABASE_URL: limited, DATABASE_URL_UNPOOLED: limited, ...over })) vi.stubEnv(key, value);
  return (await import("../src/worker/entry")).default;
}
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("refuses inherited branch credentials and unoverridden owner URLs before connecting", async () => {
  const invalid: Array<Record<string, string>> = [{ NEON_BRANCH_ID: "br-clone" }, { DATABASE_URL: "postgresql://owner:fictional@ep-staging.neon.tech/db" }, { DATABASE_URL_UNPOOLED: "postgresql://owner:fictional@ep-staging.neon.tech/db" }, { ADMIN_ENVIRONMENT: "test" }];
  for (const over of invalid) {
    expect((await (await worker(over)).fetch(delivery(`velani-admin-${over.ADMIN_ENVIRONMENT ?? "staging"}-retention`))).status).toBe(503);
  }
  expect(mocks.target).not.toHaveBeenCalled();
  expect(mocks.purge).not.toHaveBeenCalled();
});

it("pins both private targets before purging and closes both pools on success or failure", async () => {
  const a = { end: vi.fn() }, j = { end: vi.fn() };
  mocks.target.mockReturnValueOnce(a).mockReturnValueOnce(j);
  mocks.bindings.mockResolvedValue(undefined);
  mocks.purge.mockResolvedValue({ clients: 0, cases: 0, morePossible: false });
  const handler = await worker();
  expect((await handler.fetch(delivery())).status).toBe(200);
  expect(mocks.bindings).toHaveBeenCalledWith(a, j, "staging");
  expect(a.end).toHaveBeenCalledOnce(); expect(j.end).toHaveBeenCalledOnce();
  mocks.target.mockReturnValueOnce(a).mockReturnValueOnce(j);
  mocks.bindings.mockRejectedValueOnce(Error("mismatch"));
  expect((await handler.fetch(delivery())).status).toBe(503);
  expect(mocks.purge).toHaveBeenCalledOnce();
  expect(a.end).toHaveBeenCalledTimes(2); expect(j.end).toHaveBeenCalledTimes(2);
});
