// Actual production Next UI with explicitly fictional API fixtures.
// Backend authority, PostgreSQL transactions and source validation are tested separately.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { mkdirSync } from "node:fs";
const require = createRequire(
  process.env.ADMIN_E2E_PLAYWRIGHT ??
    "/workspace/VELANI-SHOPIFY-WEBSITE/package.json",
);
const { chromium } = require("playwright");
const { AxeBuilder } = require("@axe-core/playwright");
const CLIENT = "00000000-0000-4000-8000-000000000401",
  PROJECT = "00000000-0000-4000-8000-000000000501";
const source = {
  system: "business",
  environment: "test",
  observedAt: new Date().toISOString(),
  freshness: "fresh",
  coverage: "partial",
};
const read = (data) => ({
  schemaVersion: 1,
  state: "partial",
  data,
  source: { ...source, observedAt: new Date().toISOString() },
  requestId: "fictional",
});
const feed = {
  state: "ready",
  coverage: "complete",
  provenance: "operator_recorded",
  observedAt: source.observedAt,
  validUntil: new Date(Date.now() + 600000).toISOString(),
};
const metrics = {
  mrrMinor: 1900,
  receivablesMinor: 8000,
  overdueMinor: 8000,
  grossCashMinor: 2000,
  refundsMinor: 500,
  netCashMinor: 1500,
};
const port = await new Promise((resolve) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => resolve(port));
  });
});
const origin = `http://localhost:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "localhost",
    "--port",
    String(port),
  ],
  { env: { ...process.env, ADMIN_ENABLED: "false" }, stdio: "ignore" },
);
const shots = process.env.ADMIN_E2E_SHOTS;
if (shots) mkdirSync(shots, { recursive: true });
let browser;
try {
  let ready = false;
  for (let i = 0; i < 300; i++) {
    try {
      ready = (await fetch(origin + "/health")).ok;
    } catch {}
    if (ready) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(ready, "Next started");
  browser = await chromium.launch({
    executablePath: process.env.ADMIN_E2E_CHROMIUM ?? "/usr/bin/chromium",
  });
  const results = [];
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(15000);
    const hubSource = {
      id: crypto.randomUUID(),
      reference: "HUB-FICTIONAL",
      createdAt:
        new Date(Date.now() - 86400000).toISOString().slice(0, 10) +
        "T12:34:56.789Z",
    };
    const records = [],
      sends = [],
      errors = [];
    let financeReady = false,
      loseFirst = true;
    page.on("pageerror", (e) => errors.push(e.message));
    const finance = [
      {
        sourceId: "invoice:fictional",
        kind: "invoice",
        clientId: CLIENT,
        product: "velani",
        currency: "USD",
        totalMinor: 10000,
        paidMinor: 2000,
        status: "open",
        occurredAt: source.observedAt,
      },
    ];
    const projects = [
      {
        id: PROJECT,
        clientId: CLIENT,
        name: "Fictional launch",
        stage: "in_progress",
        targetDate: source.observedAt,
        createdAt: source.observedAt,
      },
    ];
    const health = [
      {
        sourceId: PROJECT,
        origin: "https://fictional.example.invalid",
        stage: "setup",
        stageSince: new Date(Date.now() - 3 * 86400000).toISOString(),
        setupComplete: false,
        firstUsedAt: null,
        workerState: "failed",
        workerObservedAt: source.observedAt,
        qualified: true,
        restrictionReason: "",
      },
    ];
    await page.route("**/api/admin/**", async (route) => {
      const request = route.request(),
        url = new URL(request.url()),
        path = url.pathname.replace(/^\/api\/admin\/v[12]\//, ""),
        method = request.method();
      let body;
      if (path === "session")
        body = {
          schemaVersion: 1,
          state: "authenticated",
          actor: {
            id: "fictional-owner",
            email: "owner@example.invalid",
            role: "platform_owner",
          },
          environment: "test",
          session: { expiresAt: "x", idleExpiresAt: "x", factorAt: "x" },
          csrfToken: "fictional",
          capabilities: {
            viewInternalFixtures: true,
            internalWrites: true,
            customerActions: false,
          },
          requestId: "fictional",
        };
      else if (path === "search")
        body = read({
          items:
            JSON.parse(request.postData()).entity === "project"
              ? projects
              : [{ id: CLIENT, displayName: "Fictional cafe" }],
        });
      else if (/^business\/records/.test(path) && method !== "GET") {
        assert.equal(
          url.pathname.startsWith("/api/admin/v2/"),
          true,
          "business command uses v2",
        );
        const raw = request.postData(),
          command = JSON.parse(raw);
        sends.push({ path, raw, command });
        let record = records.find((r) => r.operationId === command.operationId);
        const target = path.split("/")[2];
        if (!record) {
          record = target
            ? records.find((r) => r.id === target)
            : {
                id: crypto.randomUUID(),
                createdAt: new Date().toISOString(),
                version: "0",
              };
          assert.ok(record);
          assert.equal(record.version, command.expectedVersion);
          Object.assign(record, command.payload, {
            operationId: command.operationId,
            version: String(Number(record.version) + 1),
          });
          if (!target) records.push(record);
        }
        if (loseFirst && command.payload.kind === "inquiry") {
          loseFirst = false;
          return route.abort("connectionreset");
        }
        body = {
          schemaVersion: 1,
          state: "saved",
          receipt: {
            operationId: command.operationId,
            entityType: "business_" + record.kind,
            entityId: record.id,
            version: record.version,
            replayed:
              sends.filter((s) => s.command.operationId === command.operationId)
                .length > 1,
          },
          requestId: "fictional",
        };
      } else if (path === "business/intake")
        body = read({
          records: records.filter((r) => r.kind === "inquiry"),
          sourceRequests: [hubSource],
          feeds: {},
        });
      else if (path === "business/records") body = read({ items: records });
      else if (path === "business/today")
        body = read({
          items: records
            .filter((r) => r.kind === "inquiry" && !r.data.firstRespondedAt)
            .map((r) => ({
              id: r.id,
              title: r.data.title,
              reason: "Human reply not recorded",
              dueAt: r.data.receivedAt,
              overdue: false,
              href: "/business/intake?record=" + r.id,
            })),
          note: "Fictional queue",
          feeds: {},
        });
      else if (path === "business/finance")
        body = read({
          metrics: financeReady ? metrics : null,
          items: financeReady ? finance : [],
          byProduct: [
            { product: "velani", metrics: financeReady ? metrics : null },
          ],
          feeds: {
            finance: financeReady
              ? feed
              : { state: "unavailable", coverage: "unknown" },
          },
        });
      else if (path === "business/lifecycle")
        body = read({
          observations: health,
          workplaces: [],
          registrations: [],
          sourceCoverage: "partial",
          definitions: "Fictional aggregate observations; no workforce data.",
          feeds: { health: feed },
        });
      else if (path === "business/costs")
        body = read({
          expenses: records.filter((r) => r.kind === "expense"),
          budgets: records.filter((r) => r.kind === "budget"),
          spendMinor: 500,
          budgetMinor: 2000,
          headroomMinor: 1500,
          contributionMinor: null,
          supportMinutes: 30,
          basis: "Operator-recorded fictional costs",
          feeds: {},
        });
      else if (path === "business/insights")
        body = read({
          current: {
            inquiries: 1,
            qualified: 0,
            won: 0,
            lost: 0,
            replied: 1,
            repliedOnTime: 1,
          },
          previous: { inquiries: 0 },
          daily: [{ day: "2026-11-13", inquiries: 1, won: 0 }],
          byChannel: [
            { channel: "email", inquiries: 1, won: 0, repliedOnTime: 1 },
          ],
          population: "Retained fictional records; incomplete history",
          lifecycle: {
            current: { activated: 1 },
            previous: { activated: 0 },
            population:
              "Currently retained workplaces; historical retention unknown.",
          },
          feeds: {},
        });
      else if (path === "business/coverage")
        body = read({
          channels: [
            {
              channel: "client_hub",
              mode: "source_read",
              state: "unavailable",
            },
            {
              channel: "email",
              mode: "operator_logged",
              state: "manual_coverage_only",
            },
          ],
          note: "Manual logging does not import a mailbox.",
          feeds: {},
        });
      else if (path === "business/customers/" + CLIENT)
        body = read({
          client: {
            id: CLIENT,
            displayName: "Fictional cafe",
            state: "active",
          },
          records: records.filter((r) => r.clientId === CLIENT),
          projects,
          cases: [],
          finance,
          financialMetrics: metrics,
          health,
          feeds: { finance: feed, health: feed },
        });
      else body = read({ items: [] });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    });
    const open = async (path, heading) => {
      await page.goto(origin + "/business/" + path);
      await page
        .getByRole("heading", { name: heading, level: 1, exact: true })
        .waitFor();
      await page
        .getByText("Missing records or an unconnected source")
        .waitFor();
    };
    const sidebar = async (name) => {
      const menu = page.getByRole("button", { name: "Menu", exact: true });
      if (await menu.isVisible()) await menu.click();
      await page
        .getByRole("navigation", { name: "Admin sections" })
        .getByRole("link", { name, exact: true })
        .click();
    };
    await open("intake", "Inquiries and pipeline");
    await page
      .getByRole("button", { name: "New inquiry", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Fictional inquiry");
    await page
      .getByLabel("Source channel", { exact: true })
      .selectOption("email");
    await page
      .getByLabel("Source reference", { exact: true })
      .fill("MAIL-FICTIONAL-1");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry the same save", exact: true })
      .waitFor();
    await sidebar("Today");
    await page.waitForURL("**/business/today");
    assert.equal(
      await page
        .getByRole("button", { name: "Retry the same save", exact: true })
        .count(),
      0,
    );
    await sidebar("Inquiries and pipeline");
    await page.waitForURL("**/business/intake");
    await page.getByRole("button", { name: /^Review/ }).click();
    await page
      .getByRole("button", { name: "Retry the same save", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fictional inquiry", exact: true })
      .waitFor();
    assert.equal(sends.length, 2);
    assert.equal(
      sends[0].raw,
      sends[1].raw,
      "lost reply retries identical operation/body across navigation",
    );
    await page
      .getByRole("button", { name: "Fictional inquiry", exact: true })
      .click();
    await page
      .getByLabel("First human reply")
      .fill(new Date().toISOString().slice(0, 16));
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fictional inquiry", exact: true })
      .waitFor();
    assert.equal(sends.at(-1).command.expectedVersion, "1");
    await open("today", "Today");
    assert.equal(
      await page
        .getByRole("link", { name: "Fictional inquiry", exact: true })
        .count(),
      0,
    );
    await open("delivery", "Delivery and milestones");
    await page
      .getByRole("button", { name: "New delivery plan", exact: true })
      .click();
    await page.getByLabel("Title", { exact: true }).fill("Fictional delivery");
    const projectPicker = page.getByRole("group", {
      name: "Project",
      exact: true,
    });
    await projectPicker.getByRole("searchbox").fill("Fictional");
    await projectPicker
      .getByRole("button", { name: "Search", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Choose Fictional launch", exact: true })
      .click();
    await page.getByLabel("Approved scope").fill("One approved service page");
    await page.getByLabel("Approved project value").fill("250.50");
    await page.getByLabel("Estimated delivery cost").fill("100");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByText("One approved service page", { exact: true })
      .waitFor();
    assert.equal(sends.at(-1).command.payload.data.approvedMinor, 25050);
    assert.equal(sends.at(-1).command.payload.clientId, CLIENT);
    await open("costs", "Costs and budgets");
    await page.getByRole("button", { name: "New cost", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Fictional hosting");
    await page.getByLabel("Recorded cost", { exact: true }).fill("5");
    await page
      .getByLabel("Bill or internal calculation reference", { exact: true })
      .fill("BILL-FICTIONAL");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fictional hosting", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "New budget", exact: true }).click();
    await page
      .getByLabel("Title", { exact: true })
      .fill("Fictional monthly budget");
    await page.getByLabel("Monthly budget", { exact: true }).fill("20");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Fictional monthly budget", exact: true })
      .waitFor();
    await open("finance", "Money");
    assert.equal(
      (await page.getByText("Unknown", { exact: true }).count()) >= 6,
      true,
    );
    financeReady = true;
    await page.reload();
    await page.getByText("$19.00", { exact: true }).waitFor();
    await open("intake", "Inquiries and pipeline");
    await page
      .getByRole("button", { name: "Track inquiry", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("button", { name: "HUB-FICTIONAL", exact: true })
      .waitFor();
    assert.equal(
      sends.at(-1).command.payload.data.receivedAt,
      hubSource.createdAt,
      "source tracking preserves seconds and milliseconds exactly",
    );
    assert.equal(
      sends.at(-1).command.payload.data.reference,
      hubSource.reference,
    );
    assert.equal(
      sends.at(-1).command.payload.data.sourceRequestId,
      hubSource.id,
    );
    const checks = [
      ["today", "Today"],
      ["intake", "Inquiries and pipeline"],
      ["delivery", "Delivery and milestones"],
      ["finance", "Money"],
      ["lifecycle", "NEVORA customer health"],
      ["costs", "Costs and budgets"],
      ["insights", "Business insights"],
      ["coverage", "Source coverage"],
      ["customers/" + CLIENT, "Customer business summary"],
    ];
    for (const [path, heading] of checks) {
      await open(path, heading);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      assert.equal(overflow, false, path + ": no document horizontal overflow");
      const violations = (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations;
      assert.deepEqual(
        violations.map((v) => ({
          id: v.id,
          nodes: v.nodes.map((n) => n.target),
        })),
        [],
        path + ": axe",
      );
      if (shots && ["today", "delivery", "customers/" + CLIENT].includes(path))
        await page.screenshot({
          path: `${shots}/business-${path.split("/")[0]}-${width}.png`,
          fullPage: true,
        });
    }
    assert.deepEqual(errors, [], "no browser runtime errors");
    results.push({
      width,
      screens: checks.length,
      commands: sends.length,
      replayIdentical: true,
      axeViolations: 0,
      documentOverflow: false,
      runtimeErrors: 0,
      data: "fictional API fixtures",
    });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
