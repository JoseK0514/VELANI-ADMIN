import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canonicalHttpsOrigin,
  classify,
  CLOSED_CODES,
  listPath,
  metric,
  mustKeepOperation,
  newCommand,
  readView,
  type ReadEnvelope,
} from "../src/ui/contract";

const err = (code: string, extra: object = {}) => ({
  schemaVersion: 1,
  error: { code, ...extra },
  requestId: "0ee9d84b-931b-4141-8a11-89b0f248c2a6",
});
const sample = JSON.parse(
  readFileSync("docs/evidence/qualification-sample.json", "utf8"),
);

describe("admin UI: documented status and shape to UI state", () => {
  it("reads the recorded qualification responses as ok", () => {
    for (const e of sample.events)
      expect(classify(e.status, e.body)).toMatchObject({
        kind: "ok",
        status: e.status,
      });
    expect(classify(200, sample.overview).kind).toBe("ok");
    expect(classify(200, sample.profile).kind).toBe("ok");
  });
  it.each([
    [401, "authentication_required", "signed_out"],
    [401, "challenge_expired", "signed_out"],
    [401, "identity_invalid", "signed_out"],
    [403, "reauth_required", "reauth"],
    [403, "identity_denied", "forbidden"],
    [403, "identity_not_enrolled", "forbidden"],
    [403, "origin_denied", "forbidden"],
    [403, "csrf_denied", "forbidden"],
    [403, "enrollment_not_authorized", "forbidden"],
    [403, "backup_factor_required", "forbidden"],
    [403, "private_operator_required", "forbidden"],
    [404, "not_found", "not_found"],
    [409, "version_changed", "conflict"],
    [409, "operation_changed", "conflict"],
    [409, "case_exists", "conflict"],
    [409, "open_projects", "conflict"],
    [409, "live_nevora_relationship", "conflict"],
    [409, "source_changed", "conflict"],
    [409, "client_inactive", "conflict"],
    [422, "invalid_fields", "invalid"],
    [422, "engagement_confirmation_required", "invalid"],
    [422, "closure_reason_required", "invalid"],
    [422, "reopen_reason_required", "invalid"],
    [422, "link_reason_required", "invalid"],
    [400, "invalid_cursor", "bad_request"],
    [400, "invalid_filter", "bad_request"],
    [400, "invalid_json", "bad_request"],
    [405, "method_not_allowed", "bad_request"],
    [413, "body_too_large", "bad_request"],
    [415, "json_required", "bad_request"],
    [503, "service_unavailable", "unavailable"],
    [503, "request_timeout", "unavailable"],
    [503, "sources_unavailable", "unavailable"],
    [503, "source_unavailable", "unavailable"],
    [503, "source_coverage_unavailable", "unavailable"],
    [503, "classification_coverage_unavailable", "unavailable"],
    [503, "writes_disabled", "unavailable"],
  ])("%i %s is %s", (status, code, kind) => {
    const state = classify(status, err(code));
    expect(state.kind).toBe(kind);
    if ("code" in state) expect(state.code).toBe(code);
  });
  it.each(CLOSED_CODES.map((c) => [c]))("503 %s is closed", (code) => {
    expect(classify(503, err(code))).toMatchObject({ kind: "closed", code });
  });
  it("keeps stable field paths for 422", () => {
    expect(
      classify(422, err("invalid_fields", { fields: { displayName: ["too_big"] } })),
    ).toMatchObject({ kind: "invalid", fields: { displayName: ["too_big"] } });
    expect(classify(422, err("empty_command"))).toMatchObject({ fields: {} });
  });
  it("honors Retry-After from the body, then the header, then a safe default", () => {
    expect(classify(429, err("rate_limited", { retryAfterMs: 42000 }), "9")).toMatchObject(
      { kind: "rate_limited", retryAfterMs: 42000 },
    );
    expect(classify(429, err("rate_limited"), "9")).toMatchObject({ retryAfterMs: 9000 });
    expect(classify(429, err("rate_limited"))).toMatchObject({ retryAfterMs: 60000 });
    expect(classify(429, err("rate_limited", { retryAfterMs: 1 }))).toMatchObject({
      retryAfterMs: 1000,
    });
  });
  it("never reads a non-contract response as signed in or signed out", () => {
    expect(classify(200, null).kind).toBe("unavailable");
    expect(classify(200, "<html>").kind).toBe("unavailable");
    expect(classify(200, { state: "authenticated" }).kind).toBe("unavailable");
    expect(classify(200, { schemaVersion: 2 }).kind).toBe("unavailable");
    expect(classify(0, null).kind).toBe("unavailable");
    expect(classify(302, null).kind).toBe("unavailable");
    expect(classify(401, "<html>login wall</html>").kind).toBe("unavailable");
    expect(classify(500, null).kind).toBe("unavailable");
  });
});

