/**
 * DEVELOPMENT FIXTURES ONLY. Never imported by a production bundle.
 *
 * Serves the recorded owned-loopback responses from
 * docs/evidence/qualification-sample.json through the same Transport the real
 * API uses. Nothing here signs anyone in: there is no session, no actor and no
 * CSRF token, and every write is refused.
 */
import sample from "../../docs/evidence/qualification-sample.json";
import type { RawResponse, Transport } from "./client";

export const FIXTURE_MARKER = "velani-admin-dev-fixtures-module";

if (process.env.NODE_ENV !== "development")
  throw new Error("Development fixtures cannot load outside development.");

const json = (status: number, body: unknown): RawResponse => ({
  status,
  body,
  retryAfter: null,
});
const notRecorded = () =>
  json(503, { schemaVersion: 1, error: { code: "fixture_not_recorded" } });

export const fixtureTransport: Transport = async ({ method, path }) => {
  if (method !== "GET") return notRecorded();
  const [route, query = ""] = path.split("?");
  const profile = sample.profile;
  if (route === "overview") return json(200, sample.overview);
  if (route === "clients/" + profile.data.id) return json(200, profile);
  if (route.startsWith("clients/"))
    return json(404, { schemaVersion: 1, error: { code: "not_found" } });
  if (route === "clients") {
    // The sample holds one client profile and no list response. The list row
    // is the same recorded client reduced to the documented list fields.
    const d = profile.data;
    const state = new URLSearchParams(query).get("state");
    const row = {
      id: d.id,
      displayName: d.displayName,
      relationshipState: d.relationshipState,
      version: d.version,
      createdAt: d.createdAt,
      engagedAt: d.engagedAt,
      closedAt: d.closedAt,
      deleteAfter: d.deleteAfter,
      prospectExpiresAt: d.prospectExpiresAt,
    };
    return json(200, {
      schemaVersion: 1,
      state: "ready",
      data: {
        items: !state || state === row.relationshipState ? [row] : [],
        nextCursor: null,
      },
      source: profile.source,
      requestId: profile.requestId,
    });
  }
  return notRecorded();
};
