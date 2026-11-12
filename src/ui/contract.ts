/**
 * UI-side reading of the fixed admin API v1 contract (docs/api-v1.md).
 * Pure functions only: every documented status and shape maps to one UI state.
 */

export type Fields = Record<string, string[]>;

export type UiState =
  | { kind: "ok"; status: number; body: Record<string, unknown> }
  /** 401: missing, incomplete, expired or revoked login. */
  | { kind: "signed_out"; code: string; requestId?: string }
  /** 403 reauth_required: a fresh passkey proof is needed, edits are kept. */
  | { kind: "reauth"; requestId?: string }
  /** 403 other: wrong identity, origin, CSRF or operator-only step. */
  | { kind: "forbidden"; code: string; requestId?: string }
  /** 503 where the backend is closed by design (not configured, restore fence). */
  | { kind: "closed"; code: string; requestId?: string }
  /** 503 other, or a response that is not the contract's JSON. */
  | { kind: "unavailable"; code: string; requestId?: string }
  | { kind: "rate_limited"; retryAfterMs: number; requestId?: string }
  /** 404: absent, expired or out of scope. */
  | { kind: "not_found"; requestId?: string }
  /** 409: stale version, changed replay, duplicate or business conflict. */
  | { kind: "conflict"; code: string; requestId?: string }
  /** 422: invalid field or missing explicit confirmation. */
  | { kind: "invalid"; code: string; fields: Fields; requestId?: string }
  /** 400, 405, 413, 415: the request itself was malformed. */
  | { kind: "bad_request"; code: string; requestId?: string }
  /** No response at all. For a command the outcome is unknown. */
  | { kind: "uncertain" };

/** 503 codes that mean the admin is closed rather than briefly unavailable. */
export const CLOSED_CODES = [
  "admin_not_configured",
  "authorization_recovery_required",
  "restore_reconciliation_required",
  "deployment_binding_mismatch",
  "deployment_binding_missing",
  "journal_rollback_detected",
  "schema_not_qualified",
] as const;

/** Closed codes after which local pagination and pending edits must be dropped. */
export const CLEAR_LOCAL_STATE_CODES = [
  "authorization_recovery_required",
  "restore_reconciliation_required",
] as const;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

export function classify(
  status: number,
  body: unknown,
  retryAfterHeader: string | null = null,
): UiState {
  const obj = isObject(body) ? body : null;
  const requestId =
    obj && typeof obj.requestId === "string" ? obj.requestId : undefined;
  const error = obj && isObject(obj.error) ? obj.error : null;
  const code =
    error && typeof error.code === "string" ? error.code : "unexpected_response";
  if (status >= 200 && status < 300) {
    if (obj && obj.schemaVersion === 1 && !error)
      return { kind: "ok", status, body: obj };
    return { kind: "unavailable", code: "unexpected_response", requestId };
  }
  // Anything that is not the contract's JSON error (a platform login wall,
  // an HTML error page, an opaque redirect) is never read as a contract state.
  if (!error) return { kind: "unavailable", code: "unexpected_response" };
  switch (status) {
    case 401:
      return { kind: "signed_out", code, requestId };
    case 403:
      return code === "reauth_required"
        ? { kind: "reauth", requestId }
        : { kind: "forbidden", code, requestId };
    case 404:
      return { kind: "not_found", requestId };
    case 409:
      return { kind: "conflict", code, requestId };
    case 422:
      return {
        kind: "invalid",
        code,
        fields: isObject(error.fields) ? (error.fields as Fields) : {},
        requestId,
      };
    case 429: {
      const fromBody =
        typeof error.retryAfterMs === "number" ? error.retryAfterMs : NaN;
      const fromHeader =
        retryAfterHeader && /^\d+$/.test(retryAfterHeader)
          ? Number(retryAfterHeader) * 1000
          : NaN;
      const ms = Number.isFinite(fromBody)
        ? fromBody
        : Number.isFinite(fromHeader)
          ? fromHeader
          : 60_000;
      return { kind: "rate_limited", retryAfterMs: Math.max(1000, ms), requestId };
    }
    case 400:
    case 405:
    case 413:
    case 415:
      return { kind: "bad_request", code, requestId };
    case 503:
      return (CLOSED_CODES as readonly string[]).includes(code)
        ? { kind: "closed", code, requestId }
        : { kind: "unavailable", code, requestId };
    default:
      return { kind: "unavailable", code, requestId };
  }
}

