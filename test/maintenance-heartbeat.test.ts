import { afterEach, expect, it, vi } from "vitest";
import { maintenanceHeartbeat } from "../src/worker/heartbeat";

const ping = "https://hc-ping.com/00000000-0000-4000-8000-000000000901";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("does no network work without an explicitly configured heartbeat", () => {
  expect(maintenanceHeartbeat(undefined)).toBeUndefined();
  expect(maintenanceHeartbeat("")).toBeUndefined();
});

it("sends only an empty success or failure ping to the specific independent check", async () => {
  const requests: Request[] = [];
  const transport: typeof fetch = async (input, init) => { requests.push(new Request(input, init)); return new Response("OK"); };
  const report = maintenanceHeartbeat(ping, transport)!;
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
  await maintenanceHeartbeat(ping, transport)!("success");
  expect(attempts).toEqual([ping, ping]);
  let denied = 0;
  await expect(maintenanceHeartbeat(ping, async () => { denied++; return new Response("", { status: 403 }); })!("failure")).rejects.toThrow("maintenance_heartbeat_unavailable");
  expect(denied).toBe(1);
  let unavailable = 0;
  await expect(maintenanceHeartbeat(ping, async () => { unavailable++; throw Error("secret transport details"); })!("failure")).rejects.toThrow("maintenance_heartbeat_unavailable");
  expect(unavailable).toBe(2);
});

it("bounds a hung transport by aborting both attempts", async () => {
  vi.useFakeTimers();
  let calls = 0;
  const transport: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
    calls++;
    init?.signal?.addEventListener("abort", () => reject(Error("aborted")), { once: true });
  });
  const result = maintenanceHeartbeat(ping, transport)!("failure");
  const rejected = expect(result).rejects.toThrow("maintenance_heartbeat_unavailable");
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(calls).toBe(2);
});
