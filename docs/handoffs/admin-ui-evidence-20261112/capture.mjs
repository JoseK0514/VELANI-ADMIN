// Browser evidence for the admin UI. Usage:
//   node capture.mjs <group> [baseUrl]
// Groups: states, login, views, forms, access, fixtures.
// Every group except "fixtures" and the scenario marked real answers
// /api/admin/v1 inside Playwright with fictional, contract-shaped responses.
// Nothing here is shipped in the app and no real backend state is touched.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const require = createRequire("/Users/josek0514/Desktop/VELANI-SHOPIFY-WEBSITE/package.json");
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const here = dirname(fileURLToPath(import.meta.url));
const group = process.argv[2] ?? "states";
const base = process.argv[3] ?? "http://localhost:3111";
const shots = join(here, "screens");
mkdirSync(shots, { recursive: true });

const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-11-12T14:05:00.000Z";
const src = (system, over = {}) => ({ system, environment: "test", observedAt: NOW, freshness: "fresh", coverage: "complete", ...over });
const env = (data, system, state = "ready", over = {}) => ({
  status: 200,
  body: { schemaVersion: 1, state, data, source: src(system, { ...(state === "partial" ? { coverage: "partial" } : {}), ...over }), requestId: U(900) },
});
const err = (status, code, extra = {}, headers = {}) => ({ status, headers, body: { schemaVersion: 1, error: { code, ...extra }, requestId: U(901) } });
const list = (items, system, next = null, state = "ready", over = {}) => env({ items, nextCursor: next }, system, state, over);
const receipt = (entityType, entityId, version, replayed = false, status = 200) => ({
  status,
  body: { schemaVersion: 1, state: "saved", receipt: { operationId: U(700), entityType, entityId, version, replayed }, requestId: U(902) },
});

