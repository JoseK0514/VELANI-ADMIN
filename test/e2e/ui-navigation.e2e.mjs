// Browser test with real Next.js navigation.
//   Production build: npm run build && npm run test:e2e
//   Development server: npm run test:e2e:dev
//
// Starts the production build, answers /api/admin/v1 inside the browser with
// fictional contract-shaped responses, and checks that a save whose response
// was lost keeps its operation ID and exact body across real sidebar <Link>
// navigation away and back. Also checks the writes-disabled state.
//
// Playwright is not a dependency of this repository. Point ADMIN_E2E_PLAYWRIGHT
// at any package.json whose node_modules has playwright and @axe-core/playwright,
// and ADMIN_E2E_CHROMIUM at a Chromium binary, or use the local defaults below.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(
  process.env.ADMIN_E2E_PLAYWRIGHT ?? "/Users/josek0514/Desktop/VELANI-SHOPIFY-WEBSITE/package.json",
);
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const executablePath =
  process.env.ADMIN_E2E_CHROMIUM ??
  join(homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell");
const mode = process.argv.includes("--dev") ? "dev" : "start";
if (mode === "start" && !existsSync(join(".next", "BUILD_ID"))) throw new Error("Run `npm run build` first.");
const shots = process.env.ADMIN_E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

const CLIENT = "00000000-0000-4000-8000-000000000401";
const PROJECT = "00000000-0000-4000-8000-000000000501";
const source = { system: "admin", environment: "test", observedAt: "2026-11-12T14:05:00.000Z", freshness: "fresh", coverage: "complete" };
const read = (data) => ({ status: 200, body: { schemaVersion: 1, state: "ready", data, source, requestId: "r" } });
const row = { id: CLIENT, displayName: "Harbor Cafe (fictional)", relationshipState: "active", version: "6", createdAt: "2026-10-03T14:00:00Z", engagedAt: "2026-10-05T14:00:00Z", closedAt: null, deleteAfter: null, prospectExpiresAt: null };
const session = (internalWrites) => ({ status: 200, body: { schemaVersion: 1, state: "authenticated", actor: { id: "a", email: "owner@velani.example", role: "platform_owner" }, environment: "test", session: { expiresAt: "x", idleExpiresAt: "x", factorAt: "x" }, csrfToken: "fictional-csrf", capabilities: { viewInternalFixtures: true, internalWrites, customerActions: false }, requestId: "r" } });

const port = await new Promise((resolve, reject) => {
  const s = createServer();
  s.once("error", reject);
  s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); });
});
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", mode, "--hostname", "localhost", "--port", String(port)], { env: { ...process.env, ADMIN_ENABLED: "false" }, stdio: "ignore" });
let browser;
const results = [];
try {
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(origin + "/health")).ok) break; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath });

  async function start(viewport, internalWrites, log) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.route("**/api/admin/v1/**", async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname.replace("/api/admin/v1/", "");
      const method = request.method();
      log.push({ method, path, body: request.postData() });
      if (method === "POST" && path === "projects") {
        // The first answer is lost on the way back. The second is the replay receipt.
        if (log.filter((l) => l.method === "POST" && l.path === "projects").length === 1) return route.abort("connectionreset");
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schemaVersion: 1, state: "saved", receipt: { operationId: JSON.parse(request.postData()).operationId, entityType: "project", entityId: PROJECT, version: "1", replayed: true }, requestId: "r" }) });
      }
      const reply =
        path === "session" ? session(internalWrites)
        : path === "clients" ? read({ items: [row], nextCursor: null })
        : path === "clients/" + CLIENT ? read({ ...row, contacts: [], sourceLinks: [], notes: [] })
        : path === "projects/" + PROJECT ? read({ id: PROJECT, clientId: CLIENT, name: "Online ordering page", stage: "planned", targetDate: null, version: "1", createdAt: "2026-11-12T14:05:00Z", notes: [] })
        : path === "integrations" ? read({ sources: [], retention: { lastSuccessAt: null, removedClients: null, removedCases: null }, rondoLeads: { state: "disabled" }, liveBilling: { state: "unavailable" }, companySummaries: { state: "not_supported" } })
        : { status: 404, body: { schemaVersion: 1, error: { code: "not_found" }, requestId: "r" } };
      await route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
    });
    return { context, page };
  }
  /** Clicks a sidebar link. On a phone the sidebar is behind the Menu button. */
  async function sidebar(page, name) {
    const menu = page.getByRole("button", { name: "Menu", exact: true });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name, exact: true }).click();
  }
  const axe = async (page) => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze()).violations.map((v) => v.id);

  for (const [size, viewport] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844 }]]) {
    // Test: a lost save keeps its operation ID and body across real sidebar navigation.
    const log = [];
    const { context, page } = await start(viewport, true, log);
    await page.goto(`${origin}/clients/${CLIENT}`);
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Project name").fill("Online ordering page");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("button", { name: "Retry the same save" }).waitFor();
    // A marker on window proves the next steps are client navigation, not a page load.
    await page.evaluate(() => { window.__sameDocument = true; });
    // Development double-runs mount effects, so count from here, not from zero.
    const sessionChecksBefore = log.filter((l) => l.path === "session").length;

    await sidebar(page, "Integrations");
    await page.waitForURL("**/integrations");
    await page.getByRole("heading", { level: 1, name: "Integrations" }).waitFor();
    assert.equal(await page.getByText("New project").count(), 0, "the form is not shown on another section");

    await sidebar(page, "Clients");
    await page.waitForURL("**/clients");
    await page.getByRole("link", { name: "Harbor Cafe (fictional)" }).click();
    await page.waitForURL("**/clients/" + CLIENT);
    await page.getByText("has no answer yet").waitFor();
    assert.equal(await page.evaluate(() => window.__sameDocument), true, "navigation stayed in one document");
    if (shots) await page.screenshot({ path: join(shots, `e2e-pending-after-navigation-${size}.png`), fullPage: true });
    const violations = await axe(page);

    await page.getByRole("button", { name: /^Review/ }).click();
    assert.equal(await page.getByLabel("Project name").inputValue(), "Online ordering page", "typed input is still there");
    assert.equal(await page.getByRole("button", { name: "Create project" }).count(), 0, "no way to start a second create");
    await page.getByRole("button", { name: "Retry the same save" }).click();
    await page.waitForURL("**/projects/" + PROJECT);
    await page.getByRole("heading", { level: 1, name: "Online ordering page" }).waitFor();

    const posts = log.filter((l) => l.method === "POST" && l.path === "projects");
    assert.equal(posts.length, 2, "exactly two sends");
    assert.equal(posts[1].body, posts[0].body, "identical operation ID and body, byte for byte");
    const first = JSON.parse(posts[0].body);
    assert.match(first.operationId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(first.payload, { clientId: CLIENT, name: "Online ordering page", stage: "planned", targetDate: null });
    const sessionChecksAfter = log.filter((l) => l.path === "session").length;
    assert.equal(sessionChecksAfter, sessionChecksBefore, "the app and its sign-in gate were not mounted again by navigation");
    assert.deepEqual(violations, [], "axe");
    await sidebar(page, "Clients");
    await page.getByRole("link", { name: "Harbor Cafe (fictional)" }).click();
    await page.getByRole("button", { name: "New project" }).waitFor();
    assert.equal(await page.getByText("has no answer yet").count(), 0, "resolved command is gone");
    results.push({ test: "pending operation survives real sidebar navigation", mode, size, operationId: first.operationId, sends: posts.length, identical: true, sessionChecksDuringNavigation: sessionChecksAfter - sessionChecksBefore, axe: violations.length });
    await context.close();

    // Test: writes disabled (session capabilities.internalWrites false).
    const offLog = [];
    const off = await start(viewport, false, offLog);
    await off.page.goto(`${origin}/clients`);
    const create = off.page.getByRole("button", { name: "New client" });
    await create.waitFor();
    assert.equal(await create.isDisabled(), true);
    await off.page.getByText("Saving is turned off in this environment.").waitFor();
    await off.page.getByRole("link", { name: "Harbor Cafe (fictional)" }).click();
    await off.page.getByRole("heading", { level: 1, name: /Harbor Cafe/ }).waitFor();
    for (const name of ["New project", "Add contact", "Add note", "Rename", "Change relationship"])
      assert.equal(await off.page.getByRole("button", { name, exact: true }).isDisabled(), true, name + " is unavailable");
    await off.page.getByText("Saving is turned off in this environment.").waitFor();
    if (shots) await off.page.screenshot({ path: join(shots, `e2e-writes-disabled-${size}.png`), fullPage: true });
    const offViolations = await axe(off.page);
    assert.deepEqual(offViolations, [], "axe");
    assert.equal(offLog.filter((l) => l.method !== "GET").length, 0, "nothing was sent");
    results.push({ test: "writes disabled shows unavailable save controls with an explanation", mode, size, commandsSent: 0, axe: offViolations.length });
    await off.context.close();
  }
  console.log(JSON.stringify(results, null, 1));
  console.log(`ui-navigation e2e (next ${mode}): ${results.length} passed`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
