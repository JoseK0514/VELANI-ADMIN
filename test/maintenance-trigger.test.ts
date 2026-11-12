import { afterEach, expect, it, vi } from "vitest";
import { maintenanceHandler } from "../src/worker/maintenance";

const request = (over: { method?: string; path?: string; header?: string; type?: string; name?: string; id?: string } = {}) =>
  new Request("https://function.neon.tech" + (over.path ?? "/maintenance"), {
    method: over.method ?? "POST",
    headers: { "content-type": "application/json", ...(over.header === "" ? {} : { "x-neon-trigger-invocation-id": over.header ?? "tick-1" }) },
    ...((over.method ?? "POST") === "GET" ? {} : { body: JSON.stringify({ version: 1, invocation_id: over.id ?? "tick-1", trigger: { type: over.type ?? "schedule", id: "trigger-1", name: over.name ?? "velani-admin-staging-retention" }, data: { scheduled_at: "2026-11-12T12:00:00Z" } }) }),
  });
afterEach(() => { vi.useRealTimers(); });

it("rejects anonymous, mismatched and unexpected deliveries before opening a database", async () => {
  const run = vi.fn();
  const handle = maintenanceHandler(run, "velani-admin-staging-retention");
  for (const [input, status] of [
    [{ header: "" }, 401], [{ header: "other" }, 401], [{ name: "other-job" }, 403],
    [{ method: "GET" }, 405], [{ path: "/" }, 404], [{ type: "storage_object_created" }, 400],
  ] as const) expect((await handle(request(input))).status).toBe(status);
  expect(run).not.toHaveBeenCalled();
});

it("drains bounded batches and returns only a count receipt; repeated ticks remain safe", async () => {
  const run = vi.fn().mockResolvedValueOnce({ clients: 100, cases: 0, morePossible: true }).mockResolvedValue({ clients: 0, cases: 1, morePossible: false });
  const handle = maintenanceHandler(run, "velani-admin-staging-retention");
  const response = await handle(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ state: "maintenance_complete", invocationId: "tick-1", batches: 2, clients: 100, cases: 1 });
  expect(run).toHaveBeenCalledTimes(2);
  expect((await handle(request())).status).toBe(200);
});

it("returns retryable failure without database errors or secrets, including a saturated drain", async () => {
  const failed = maintenanceHandler(async () => { throw Error("postgresql://private-secret"); }, "velani-admin-staging-retention");
  const response = await failed(request());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('{"state":"maintenance_unavailable"}');
  expect(response.headers.get("Retry-After")).toBe("60");
  const saturated = vi.fn().mockResolvedValue({ clients: 100, cases: 0, morePossible: true });
  expect((await maintenanceHandler(saturated, "velani-admin-staging-retention")(request())).status).toBe(503);
  expect(saturated).toHaveBeenCalledTimes(10);
});

it("stops draining when the shared deadline expires, leaving provider retry to resume safely", async () => {
  vi.useFakeTimers();
  const run = vi.fn(async () => {
    vi.setSystemTime(Date.now() + 60_001);
    return { clients: 1, cases: 0, morePossible: true };
  });
  expect((await maintenanceHandler(run, "velani-admin-staging-retention")(request())).status).toBe(503);
  expect(run).toHaveBeenCalledOnce();
});