const session = {
  status: 200,
  body: {
    schemaVersion: 1,
    state: "authenticated",
    actor: { id: U(1), email: "owner@velani.example", role: "platform_owner" },
    environment: "test",
    session: { expiresAt: "2026-11-12T22:00:00.000Z", idleExpiresAt: "2026-11-12T14:35:00.000Z", factorAt: "2026-11-12T14:00:00.000Z" },
    csrfToken: "fictional-csrf",
    capabilities: { viewInternalFixtures: true, internalWrites: true, customerActions: false },
    requestId: U(903),
  },
};
const ns = { state: "not_supported" };
const workplaces = [
  { id: U(101), origin: "https://harbor-cafe.nevora.example", environment: "test", revision: "7", incarnation: "1", lifecycle: "active", createdAt: "2026-10-02T15:20:11.120000Z", classification: "unclassified", catalog: { enrollmentName: "Harbor Cafe (fictional)", contactProvenance: "source_enrollment", access: "trial", trialEndsAt: "2026-11-20T00:00:00Z", planKey: "team", observedAt: NOW }, currentHeadcount: ns, setupReadiness: ns, workerHealth: ns },
  { id: U(102), origin: "https://linden-dental.nevora.example", environment: "test", revision: "3", incarnation: "2", lifecycle: "active", createdAt: "2026-09-18T12:02:44.000000Z", classification: "unclassified", catalog: { enrollmentName: "Linden Dental (fictional)", contactProvenance: "source_enrollment", access: "paid", trialEndsAt: null, planKey: "team", observedAt: NOW }, currentHeadcount: ns, setupReadiness: ns, workerHealth: ns },
  { id: U(103), origin: "https://qa-sandbox.nevora.example", environment: "test", revision: "1", incarnation: "1", lifecycle: "provisioning", createdAt: "2026-09-01T09:00:00.000000Z", classification: "internal", catalog: { access: "unknown" }, currentHeadcount: ns, setupReadiness: ns, workerHealth: ns },
];
const registrations = [
  { id: U(201), stage: "email_pending", language: "en", version: "2", verifiedAt: null, expiresAt: "2026-11-13T10:00:00Z", createdAt: "2026-11-12T10:00:00Z" },
  { id: U(202), stage: "verified", language: "es", version: "4", verifiedAt: "2026-11-11T18:30:00Z", expiresAt: "2026-11-14T18:30:00Z", createdAt: "2026-11-11T18:02:00Z" },
];
const requests = [
  { id: U(301), reference: "VH-2041", type: "new_project", company: "Harbor Cafe (fictional)", project: "Online ordering page", urgency: "this_month", language: "en", createdAt: "2026-11-11T16:42:10Z", expiresAt: "2027-02-09T16:42:10Z", contactProvenance: "asserted", emailSubmissions: [{ kind: "client_receipt", state: "submitted", attempts: 1 }, { kind: "team_notice", state: "submitted", attempts: 1 }] },
  { id: U(302), reference: "VH-2040", type: "support", company: "Linden Dental (fictional)", project: "Booking form fix", urgency: "this_week", language: "es", createdAt: "2026-11-10T09:15:00Z", expiresAt: "2027-02-08T09:15:00Z", contactProvenance: "asserted", emailSubmissions: [] },
];
const clients = [
  { id: U(401), displayName: "Harbor Cafe (fictional)", relationshipState: "active", version: "6", createdAt: "2026-10-03T14:00:00Z", engagedAt: "2026-10-05T14:00:00Z", closedAt: null, deleteAfter: null, prospectExpiresAt: "2027-01-01T14:00:00Z" },
  { id: U(402), displayName: "Linden Dental (fictional)", relationshipState: "prospect", version: "2", createdAt: "2026-11-01T11:30:00Z", engagedAt: null, closedAt: null, deleteAfter: null, prospectExpiresAt: "2027-01-30T11:30:00Z" },
];
const clientDetail = {
  ...clients[0],
  contacts: [
    { id: U(411), name: "Marta Ruiz (fictional)", email: "marta@harbor-cafe.example", phone: "+1 555 0100", language: "es", active: true, provenance: "operator_verified", sourceId: null, verifiedAt: "2026-10-06T15:00:00Z" },
    { id: U(412), name: "Theo Park (fictional)", email: "theo@harbor-cafe.example", phone: null, language: "en", active: true, provenance: "asserted", sourceId: null, verifiedAt: null },
  ],
  sourceLinks: [{ system: "nevora", environment: "test", sourceId: U(101), sourceRevision: "7", incarnation: "1" }],
  notes: [{ id: U(421), text: "Kickoff call done. They want the ordering page live before the holidays.", createdAt: "2026-11-05T17:10:00Z" }],
};
const projects = [
  { id: U(501), clientId: U(401), name: "Online ordering page", stage: "in_progress", targetDate: "2026-12-10", version: "3", createdAt: "2026-10-06T15:30:00Z" },
  { id: U(502), clientId: U(401), name: "Menu photo refresh", stage: "completed", targetDate: null, version: "5", createdAt: "2026-10-04T10:00:00Z" },
];
const cases = [
  { id: U(601), sourceRequestId: U(301), reference: "VH-2041", state: "reviewing", clientId: U(401), projectId: U(501), followUpAt: "2026-11-14T15:00:00Z", sourceExpiresAt: "2027-02-09T16:42:10Z", version: "2", createdAt: "2026-11-11T17:00:00Z" },
  { id: U(602), sourceRequestId: U(302), reference: "VH-2040", state: "new", clientId: null, projectId: null, followUpAt: null, sourceExpiresAt: "2027-02-08T09:15:00Z", version: "1", createdAt: "2026-11-10T09:40:00Z" },
];
const activity = [
  { id: "9004", actorId: U(1), action: "detail_viewed", entityType: "request", entityId: U(301), reasonCode: null, result: "allowed", createdAt: "2026-11-12T14:01:00Z" },
  { id: "9003", actorId: U(1), action: "client.update", entityType: "client", entityId: U(401), reasonCode: "engagement_confirmed", result: "allowed", createdAt: "2026-11-12T13:40:00Z" },
  { id: "9002", actorId: U(1), action: "contact.update", entityType: "contact", entityId: U(411), reasonCode: "contact_correction", result: "allowed", createdAt: "2026-11-12T13:12:00Z" },
  { id: "9001", actorId: U(1), action: "session.created", entityType: "session", entityId: U(1), reasonCode: null, result: "allowed", createdAt: "2026-11-12T13:00:00Z" },
];
const count = (n, system) => ({ schemaVersion: 1, state: "ready", data: { count: n }, source: src(system) });
const overview = { trials: { value: 1, unit: "workplaces", reason: null }, workplaces: count(2, "control"), registrations: count(2, "control"), requests: count(2, "velani"), clients: 2, openProjects: 1, openCases: 2, revenue: { value: null, unit: "USD", reason: "live_billing_not_verified" } };
const overviewPartial = { ...overview, trials: { value: null, unit: "workplaces", reason: "catalog_coverage_or_freshness_unavailable" }, workplaces: { schemaVersion: 1, state: "unavailable", data: null, source: src("control", { freshness: "unknown", coverage: "unknown" }) } };
const integrations = { sources: [{ system: "control", state: "ready", coverage: "complete" }, { system: "catalog", state: "unavailable", coverage: "unknown" }, { system: "velani", state: "ready", coverage: "complete" }], retention: { lastSuccessAt: "2026-11-12T06:00:00Z", removedClients: 0, removedCases: 1 }, rondoLeads: { state: "disabled", reason: "retention_not_qualified" }, liveBilling: { state: "unavailable" }, companySummaries: { state: "not_supported" } };

