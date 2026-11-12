import { parseTriggerDelivery } from "@neon/functions/triggers";
import { assertDeadline, withinDeadline } from "../server/deadline";

type Batch = { clients: number; cases: number; morePossible: boolean };
/** Only deploy behind Neon's proxy, which strips caller-supplied x-neon-* headers. */
export function maintenanceHandler(run: () => Promise<Batch>, triggerName: string) {
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
        if (!result.morePossible)
          return Response.json({ state: "maintenance_complete", invocationId: parsed.invocation.invocationId, batches, clients, cases }, { headers });
      }
    } catch {
      // Provider retries and alerts see a failure; no SQL, DSNs or record data leave the worker.
    }
    return Response.json({ state: "maintenance_unavailable" }, { status: 503, headers: { ...headers, "Retry-After": "60" } });
    }, 60_000);
  };
}
