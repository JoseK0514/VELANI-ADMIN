import { expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
it("runs the built Next adapter closed when secrets are absent; no fallback authentication", async () => {
  const port = await new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const a = s.address();
      s.close(() => resolve((a as { port: number }).port));
    });
  });
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { env: { ...process.env, ADMIN_ENABLED: "false" }, stdio: "ignore" },
  );
  try {
    const origin = "http://127.0.0.1:" + port;
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        const h = await fetch(origin + "/health");
        if (h.ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    expect(ready).toBe(true);
    const r = await fetch(origin + "/ready");
    expect(r.status).toBe(503);
    const api = await fetch(origin + "/api/admin/v1/clients");
    expect(api.status).toBe(503);
    expect(api.headers.get("cache-control")).toContain("no-store");
    const error = await api.json();
    expect(error.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(error).toMatchObject({
      error: { code: "admin_not_configured" },
    });
    expect(
      (await fetch(origin + "/api/admin/v1/clients", { method: "DELETE" }))
        .status,
    ).toBe(503);
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
  }
});