const b64 = (s) => Buffer.from(s).toString("base64url");
const regOptions = (n) => ({ status: 200, body: { schemaVersion: 1, challengeId: U(800 + n), options: { challenge: b64("fictional-challenge-" + n), rp: { name: "Velani admin", id: "localhost" }, user: { id: b64("owner"), name: "owner@velani.example", displayName: "Owner" }, pubKeyCredParams: [{ type: "public-key", alg: -7 }], timeout: 60000, attestation: "none", excludeCredentials: [], authenticatorSelection: { userVerification: "required", residentKey: "preferred" } }, requestId: U(904) } });
const authOptions = (n) => ({ status: 200, body: { schemaVersion: 1, challengeId: U(820 + n), options: { challenge: b64("fictional-auth-" + n), rpId: "localhost", timeout: 60000, userVerification: "required", allowCredentials: [] }, requestId: U(905) } });

/** Default fictional backend. */
function baseline(method, path, body) {
  const [route] = path.split("?");
  const q = new URLSearchParams(path.split("?")[1] ?? "");
  if (method === "GET") {
    if (route === "session") return session;
    if (route === "overview") return env(overview, "combined");
    if (route === "integrations") return env(integrations, "admin");
    if (route === "nevora/workplaces") return list(q.get("classification") === "include_internal" ? workplaces : workplaces.slice(0, 2), "control");
    if (route === "nevora/workplaces/" + U(101)) return env({ ...workplaces[0], provisioning: [{ state: "database_ready", observedAt: "2026-10-02T15:21:00Z" }, { state: "complete", observedAt: "2026-10-02T15:22:30Z" }] }, "control");
    if (route === "nevora/registrations") return list(registrations, "control");
    if (route === "velani/requests") return list(requests, "velani");
    if (route === "velani/requests/" + U(301)) return env({ ...requests[0], name: "Marta Ruiz (fictional)", email: "marta@harbor-cafe.example", description: "Hi, we would like a simple page where regulars can order ahead for pickup.\n\nWe open at 7 and the morning line is the problem. Could it be ready before the holidays?" }, "velani");
    if (route === "clients") return list(q.get("state") ? clients.filter((c) => c.relationshipState === q.get("state")) : clients, "admin");
    if (route === "clients/" + U(401)) return env(clientDetail, "admin");
    if (route === "projects") return list(projects, "admin");
    if (route === "projects/" + U(501)) return env({ ...projects[0], notes: [] }, "admin");
    if (route === "cases") return list(cases, "admin");
    if (route === "cases/" + U(601)) return env({ ...cases[0], notes: [{ id: U(621), text: "Asked for menu export. Waiting on the file.", createdAt: "2026-11-12T13:30:00Z" }] }, "admin");
    if (route === "activity") return list(activity, "admin", "fictional.cursor");
    return err(404, "not_found");
  }
  if (route === "search") {
    const pool = { client: clients, project: projects, request: requests, workplace: workplaces }[body?.entity] ?? [];
    const needle = String(body?.query ?? "").toLowerCase();
    return list(pool.filter((x) => JSON.stringify(x).toLowerCase().includes(needle)), body?.entity === "client" || body?.entity === "project" ? "admin" : "velani");
  }
  if (route === "logout") return { status: 200, body: { schemaVersion: 1, state: "signed_out", requestId: U(906) } };
  if (route === "clients" && method === "POST") return receipt("client", U(401), "1", false, 201);
  if (route === "projects" && method === "POST") return receipt("project", U(501), "1", false, 201);
  if (route === "cases" && method === "POST") return receipt("case", U(601), "1", false, 201);
  if (route === "notes") return receipt("note", U(422), "7", false, 201);
  if (/^clients\/[0-9a-f-]{36}$/.test(route)) return receipt("client", U(401), "7");
  if (/^clients\/[0-9a-f-]{36}\/contacts/.test(route)) return receipt("contact", U(411), "7");
  if (/^projects\/[0-9a-f-]{36}$/.test(route)) return receipt("project", U(501), "4");
  if (/^cases\/[0-9a-f-]{36}$/.test(route)) return receipt("case", U(601), "3");
  return err(404, "not_found");
}

const signedOut = (m, p) => (p === "session" ? err(401, "authentication_required") : undefined);
const click = (name, role = "button") => async (page) => { await page.getByRole(role, { name, exact: true }).first().click(); };
const settle = (page) => page.waitForTimeout(350);

