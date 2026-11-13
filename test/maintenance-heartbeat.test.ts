import { afterEach, expect, it, vi } from "vitest";
import { maintenanceHeartbeat } from "../src/worker/heartbeat";

const ping = "https://hc-ping.com/00000000-0000-4000-8000-000000000901";
const approval = () => ({ validFrom: new Date(Date.now() - 1000).toISOString(),
  validUntil: new Date(Date.now() + 3600000).toISOString(),
  approvalId: "00000000-0000-4000-8000-000000000001" });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("does no network work without an explicitly configured heartbeat", () => {
  expect(maintenanceHeartbeat(undefined)).toBeUndefined();
  expect(maintenanceHeartbeat("")).toBeUndefined();
});

it("sends only an empty success or failure ping to the specific independent check", async () => {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => { requests.push(new Request(input, init)); return new Response("OK"); };
  const report = maintenanceHeartbeat(ping, transport, approval())!;
  await report("success");
  await report("failure");
  expect(requests.map(r => r.url)).toEqual([ping, ping + "/fail"]);
  for (const request of requests) {
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("");
    expect(request.redirect).toBe("error");
    expect(request.credentials).toBe("omit");
    expect(request.headers.get("authorization")).toBeNull();
  }
});

it("rejects unexpected destinations, credentials, query data and redirects without sending", async () => {
  const transport = vi.fn<typeof fetch>();
  for (const raw of ["http://hc-ping.com/00000000-0000-4000-8000-000000000901", "https://localhost/check", ping + "?data=private", ping + "#private", ping + "/fail", ping.replace("hc-ping.com", "hc-ping.com.evil.example"), ping.replace("https://", "https://user:secret@"), ping + "\n"]) {
    await expect(maintenanceHeartbeat(raw, transport)!("success")).rejects.toThrow("invalid_maintenance_heartbeat_url");
  }
  expect(transport).not.toHaveBeenCalled();
});

it("retries one transient failure and then stops, without treating invalid check credentials as transient", async () => {
  const attempts: string[] = [];
  const transport: typeof fetch = async (input) => { attempts.push(String(input)); return new Response("", { status: attempts.length === 1 ? 503 : 200 }); };
  await maintenanceHeartbeat(ping, transport, approval())!("success");
  expect(attempts).toEqual([ping, ping]);
  let denied = 0;
  await expect(maintenanceHeartbeat(ping, async () => { denied++; return new Response("", { status: 403 }); }, approval())!("failure")).rejects.toThrow("maintenance_heartbeat_unavailable");
  expect(denied).toBe(1);
  let unavailable = 0;
  await expect(maintenanceHeartbeat(ping, async () => { unavailable++; throw Error("secret transport details"); }, approval())!("failure")).rejects.toThrow("maintenance_heartbeat_unavailable");
  expect(unavailable).toBe(2);
});

it("bounds a hung transport by aborting both attempts", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const transport: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    calls++;
    init?.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true });
  });
  const result = maintenanceHeartbeat(ping, transport, approval())!("failure");
  const rejected = expect(result).rejects.toThrow("maintenance_heartbeat_unavailable");
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(calls).toBe(2);
});

it("refuses configured network reporting without a complete finite approval", async () => {
  const transport = vi.fn<typeof fetch>();
  await expect(maintenanceHeartbeat(ping, transport)!("success")).rejects.toThrow("invalid_maintenance_heartbeat_authorization");
  for (const change of [{ validFrom: undefined }, { validUntil: "invalid" }, { approvalId: "" },
    { validFrom: "2026-02-31T00:00:00.000Z" },
    { validFrom: "2026-11-01T00:00:00.000Z", validUntil: "2026-12-02T00:00:00.001Z" }]) {
    await expect(maintenanceHeartbeat(ping, transport, { ...approval(), ...change })!("success")).rejects.toThrow("invalid_maintenance_heartbeat_authorization");
  }
  expect(transport).not.toHaveBeenCalled();
});
it("sends only inside the approved interval and never renews an expired approval on reload", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-13T20:00:00.000Z"));
  const grant = { ...approval(), validFrom: new Date(Date.now() + 1000).toISOString(), validUntil: new Date(Date.now() + 2000).toISOString() };
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("OK"));
  const report = maintenanceHeartbeat(ping, transport, grant)!;
  await report("failure"); expect(transport).not.toHaveBeenCalled();
  vi.setSystemTime(new Date(grant.validFrom)); await report("success");
  expect(transport).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date(grant.validUntil)); await report("failure");
  await maintenanceHeartbeat(ping, transport, grant)!("success");
  expect(transport).toHaveBeenCalledTimes(1);
});
it("does not dispatch the transient retry after notification authority expires", async () => {
  vi.useFakeTimers();
  const grant = { ...approval(), validUntil: new Date(Date.now() + 100).toISOString() };
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response("", { status: 503 }));
  const result = maintenanceHeartbeat(ping, transport, grant)!("failure");
  const finished = expect(result).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(300); await finished;
  expect(transport).toHaveBeenCalledTimes(1);
});
