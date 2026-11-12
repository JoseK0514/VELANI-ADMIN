import { waitUntil } from "@neon/functions";
import { parseTriggerDelivery } from "@neon/functions/triggers";
import { assertDeadline, withinDeadline } from "../server/deadline";
import type { MaintenanceReporter, MaintenanceOutcome } from "./heartbeat";

type Batch = { clients: number; cases: number; morePossible: boolean };
/** Only deploy behind Neon's proxy, which strips caller-supplied x-neon-* headers. */
export function maintenanceHandler(run: () => Promise<Batch>, triggerName: string, report?: MaintenanceReporter) {
  const notify = (outcome: MaintenanceOutcome) => {
    if (!report) return;
    const work = Promise.resolve().then(() => report(outcome)).catch(() => {
      console.error("admin_maintenance_heartbeat_failed");
    });
    // Keep telemetry alive after the response, without blocking maintenance/retries.
    try { waitUntil(work); } catch { console.error("admin_maintenance_heartbeat_failed"); }
  };
  return async (request: Request): Promise<Response> => {
    const headers = { "Cache-Control": "no-store" };
    if (new URL(request.url).pathname !== "/maintenance")
      return new Response(null, { status: 404, headers });
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
    const parsed = await parseTriggerDelivery(request);
    if (!parsed.ok)
      return new Response(null, { status: parsed.error === "invalid_body" ? 400 : 401, headers });
    if (parsed.invocation.type !== "schedule" || parsed.invocation.trigger.name !== triggerName)
      return new Response(null, { status: 403, headers });
    return withinDeadline(async () => {
    try {
      let clients = 0, cases = 0;
      for (let batches = 1; batches <= 10; batches++) {
        assertDeadline();
        const result = await run();
        clients += result.clients;
        cases += result.cases;
        if (!result.morePossible) {
          notify("success");
          return Response.json({ state: "maintenance_complete", invocationId: parsed.invocation.invocationId, batches, clients, cases }, { headers });
        }
      }
    } catch (error) {
      // Only reviewed operational codes enter private logs; never raw SQL/DSNs/data.
      const allowed = ["private_worker_binding_required", "private_target_binding_mismatch", "authorization_recovery_required", "journal_rollback_detected", "request_timeout", "invalid_maintenance_role", "invalid_journal_role"];
      const message = error instanceof Error ? error.message : "";
      const sql = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      const code = allowed.includes(message) ? message : ["42501", "3F000", "42P01", "23505", "08006", "08001", "57014", "53300", "40001", "40P01", "28P01"].includes(sql) ? sql : "operation_failed";
      console.error("admin_maintenance_failed", code);
    }
    notify("failure");
    return Response.json({ state: "maintenance_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "60" } });
    }, 60_000);
  };
}
