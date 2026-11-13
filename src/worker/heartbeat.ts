export type MaintenanceOutcome = "success" | "failure";
export type MaintenanceReporter = (outcome: MaintenanceOutcome) => Promise<void>;
export type MaintenanceHeartbeatAuthorization = Readonly<{
  validFrom: string | undefined; validUntil: string | undefined; approvalId: string | undefined;
}>;

/** A dedicated, write-only check URL. Never send records, counts or error details. */
export function maintenanceHeartbeat(
  raw: string | undefined,
  transport: typeof fetch = fetch,
  authorization?: MaintenanceHeartbeatAuthorization,
): MaintenanceReporter | undefined {
  if (!raw) return undefined;
  const grant = authorization && { ...authorization };
  return async (outcome) => {
    // Canonical form only: no alternate hosts, embedded credentials or query data.
    if (!/^https:\/\/hc-ping\.com\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(raw)
      || new URL(raw).href !== raw)
      throw Error("invalid_maintenance_heartbeat_url");
    const absolute = (value: string | undefined) => {
      if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
        throw Error("invalid_maintenance_heartbeat_authorization");
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value)
        throw Error("invalid_maintenance_heartbeat_authorization");
      return parsed;
    };
    const from = absolute(grant?.validFrom), until = absolute(grant?.validUntil);
    if (!grant?.approvalId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(grant.approvalId)
      || until <= from || until - from > 31 * 86400000)
      throw Error("invalid_maintenance_heartbeat_authorization");
    const destination = raw + (outcome === "failure" ? "/fail" : "");
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = Date.now();
      if (!Number.isFinite(now)) throw Error("invalid_maintenance_heartbeat_authorization");
      // Expiry silences reporting, not cleanup. A retry cannot renew authority.
      if (now < from || now >= until) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      let retry = true;
      try {
        const response = await transport(destination, {
          method: "POST", body: "", redirect: "error", credentials: "omit",
          cache: "no-store", signal: controller.signal,
        });
        // Do not consume or log the provider's response body.
        await response.body?.cancel();
        if (response.ok) return;
        retry = [408, 425, 429].includes(response.status) || response.status >= 500;
      } catch {
        // Network errors are retried once; their messages can contain the secret URL.
      } finally {
        clearTimeout(timeout);
      }
      if (!retry || attempt === 1) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw Error("maintenance_heartbeat_unavailable");
  };
}