export type Source = {
  system: string;
  environment: string;
  observedAt: string;
  freshness: "fresh" | "stale" | "unknown";
  coverage: "complete" | "partial" | "unknown";
};

export type ReadEnvelope<T = unknown> = {
  schemaVersion: 1;
  state: "ready" | "partial" | "unavailable";
  data: T;
  source: Source;
  requestId?: string;
};

export type ReadView = "ready" | "empty" | "partial" | "stale" | "unavailable";

/** One view state per read envelope. Unavailable wins, then partial, then stale. */
export function readView(envelope: ReadEnvelope): ReadView {
  if (envelope.state === "unavailable" || envelope.data == null)
    return "unavailable";
  if (envelope.state === "partial" || envelope.source?.coverage !== "complete")
    return "partial";
  if (envelope.source?.freshness !== "fresh") return "stale";
  const data = envelope.data as { items?: unknown[] };
  if (Array.isArray(data.items) && data.items.length === 0) return "empty";
  return "ready";
}

/** A missing metric is unknown. It is never shown as 0. */
export function metric(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "Unknown";
}

export type Command = {
  schemaVersion: 1;
  operationId: string;
  expectedVersion: string;
  payload: Record<string, unknown>;
};

export function newCommand(
  expectedVersion: string,
  payload: Record<string, unknown>,
  uuid: () => string = () => crypto.randomUUID(),
): Command {
  return { schemaVersion: 1, operationId: uuid(), expectedVersion, payload };
}

/**
 * Whether a command must keep its operation ID and exact body after this
 * answer. True whenever the server may have committed it (no answer, 503) or
 * asked for the very same command again (passkey check, rate limit). Only a
 * definitive answer ends an operation. Used by CommandForm, and exercised
 * through the real form in test/ui-form-lifecycle.test.ts.
 */
export function mustKeepOperation(state: UiState): boolean {
  if (state.kind === "unavailable") return state.code !== "writes_disabled";
  // A closed backend is not kept: the gate clears all local state for it.
  return state.kind === "uncertain" || state.kind === "reauth" || state.kind === "rate_limited";
}

/** True only when the server said clearly that the command did not run. */
export function notExecuted(state: UiState): boolean {
  return state.kind === "reauth" || state.kind === "rate_limited";
}

const LIST_PARAMS = ["limit", "cursor", "state", "classification"] as const;
export type ListQuery = Partial<Record<(typeof LIST_PARAMS)[number], string>>;

/** Only the four documented list parameters are ever sent. */
export function listPath(route: string, query: ListQuery = {}): string {
  const q = new URLSearchParams();
  for (const k of LIST_PARAMS) {
    const v = query[k];
    if (v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `${route}?${s}` : route;
}

/** Links are restricted to returned canonical HTTPS origins. */
export function canonicalHttpsOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.origin === value ? u.origin : null;
  } catch {
    return null;
  }
}

export const REASONS: Record<string, string> = {
  confirmed_contact: "Contact confirmed",
  contact_correction: "Contact correction",
  client_link_verified: "Client link verified",
  client_requested_change: "Client requested change",
  engagement_confirmed: "Engagement confirmed",
  engagement_reconfirmed: "Engagement reconfirmed",
  relationship_closed: "Relationship closed",
  reopened_work: "Work reopened",
};
export const PROJECT_STAGES = [
  "planned",
  "in_progress",
  "waiting_client",
  "completed",
  "canceled",
];
export const CASE_STATES = [
  "new",
  "reviewing",
  "waiting_client",
  "resolved",
  "closed",
];
export const CLIENT_STATES = ["prospect", "active", "inactive"];
export const TERMINAL_STAGES = ["completed", "canceled"];
export const TERMINAL_CASE_STATES = ["resolved", "closed"];