const scenarios = {
  states: [
    { name: "state-signed-out", path: "/overview", mock: signedOut },
    { name: "state-closed-real-backend", path: "/overview", real: true },
    { name: "state-closed-recovery", path: "/clients", mock: () => err(503, "authorization_recovery_required") },
    { name: "state-unavailable", path: "/overview", mock: (m, p) => (p === "session" ? err(503, "service_unavailable") : undefined) },
    { name: "state-unavailable-not-contract-json", path: "/overview", mock: (m, p) => (p === "session" ? { status: 200, raw: "<html>login wall</html>" } : undefined) },
    { name: "state-forbidden", path: "/overview", mock: (m, p) => (p === "session" ? err(403, "identity_denied") : undefined) },
    { name: "state-rate-limited", path: "/overview", mock: (m, p) => (p === "session" ? err(429, "rate_limited", { retryAfterMs: 42000 }, { "retry-after": "42" }) : undefined) },
    { name: "state-signed-out-after-logout", path: "/overview", act: async (page) => { const menu = page.getByRole("button", { name: "Menu", exact: true }); if (await menu.isVisible()) await menu.click(); await click("Sign out")(page); await page.getByRole("heading", { name: "You are signed out" }).waitFor(); }, mock: (m, p, b, n) => (p === "session" && n.logout ? err(401, "authentication_required") : p === "logout" ? ((n.logout = true), undefined) : undefined) },
    { name: "state-session-expired-mid-use", path: "/clients", mock: (m, p) => (p.startsWith("clients") ? err(401, "authentication_required") : undefined) },
  ],
  login: [
    { name: "login-pending-approval", path: `/login?state=identity_approval_required&request=${U(31)}`, mock: signedOut },
    { name: "login-enroll-primary", path: "/login?state=enrollment_required", mock: (m, p) => signedOut(m, p) ?? (p === "auth/status" ? { status: 200, body: { schemaVersion: 1, state: "enrollment_required", registeredFactors: 0, requestId: U(907) } } : undefined) },
    { name: "login-enroll-backup-partial", path: "/login?state=enrollment_required", mock: (m, p) => signedOut(m, p) ?? (p === "auth/status" ? { status: 200, body: { schemaVersion: 1, state: "enrollment_required", registeredFactors: 1, requestId: U(907) } } : undefined) },
    { name: "login-enroll-window-closed", path: "/login?state=enrollment_required", act: click("Create primary passkey"), mock: (m, p) => signedOut(m, p) ?? (p === "auth/status" ? { status: 200, body: { schemaVersion: 1, state: "enrollment_required", registeredFactors: 0, requestId: U(907) } } : p === "auth/enroll/options" ? err(403, "enrollment_not_authorized") : undefined) },
    { name: "login-passkey-required", path: "/login?state=passkey_required", mock: (m, p) => signedOut(m, p) ?? (p === "auth/status" ? { status: 200, body: { schemaVersion: 1, state: "passkey_required", registeredFactors: 2, requestId: U(907) } } : undefined) },
    { name: "login-pending-expired", path: "/login?state=passkey_required", mock: (m, p) => signedOut(m, p) ?? (p === "auth/status" ? err(401, "authentication_required") : undefined) },
    { name: "login-rate-limited", path: "/login?state=passkey_required", mock: (m, p) => signedOut(m, p) ?? (p === "auth/status" ? err(429, "rate_limited", { retryAfterMs: 30000 }) : undefined) },
    {
      name: "login-full-passkey-flow",
      path: "/login?state=enrollment_required",
      webauthn: true,
      mock: (m, p, b, n) => {
        n.factors ??= 0;
        if (p === "session") return n.authed ? undefined : err(401, "authentication_required");
        if (p === "auth/status") return { status: 200, body: { schemaVersion: 1, state: n.factors < 2 ? "enrollment_required" : "passkey_required", registeredFactors: n.factors, requestId: U(907) } };
        if (p === "auth/enroll/options") return regOptions(n.factors);
        if (p === "auth/enroll/verify") { n.proofs = [...(n.proofs ?? []), b]; n.factors += 1; return { status: 200, body: { schemaVersion: 1, state: "registered", requestId: U(908) } }; }
        if (p === "auth/passkey/options") return authOptions(1);
        if (p === "auth/passkey/verify") { n.assertion = b; n.authed = true; return { status: 200, body: { schemaVersion: 1, state: "authenticated", requestId: U(909) } }; }
      },
      act: async (page, note, shot) => {
        await page.getByRole("button", { name: "Create primary passkey" }).click();
        await page.getByRole("heading", { name: "Add your backup passkey" }).waitFor();
        await shot("login-full-passkey-flow-after-primary");
        // A second, separate authenticator stands in for the backup device.
        await note.swapAuthenticator();
        await page.getByRole("button", { name: "Create backup passkey" }).click();
        await page.getByRole("heading", { name: "Confirm with your passkey" }).waitFor();
        await page.getByRole("button", { name: "Use passkey" }).click();
        await page.getByRole("heading", { name: "Overview" }).waitFor();
        await page.waitForURL("**/overview");
        note.result = { enrolled: note.n.factors, proofsHaveChallengeId: (note.n.proofs ?? []).every((x) => x.challengeId && x.response?.id), assertionSent: Boolean(note.n.assertion?.response?.response?.signature), landed: new URL(page.url()).pathname };
      },
    },
  ],
  access: [],
  views: [
    { name: "view-overview", path: "/overview", wide: true },
    { name: "view-overview-partial", path: "/overview", mock: (m, p) => (p === "overview" ? env(overviewPartial, "combined", "partial") : undefined) },
    { name: "view-overview-loading", path: "/overview", mock: (m, p) => (p === "overview" ? { delay: 4000, ...env(overview, "combined") } : undefined), early: true },
    { name: "view-overview-sources-unavailable", path: "/overview", mock: (m, p) => (p === "overview" ? err(503, "sources_unavailable") : undefined) },
    { name: "view-workplaces", path: "/nevora/workplaces" },
    { name: "view-workplaces-internal-labelled", path: "/nevora/workplaces", act: async (page) => { await page.getByLabel("Include internal fixtures").check(); } },
    { name: "view-workplaces-partial", path: "/nevora/workplaces", mock: (m, p) => (p === "nevora/workplaces" ? list(workplaces.slice(0, 2).map((w) => ({ ...w, catalog: { access: "unknown" } })), "control", null, "partial") : undefined) },
    { name: "view-workplace-detail", path: "/nevora/workplaces/" + U(101) },
    { name: "view-registrations", path: "/nevora/registrations" },
    { name: "view-registrations-empty", path: "/nevora/registrations", mock: (m, p) => (p === "nevora/registrations" ? list([], "control") : undefined) },
    { name: "view-requests", path: "/velani/requests" },
    { name: "view-requests-source-unavailable", path: "/velani/requests", mock: (m, p) => (p === "velani/requests" ? err(503, "source_unavailable") : undefined) },
    { name: "view-requests-stale", path: "/velani/requests", mock: (m, p) => (p === "velani/requests" ? list(requests, "velani", null, "ready", { freshness: "stale" }) : undefined) },
    { name: "view-request-detail", path: "/velani/requests/" + U(301) },
    { name: "view-request-expired-404", path: "/velani/requests/" + U(399) },
    { name: "view-clients", path: "/clients", wide: true },
    { name: "view-clients-empty", path: "/clients", mock: (m, p) => (p === "clients" ? list([], "admin") : undefined) },
    { name: "view-clients-search-no-match", path: "/clients", act: async (page) => { await page.getByRole("searchbox").fill("zzz"); await page.getByRole("button", { name: "Search", exact: true }).click(); } },
    { name: "view-clients-rate-limited", path: "/clients", mock: (m, p) => (p === "clients" ? err(429, "rate_limited", { retryAfterMs: 20000 }) : undefined) },
    { name: "view-client-detail", path: "/clients/" + U(401), wide: true },
    { name: "view-projects", path: "/projects" },
    { name: "view-project-detail", path: "/projects/" + U(501) },
    { name: "view-cases", path: "/cases" },
    { name: "view-case-detail", path: "/cases/" + U(601) },
    { name: "view-activity", path: "/activity" },
    { name: "view-activity-more-failed", path: "/activity", act: click("Show more"), mock: (m, p) => (p.startsWith("activity?") ? err(503, "service_unavailable") : undefined) },
    { name: "view-integrations", path: "/integrations" },
    { name: "view-not-found-route", path: "/nothing-here" },
  ],
  forms: [
    { name: "form-new-client", path: "/clients", act: click("New client") },
    { name: "form-new-client-required", path: "/clients", act: async (page) => { await click("New client")(page); await click("Create client")(page); } },
    { name: "form-new-client-422-fields", path: "/clients", mock: (m, p) => (m === "POST" && p === "clients" ? err(422, "invalid_fields", { fields: { displayName: ["too_big"] } }) : undefined), act: async (page) => { await click("New client")(page); await page.getByLabel("Client name").fill("Harbor Cafe (fictional)"); await click("Create client")(page); } },
    {
      name: "form-lost-response-then-retry-same-operation", path: "/clients/" + U(401),
      mock: (m, p, b, n) => { if (m === "PATCH" && p === "clients/" + U(401)) { n.ops = [...(n.ops ?? []), JSON.stringify(b)]; return n.ops.length === 1 ? "abort" : receipt("client", U(401), "7", true); } },
      act: async (page, note, shot) => {
        await click("Rename")(page); await page.getByLabel("Client name").fill("Harbor Cafe and Bakery (fictional)"); await click("Save name")(page);
        await page.getByRole("button", { name: "Retry the same save" }).waitFor(); await shot("form-lost-response-locked");
        await click("Retry the same save")(page); await page.getByText("This was already saved earlier").first().waitFor();
        note.result = { sends: note.n.ops.length, sameOperationAndBody: note.n.ops[0] === note.n.ops[1] };
      },
    },
    {
      name: "form-unknown-close-reload-review-retry", path: "/clients/" + U(401),
      mock: (m, p, b, n) => { if (m === "POST" && p === "projects") { n.ops = [...(n.ops ?? []), JSON.stringify(b)]; return n.ops.length === 1 ? "abort" : receipt("project", U(501), "1", true); } },
      act: async (page, note, shot) => {
        await click("New project")(page); await page.getByLabel("Project name").fill("Online ordering page"); await click("Create project")(page);
        await click("Close and reload the record")(page);
        await page.getByText("has no answer yet").waitFor(); await shot("form-unknown-pending-notice");
        await page.getByRole("button", { name: /^Review/ }).click();
        await page.getByRole("button", { name: "Retry the same save" }).waitFor(); await shot("form-unknown-reopened-same-command");
        await click("Retry the same save")(page);
        await page.waitForURL("**/projects/" + U(501));
        await page.getByRole("heading", { level: 1, name: "Online ordering page" }).waitFor();
        note.result = { sends: note.n.ops.length, sameOperationAndBody: note.n.ops[0] === note.n.ops[1], landed: new URL(page.url()).pathname };
      },
    },
    {
      name: "form-404-after-save-clears-record", path: "/clients/" + U(401),
      mock: (m, p, b, n) => { if (m === "POST" && p === "notes") { n.gone = true; return undefined; } if (m === "GET" && p === "clients/" + U(401) && n.gone) return err(404, "not_found"); },
      act: async (page, note) => { await click("Add note")(page); await page.getByRole("textbox", { name: "Note" }).fill("Fictional note."); await click("Save note")(page); await page.getByRole("heading", { name: "Not found" }).waitFor(); note.result = { oldRecordShown: await page.getByText("Harbor Cafe (fictional)").count(), editButtons: await page.getByRole("button", { name: "Rename" }).count() }; },
    },
    {
      name: "form-stepup-recovery-fence-closes-app", path: "/clients/" + U(401),
      mock: (m, p) => (m === "PATCH" && p === "clients/" + U(401) ? err(403, "reauth_required") : p === "auth/step-up/options" ? err(503, "authorization_recovery_required") : undefined),
      act: async (page) => { await click("Change relationship")(page); await click("Save relationship")(page); await click("Use passkey")(page); await page.getByRole("heading", { name: "The admin is not open" }).waitFor(); },
    },
    {
      name: "form-stale-version-conflict", path: "/clients/" + U(401),
      mock: (m, p) => (m === "PATCH" && p === "clients/" + U(401) ? err(409, "version_changed") : undefined),
      act: async (page) => { await click("Rename")(page); await page.getByLabel("Client name").fill("Harbor Cafe and Bakery (fictional)"); await click("Save name")(page); await page.getByRole("button", { name: "Reload record" }).waitFor(); },
    },
    {
      name: "form-reauth-step-up", path: "/clients/" + U(401), webauthn: true,
      mock: (m, p, b, n) => {
        if (m === "PATCH" && p === "clients/" + U(401)) { n.ops = [...(n.ops ?? []), JSON.stringify(b)]; return n.verified ? receipt("client", U(401), "7") : err(403, "reauth_required"); }
        if (p === "auth/step-up/options") return authOptions(2);
        if (p === "auth/step-up/verify") { n.verified = true; return { status: 200, body: { schemaVersion: 1, state: "verified", requestId: U(910) } }; }
      },
      act: async (page, note, shot) => {
        await click("Change relationship")(page); await click("Save relationship")(page);
        await page.getByRole("heading", { name: "Confirm it is you" }).waitFor(); await shot("form-reauth-dialog");
        await page.keyboard.press("Escape");
        await page.getByText("Not saved yet").waitFor(); await shot("form-reauth-declined-edits-kept");
        await note.addCredential();
        await click("Confirm and save")(page);
        await page.getByRole("heading", { name: "Confirm it is you" }).waitFor();
        await click("Use passkey")(page);
        await page.getByText("Saved. The record below").first().waitFor();
        note.result = { dialogShown: true, sends: note.n.ops.length, sameOperationAndBodyAfterProof: note.n.ops.every((o) => o === note.n.ops[0]), verified: note.n.verified === true };
      },
    },
    { name: "form-rate-limited-write", path: "/clients/" + U(401), mock: (m, p) => (m === "POST" && p === "notes" ? err(429, "rate_limited", { retryAfterMs: 25000 }) : undefined), act: async (page) => { await click("Add note")(page); await page.getByRole("textbox", { name: "Note" }).fill("Fictional note."); await click("Save note")(page); await page.getByRole("button", { name: /Retry in/ }).waitFor(); } },
    { name: "form-business-conflict-open-projects", path: "/clients/" + U(401), mock: (m, p) => (m === "PATCH" && p === "clients/" + U(401) ? err(409, "open_projects") : undefined), act: async (page) => { await click("Change relationship")(page); await click("Save relationship")(page); await page.getByText("Finish or cancel").waitFor(); } },
    { name: "form-add-contact", path: "/clients/" + U(401), act: click("Add contact") },
    { name: "form-correct-contact", path: "/clients/" + U(401), act: async (page) => { await page.getByRole("button", { name: /^Correct/ }).first().click(); } },
    { name: "form-saved-success", path: "/clients/" + U(401), act: async (page) => { await click("Add note")(page); await page.getByRole("textbox", { name: "Note" }).fill("Fictional note."); await click("Save note")(page); await page.getByText("Saved. The record below").first().waitFor(); } },
    { name: "form-open-case-exists", path: "/velani/requests/" + U(301), mock: (m, p) => (m === "POST" && p === "cases" ? err(409, "case_exists") : undefined), act: async (page) => { await click("Open a case")(page); await click("Open case")(page); await page.getByText("already open").waitFor(); } },
    { name: "form-link-workplace-to-client", path: "/nevora/workplaces/" + U(101), act: async (page) => { await click("Link to a client")(page); await page.getByRole("searchbox").fill("Harbor"); await click("Search")(page); await page.getByRole("button", { name: /^Choose Harbor/ }).click(); } },
    { name: "form-case-link", path: "/cases/" + U(601), act: click("Link client and project") },
    { name: "form-edit-project", path: "/projects/" + U(501), act: click("Edit project") },
    { name: "form-writes-disabled", path: "/clients/" + U(401), mock: (m, p) => (p === "session" ? { ...session, body: { ...session.body, capabilities: { ...session.body.capabilities, internalWrites: false } } } : undefined) },
  ],
  fixtures: [
    { name: "fixtures-overview", path: "/overview", real: true, wide: true },
    { name: "fixtures-clients", path: "/clients", real: true },
    { name: "fixtures-client-profile", path: "/clients/0a5cad4b-e3d6-4d25-ad96-fa702122a97c", real: true },
    { name: "fixtures-view-without-sample", path: "/velani/requests", real: true },
  ],
};