describe("admin UI: read envelopes", () => {
  const env = (over: Partial<ReadEnvelope> = {}): ReadEnvelope => ({
    schemaVersion: 1,
    state: "ready",
    data: { items: [{ id: "x" }], nextCursor: null },
    source: {
      system: "admin",
      environment: "test",
      observedAt: "2026-11-10T16:10:46.691Z",
      freshness: "fresh",
      coverage: "complete",
    },
    ...over,
  });
  it("maps ready, empty, partial, stale and unavailable", () => {
    expect(readView(env())).toBe("ready");
    expect(readView(env({ data: { items: [], nextCursor: null } }))).toBe("empty");
    expect(readView(env({ state: "partial" }))).toBe("partial");
    expect(
      readView(env({ source: { ...env().source, coverage: "unknown" } })),
    ).toBe("partial");
    expect(readView(env({ source: { ...env().source, freshness: "stale" } }))).toBe(
      "stale",
    );
    expect(
      readView(env({ source: { ...env().source, freshness: "unknown" } })),
    ).toBe("stale");
    expect(readView(env({ state: "unavailable", data: null }))).toBe("unavailable");
    expect(readView(sample.overview)).toBe("ready");
    expect(readView(sample.profile)).toBe("ready");
  });
  it("shows a missing metric as unknown, never 0", () => {
    expect(metric(null)).toBe("Unknown");
    expect(metric(undefined)).toBe("Unknown");
    expect(metric(0)).toBe("0");
    expect(metric(sample.overview.data.revenue.value)).toBe("Unknown");
    expect(metric(sample.overview.data.trials.value)).toBe("0");
  });
  it("sends only the documented list parameters", () => {
    expect(listPath("clients")).toBe("clients");
    expect(
      listPath("clients", {
        limit: "25",
        cursor: "abc.def",
        state: "active",
        classification: "include_internal",
        ...({ environment: "production", sort: "name" } as object),
      }),
    ).toBe("clients?limit=25&cursor=abc.def&state=active&classification=include_internal");
  });
  it("links only canonical HTTPS origins", () => {
    expect(canonicalHttpsOrigin("https://cafe.example.com")).toBe(
      "https://cafe.example.com",
    );
    for (const bad of [
      "http://cafe.example.com",
      "https://cafe.example.com/path",
      "javascript:alert(1)",
      "cafe.example.com",
      null,
      7,
    ])
      expect(canonicalHttpsOrigin(bad)).toBeNull();
  });
});

describe("admin UI: commands", () => {
  it("builds the fixed envelope and keeps one operation ID per command", () => {
    const c = newCommand("0", { displayName: "A", relationshipState: "prospect" }, () => "id-1");
    expect(c).toEqual({
      schemaVersion: 1,
      operationId: "id-1",
      expectedVersion: "0",
      payload: { displayName: "A", relationshipState: "prospect" },
    });
  });
  it("keeps an operation only while its outcome is open", () => {
    expect(mustKeepOperation({ kind: "uncertain" })).toBe(true);
    expect(mustKeepOperation(classify(503, err("request_timeout")))).toBe(true);
    expect(mustKeepOperation(classify(429, err("rate_limited")))).toBe(true);
    expect(mustKeepOperation(classify(403, err("reauth_required")))).toBe(true);
    for (const definitive of [
      classify(503, err("writes_disabled")),
      classify(503, err("authorization_recovery_required")),
      classify(409, err("version_changed")),
      classify(422, err("invalid_fields")),
      classify(404, err("not_found")),
      classify(401, err("authentication_required")),
    ])
      expect(mustKeepOperation(definitive)).toBe(false);
  });
});