const sizes = [
  ["1440", { width: 1440, height: 900 }],
  ["390", { width: 390, height: 844 }],
];
const exe = join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const browser = await chromium.launch({ executablePath: exe });
const results = [];

async function runOne(sc, sizeName, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  const n = {};
  const note = { n, result: null };
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR_FAILED/.test(m.text())) consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 200)));
  if (sc.webauthn) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const options = { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true };
    let current = (await cdp.send("WebAuthn.addVirtualAuthenticator", { options })).authenticatorId;
    note.addCredential = async () => {
      const { generateKeyPairSync } = await import("node:crypto");
      const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
      await cdp.send("WebAuthn.addCredential", { authenticatorId: current, credential: { credentialId: Buffer.from("fictional-credential").toString("base64"), isResidentCredential: true, rpId: "localhost", privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"), userHandle: Buffer.from("owner").toString("base64"), signCount: 0 } });
    };
    note.swapAuthenticator = async () => {
      await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: current });
      current = (await cdp.send("WebAuthn.addVirtualAuthenticator", { options })).authenticatorId;
    };
  }
  if (!sc.real)
    await page.route("**/api/admin/v1/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.slice("/api/admin/v1/".length) + url.search;
      let body;
      try { body = req.postDataJSON(); } catch { body = undefined; }
      const r = sc.mock?.(req.method(), path, body, n) ?? baseline(req.method(), path, body);
      if (r === "abort") return route.abort("connectionreset");
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      await route.fulfill({ status: r.status, headers: { "content-type": r.raw ? "text/html" : "application/json", "cache-control": "no-store", ...(r.headers ?? {}) }, body: r.raw ?? JSON.stringify(r.body) }).catch(() => {});
    });
  const shot = (name) => page.screenshot({ path: join(shots, `${name}-${sizeName}.png`), fullPage: true });
  await page.goto(base + sc.path, { waitUntil: "domcontentloaded" });
  if (sc.early) await page.locator(".loading").waitFor({ timeout: 8000 });
  else {
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    await page.locator(".loading").waitFor({ state: "detached", timeout: 8000 }).catch(() => {});
  }
  if (sc.act) { await sc.act(page, note, shot); }
  await settle(page);
  await shot(sc.name);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  results.push({ scenario: sc.name, size: sizeName, heading: (await page.locator("h1").first().textContent().catch(() => null))?.trim() ?? null, axeViolations: axe.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, target: v.nodes[0]?.target })), horizontalOverflowPx: overflow, consoleErrors, check: note.result });
  await context.close();
}

async function access() {
  const out = {};
  const mock = async (page, extra) =>
    page.route("**/api/admin/v1/**", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.slice("/api/admin/v1/".length) + url.search;
      let body;
      try { body = req.postDataJSON(); } catch { body = undefined; }
      const r = extra?.(req.method(), path) ?? baseline(req.method(), path, body);
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      await route.fulfill({ status: r.status, headers: { "content-type": "application/json" }, body: JSON.stringify(r.body) }).catch(() => {});
    });
  const focused = (page) => page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return { tag: e.tagName.toLowerCase(), text: (e.getAttribute("aria-label") || e.textContent || e.getAttribute("placeholder") || "").trim().slice(0, 40), outline: `${c.outlineStyle} ${c.outlineWidth}`, ringVisible: c.outlineStyle !== "none" && parseFloat(c.outlineWidth) >= 2 }; });
  // 1. Desktop: Tab order through skip link, rail and content, with a visible ring on each stop.
  let ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let page = await ctx.newPage();
  await mock(page);
  await page.goto(base + "/overview");
  await page.getByRole("link", { name: "Workplaces", exact: true }).first().waitFor();
  await page.locator(".tile").first().waitFor();
  // Tab forward to the first stop of the app (the skip link), then record one full pass.
  for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); if ((await focused(page)).text === "Skip to content") break; }
  const order = [await focused(page)];
  for (let i = 0; i < 16; i++) { await page.keyboard.press("Tab"); order.push(await focused(page)); if (i === 2) await page.screenshot({ path: join(shots, "access-focus-ring-rail-1440.png") }); }
  out.desktopTabOrder = order.map((o) => o.text);
  out.desktopEveryStopHasVisibleRing = order.every((o) => o.ringVisible);
  // 2. Keyboard only: create a client from the list and land on its record.
  await page.goto(base + "/clients");
  await page.getByRole("button", { name: "New client" }).waitFor();
  await page.getByRole("button", { name: "New client" }).focus();
  await page.keyboard.press("Enter");
  const inForm = await focused(page);
  await page.keyboard.type("Keyboard Test Client (fictional)");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/clients/" + U(401));
  await page.getByRole("heading", { level: 1, name: /Harbor Cafe/ }).waitFor();
  out.keyboardCreateClient = { focusMovedIntoForm: inForm.tag === "input", landedOn: new URL(page.url()).pathname, focusOnHeading: (await focused(page)).tag === "h1" };
  // 3. Keyboard only: open a detail form, cancel with the keyboard.
  await page.getByRole("button", { name: "Add note" }).focus();
  await page.keyboard.press("Enter");
  const noteFocus = await focused(page);
  await page.keyboard.press("Tab"); await page.keyboard.press("Enter");
  out.keyboardDetailForm = { focusMovedIntoForm: noteFocus.tag === "textarea", closedByKeyboard: (await page.getByRole("form").count()) === 0 };
  await ctx.close();
  // 4. Phone: menu opens and closes by keyboard, reports its state.
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await ctx.newPage();
  await mock(page);
  await page.goto(base + "/overview");
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await menu.waitFor(); await menu.focus(); await page.keyboard.press("Enter");
  const expanded = await page.locator("button[aria-controls=rail]").getAttribute("aria-expanded");
  await page.screenshot({ path: join(shots, "access-menu-open-390.png") });
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  await page.keyboard.press("Tab");
  const firstInMenu = await focused(page);
  await page.keyboard.press("Escape");
  out.phoneMenu = { expandedAfterEnter: expanded, firstStopInMenu: firstInMenu.text, closedByEscape: (await page.locator("button[aria-controls=rail]").getAttribute("aria-expanded")) === "false", axeViolationsOpen: axe.violations.map((v) => v.id) };
  // Touch targets on the phone layout.
  await page.goto(base + "/clients/" + U(401));
  await page.getByRole("button", { name: "Add note" }).waitFor();
  out.phoneSmallestTargetPx = await page.evaluate(() => Math.min(...[...document.querySelectorAll("main button, main a.btn, .topbar button")].map((e) => e.getBoundingClientRect().height)));
  await ctx.close();
  // 5. Reduced motion.
  for (const pref of ["no-preference", "reduce"]) {
    ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: pref });
    page = await ctx.newPage();
    await mock(page, (m, p) => (p === "overview" ? { delay: 3000, ...env(overview, "combined") } : undefined));
    await page.goto(base + "/overview");
    await page.locator(".skeleton").first().waitFor();
    out["skeletonAnimation:" + pref] = await page.evaluate(() => getComputedStyle(document.querySelector(".skeleton")).animationName);
    out["buttonTransition:" + pref] = await page.evaluate(() => getComputedStyle(document.querySelector(".btn")).transitionDuration);
    await ctx.close();
  }
  return out;
}
if (group === "access") {
  const out = await access();
  await browser.close();
  const file = join(here, "results.json");
  const all = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  all.access = out;
  writeFileSync(file, JSON.stringify(all, null, 1));
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
for (const sc of scenarios[group] ?? []) {
  const list = sc.wide ? [...sizes, ["1024", { width: 1024, height: 768 }]] : sizes;
  for (const [sizeName, viewport] of list) {
    try { await runOne(sc, sizeName, viewport); }
    catch (e) { results.push({ scenario: sc.name, size: sizeName, failed: String(e).slice(0, 300) }); }
  }
}
await browser.close();
const out = join(here, "results.json");
const all = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
all[group] = results;
writeFileSync(out, JSON.stringify(all, null, 1));
const bad = results.filter((r) => r.failed || r.axeViolations?.length || r.horizontalOverflowPx > 0 || r.consoleErrors?.length);
console.log(`${group}: ${results.length} captures, ${bad.length} with findings`);
for (const b of bad) console.log(JSON.stringify(b).slice(0, 600));
