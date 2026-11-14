import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { authFixture } from "./helpers/auth";
import { BusinessService } from "../src/server/business/service";
import { publishFeed } from "../src/server/business/publish";
import { adminGrants } from "../src/server/principals";
import { createHandler } from "../src/server/http";
import { Retention } from "../src/server/retention";
import type { Sources, Item } from "../src/server/sources/types";
const sources: Sources = {
  list: async () => ({ items: [], more: false }),
  get: async () => null,
  batch: async () => [],
  count: async () => 0,
};
const ago = (days: number) =>
  new Date(Date.now() - days * 86400_000).toISOString();
const input = (
  data: unknown,
  kind = "inquiry",
  version = "0",
  operationId = randomUUID(),
  clientId: string | null = null,
  projectId: string | null = null,
) => ({
  schemaVersion: 1,
  operationId,
  expectedVersion: version,
  payload: { kind, clientId, projectId, data },
});
const inquiry = (over = {}) => ({
  channel: "email",
  reference: randomUUID(),
  title: "Owned business inquiry",
  service: "velani",
  stage: "new",
  receivedAt: ago(4),
  ...over,
});
async function fixture(source = sources) {
  const f = await authFixture(),
    login = await f.login(),
    service = new BusinessService(
      f.db.pool,
      f.config,
      source,
      new Retention(f.db.pool, f.journal.pool).guard,
    );
  const clientId = randomUUID(),
    projectId = randomUUID();
  await f.db.pool.query(
    "INSERT INTO admin.clients(id,display_name,relationship_state,engaged_at) VALUES($1,'Owned business','active',now())",
    [clientId],
  );
  await f.db.pool.query(
    "INSERT INTO admin.projects(id,client_id,name,stage,target_date) VALUES($1,$2,'Owned delivery','in_progress',current_date-1)",
    [projectId, clientId],
  );
  return { ...f, ...login, service, clientId, projectId };
}
const binding = {
  environment: "test" as const,
  financeAccountId: "acct_owned",
  healthAccountId: "control_owned",
};
const feed = (items: unknown[], over = {}) => ({
  system: "finance",
  environment: "test",
  accountId: "acct_owned",
  observedAt: new Date().toISOString(),
  validUntil: new Date(Date.now() + 600000).toISOString(),
  historyFrom: ago(90).slice(0, 10),
  historyThrough: new Date().toISOString().slice(0, 10),
  coverage: "complete",
  items,
  ...over,
});

describe("private business management", () => {
  it("publishes health only for the linked incarnation and closes qualification when the source revision changes", async () => {
    const w: Item = {
      id: randomUUID(),
      createdAt: ago(10),
      environment: "test",
      revision: "3",
      incarnation: "2",
      origin: "https://owned.example.invalid",
    };
    const f = await fixture({
      ...sources,
      list: async (kind) => ({
        items: kind === "workplaces" ? [w] : [],
        more: false,
      }),
      batch: async () => [w],
    });
    try {
      await f.db.pool.query(
        "INSERT INTO admin.source_links(id,client_id,system,environment,source_id,source_revision,incarnation) VALUES($1,$2,'nevora','test',$3,3,2)",
        [randomUUID(), f.clientId, w.id],
      );
      const item = {
        sourceId: w.id,
        clientId: f.clientId,
        sourceRevision: "3",
        incarnation: "2",
        origin: w.origin,
        stage: "setup",
        stageSince: ago(3),
        setupComplete: false,
        workerState: "failed",
        workerObservedAt: new Date().toISOString(),
      };
      const snapshot = feed([item], {
        system: "health",
        accountId: "control_owned",
      });
      await expect(
        publishFeed(f.db.pool, binding, {
          ...snapshot,
          items: [{ ...item, incarnation: "1" }],
        }),
      ).rejects.toThrow("feed_workplace_binding_mismatch");
      await expect(
        publishFeed(f.db.pool, binding, {
          ...snapshot,
          items: [
            {
              ...item,
              stageSince: new Date(Date.now() + 86400000).toISOString(),
            },
          ],
        }),
      ).rejects.toThrow("feed_future_observation");
      await publishFeed(f.db.pool, binding, snapshot);
      expect((await f.service.read(f.actor, "lifecycle")).data).toMatchObject({
        observations: [
          expect.objectContaining({ qualified: true, workerState: "failed" }),
        ],
      });
      const today = (await f.service.read(f.actor, "today")).data as {
        items: { reason: string }[];
      };
      expect(
        today.items.some((x) => x.reason.includes("Onboarding stage")),
      ).toBe(true);
      w.revision = "4";
      expect((await f.service.read(f.actor, "lifecycle")).data).toMatchObject({
        observations: [
          expect.objectContaining({
            qualified: false,
            workerState: "unknown",
            setupComplete: null,
          }),
        ],
      });
    } finally {
      await f.close();
    }
  });
  it("applies customer filtering before bounded lists and removes expired records from business reads", async () => {
    const f = await fixture();
    try {
      const original = await f.service.command(
        f.actor,
        input(inquiry(), "inquiry", "0", randomUUID(), f.clientId),
      );
      await f.db.pool.query(
        "INSERT INTO admin.business_records(id,kind,data) SELECT gen_random_uuid(),'expense',jsonb_build_object('title','Unrelated','amountMinor',1) FROM generate_series(1,1001)",
      );
      expect(
        (await f.service.read(f.actor, "customers/" + f.clientId)).data,
      ).toMatchObject({
        records: [expect.objectContaining({ id: original.entityId })],
      });
      await f.db.pool.query(
        "UPDATE admin.business_records SET expires_at=now()-interval '1 second' WHERE id=$1",
        [original.entityId],
      );
      await expect(
        f.service.read(f.actor, "records/" + original.entityId),
      ).rejects.toMatchObject({ code: "not_found" });
      expect(
        (await f.service.read(f.actor, "customers/" + f.clientId)).data,
      ).toMatchObject({ records: [] });
    } finally {
      await f.close();
    }
  });
  it("links an unassigned opportunity once at conversion without resetting its retention deadline", async () => {
    const f = await fixture();
    try {
      const data = inquiry(),
        saved = await f.service.command(f.actor, input(data));
      const before = (
        await f.db.pool.query(
          "SELECT expires_at FROM admin.business_records WHERE id=$1",
          [saved.entityId],
        )
      ).rows[0].expires_at;
      await f.service.command(
        f.actor,
        input(
          { ...data, stage: "won" },
          "inquiry",
          "1",
          randomUUID(),
          f.clientId,
          f.projectId,
        ),
        saved.entityId,
      );
      expect(
        (
          await f.db.pool.query(
            "SELECT client_id,expires_at FROM admin.business_records WHERE id=$1",
            [saved.entityId],
          )
        ).rows[0],
      ).toEqual({ client_id: f.clientId, expires_at: before });
      await expect(
        f.service.command(f.actor, input(data, "inquiry", "2"), saved.entityId),
      ).rejects.toMatchObject({ code: "business_identity_changed" });
    } finally {
      await f.close();
    }
  });
  it("refuses future actual costs and leaves finance unknown outside the published history window", async () => {
    const f = await fixture();
    try {
      await expect(
        f.service.command(
          f.actor,
          input(
            {
              title: "Future bill",
              product: "velani",
              category: "hosting",
              amountMinor: 100,
              occurredAt: new Date(Date.now() + 86400_000).toISOString(),
              evidenceReference: "Owned",
            },
            "expense",
          ),
        ),
      ).rejects.toMatchObject({ code: "future_observation" });
      const day = new Date().toISOString().slice(0, 10);
      await publishFeed(f.db.pool, binding, feed([], { historyFrom: day }));
      expect(
        (
          await f.service.read(f.actor, "finance", {
            from: ago(1).slice(0, 10),
            to: day,
          })
        ).data,
      ).toMatchObject({ metrics: null });
      expect(
        (await f.service.read(f.actor, "finance", { from: day, to: day })).data,
      ).toMatchObject({ metrics: { netCashMinor: 0 } });
    } finally {
      await f.close();
    }
  });
  it("commits concurrent replay exactly once, rejects changed replay/stale versions and never extends source expiry", async () => {
    const f = await fixture();
    try {
      const request = input(inquiry()),
        results = await Promise.all(
          [1, 2, 3].map(() => f.service.command(f.actor, request)),
        );
      expect(new Set(results.map((r) => r.entityId)).size).toBe(1);
      expect(results.filter((r) => !r.replayed)).toHaveLength(1);
      await expect(
        f.service.command(f.actor, {
          ...request,
          payload: { ...request.payload, data: inquiry() },
        }),
      ).rejects.toMatchObject({ code: "operation_changed" });
      await expect(
        f.service.command(
          f.actor,
          input(request.payload.data),
          results[0].entityId,
        ),
      ).rejects.toMatchObject({ code: "version_changed" });
      const before = (
        await f.db.pool.query(
          "SELECT expires_at FROM admin.business_records WHERE id=$1",
          [results[0].entityId],
        )
      ).rows[0];
      await f.service.command(
        f.actor,
        input(
          { ...(request.payload.data as object), stage: "qualified" },
          "inquiry",
          "1",
        ),
        results[0].entityId,
      );
      expect(
        (
          await f.db.pool.query(
            "SELECT expires_at FROM admin.business_records WHERE id=$1",
            [results[0].entityId],
          )
        ).rows[0].expires_at,
      ).toEqual(before.expires_at);
      await expect(
        f.db.pool.query(
          "UPDATE admin.business_records SET expires_at=expires_at+interval '1 day' WHERE id=$1",
          [results[0].entityId],
        ),
      ).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await f.close();
    }
  });
  it("turns recorded commitments into overdue actions and removes the reply action after an actual human reply is logged", async () => {
    const f = await fixture();
    try {
      const data = inquiry({ followUpAt: ago(1) }),
        receipt = await f.service.command(f.actor, input(data));
      const today = await f.service.read(f.actor, "today");
      expect(
        (today.data as { items: { id: string; overdue: boolean }[] }).items,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: receipt.entityId + ":reply",
            overdue: true,
          }),
          expect.objectContaining({ id: f.projectId, overdue: true }),
        ]),
      );
      await f.service.command(
        f.actor,
        input(
          { ...data, firstRespondedAt: new Date().toISOString() },
          "inquiry",
          "1",
        ),
        receipt.entityId,
      );
      const after = await f.service.read(f.actor, "today");
      expect(
        (after.data as { items: { id: string }[] }).items.some(
          (x) => x.id === receipt.entityId + ":reply",
        ),
      ).toBe(false);
      expect(
        (after.data as { items: { id: string }[] }).items.some(
          (x) => x.id === receipt.entityId + ":followup",
        ),
      ).toBe(true);
    } finally {
      await f.close();
    }
  });
  it("binds client-hub follow-ups to the original source and keeps automatic receipts distinct from human response", async () => {
    const source: Item = {
      id: randomUUID(),
      createdAt: ago(2),
      reference: "OWNED-REF",
      expiresAt: new Date(Date.now() + 5 * 86400_000).toISOString(),
      emailSubmissions: [{ state: "submitted" }],
    };
    const f = await fixture({
      ...sources,
      get: async () => source,
      list: async (kind) => ({
        items: kind === "requests" ? [source] : [],
        more: false,
      }),
    });
    try {
      const body = inquiry({
        channel: "client_hub",
        sourceRequestId: source.id,
        reference: source.reference,
        receivedAt: source.createdAt,
      });
      await expect(
        f.service.command(f.actor, input({ ...body, reference: "different" })),
      ).rejects.toMatchObject({ code: "source_changed" });
      const saved = await f.service.command(f.actor, input(body));
      const today = await f.service.read(f.actor, "today");
      expect(
        (today.data as { items: { id: string }[] }).items.some(
          (r) => r.id === saved.entityId + ":reply",
        ),
      ).toBe(true);
      expect(
        (
          await f.db.pool.query(
            "SELECT expires_at FROM admin.business_records WHERE id=$1",
            [saved.entityId],
          )
        ).rows[0].expires_at.toISOString(),
      ).toBe(source.expiresAt);
    } finally {
      await f.close();
    }
  });
  it("enforces recent factor, parent ownership and unchanged source identity", async () => {
    const f = await fixture();
    try {
      await expect(
        f.service.command(
          f.actor,
          input(
            { title: "Plan" },
            "plan",
            "0",
            randomUUID(),
            randomUUID(),
            f.projectId,
          ),
        ),
      ).rejects.toMatchObject({ code: "not_found" });
      await expect(
        f.service.command(
          f.actor,
          input(
            { title: "Plan" },
            "plan",
            "0",
            randomUUID(),
            null,
            f.projectId,
          ),
        ),
      ).rejects.toMatchObject({ code: "project_client_mismatch" });
      const saved = await f.service.command(f.actor, input(inquiry()));
      await expect(
        f.service.command(
          f.actor,
          input(inquiry(), "inquiry", "1"),
          saved.entityId,
        ),
      ).rejects.toMatchObject({ code: "business_identity_changed" });
      await f.db.pool.query(
        "UPDATE admin.sessions SET factor_at=now()-interval '6 minutes' WHERE hash=$1",
        [f.actor.sessionHash],
      );
      await expect(
        f.service.command(f.actor, input(inquiry())),
      ).rejects.toMatchObject({ code: "reauth_required" });
      await expect(f.service.read(f.actor, "records")).resolves.toMatchObject({
        state: "ready",
      });
    } finally {
      await f.close();
    }
  });
  it("joins customer work and delivery without exposing another client's records", async () => {
    const f = await fixture();
    try {
      await f.service.command(
        f.actor,
        input(
          {
            title: "Approved scope",
            scope: "Owned deliverables",
            approvedMinor: 10000,
            estimatedCostMinor: 4000,
          },
          "plan",
          "0",
          randomUUID(),
          f.clientId,
          f.projectId,
        ),
      );
      await f.service.command(
        f.actor,
        input(
          {
            title: "Delivery milestone",
            dueAt: ago(1),
            state: "waiting_client",
          },
          "milestone",
          "0",
          randomUUID(),
          f.clientId,
          f.projectId,
        ),
      );
      const c = (await f.service.read(f.actor, "customers/" + f.clientId))
        .data as { projects: unknown[]; records: unknown[] };
      expect(c.projects).toHaveLength(1);
      expect(c.records).toHaveLength(2);
      const other = randomUUID();
      await f.db.pool.query(
        "INSERT INTO admin.clients(id,display_name) VALUES($1,'Other prospect')",
        [other],
      );
      expect(
        (
          (await f.service.read(f.actor, "customers/" + other)).data as {
            records: unknown[];
          }
        ).records,
      ).toHaveLength(0);
    } finally {
      await f.close();
    }
  });
  it("keeps disconnected/stale finance unknown, publishes bound read-only facts and rejects mismatched or older feeds atomically", async () => {
    const f = await fixture();
    try {
      const day = new Date().toISOString().slice(0, 10);
      expect((await f.service.read(f.actor, "finance")).data).toMatchObject({
        metrics: null,
      });
      const inputFeed = feed([
        {
          kind: "subscription",
          sourceId: "sub_owned",
          clientId: f.clientId,
          product: "nevora",
          currency: "USD",
          monthlyMinor: 1900,
          status: "active",
          occurredAt: new Date().toISOString(),
        },
      ]);
      await expect(
        publishFeed(f.db.pool, binding, {
          ...inputFeed,
          environment: "production",
        }),
      ).rejects.toThrow("feed_binding_mismatch");
      await publishFeed(f.db.pool, binding, inputFeed);
      expect(
        (await f.service.read(f.actor, "finance", { from: day, to: day })).data,
      ).toMatchObject({ metrics: { mrrMinor: 1900 } });
      expect(await publishFeed(f.db.pool, binding, inputFeed)).toMatchObject({
        replayed: true,
      });
      await expect(
        publishFeed(f.db.pool, binding, { ...inputFeed, observedAt: ago(1) }),
      ).rejects.toThrow();
      await f.db.pool.query(
        "UPDATE admin.business_feeds SET observed_at=now()-interval '2 hours',valid_until=now()-interval '1 hour'",
      );
      expect((await f.service.read(f.actor, "finance")).data).toMatchObject({
        metrics: null,
      });
      expect(
        (
          await f.db.pool.query(
            "SELECT count(*) FROM admin.business_observations",
          )
        ).rows[0].count,
      ).toBe("1");
    } finally {
      await f.close();
    }
  });
  it("computes comparable retained populations and cost headroom with unknown contribution until both finance and reviewed cost coverage exist", async () => {
    const f = await fixture();
    try {
      await f.service.command(
        f.actor,
        input(
          inquiry({
            receivedAt: ago(1),
            firstRespondedAt: new Date().toISOString(),
            stage: "won",
          }),
          "inquiry",
          "0",
          randomUUID(),
          f.clientId,
        ),
      );
      await f.service.command(
        f.actor,
        input(
          {
            title: "Hosting",
            product: "nevora",
            category: "hosting",
            amountMinor: 500,
            occurredAt: new Date().toISOString(),
            evidenceReference: "Owned bill",
          },
          "expense",
        ),
      );
      await f.service.command(
        f.actor,
        input(
          {
            title: "Monthly budget",
            product: "nevora",
            month: new Date().toISOString().slice(0, 7),
            amountMinor: 2000,
          },
          "budget",
        ),
      );
      const month = new Date().toISOString().slice(0, 7),
        today = new Date().toISOString().slice(0, 10);
      expect(
        (
          await f.service.read(f.actor, "costs", {
            from: month + "-01",
            to: today,
          })
        ).data,
      ).toMatchObject({
        spendMinor: 500,
        budgetMinor: 2000,
        headroomMinor: 1500,
        contributionMinor: null,
      });
      const insight = (await f.service.read(f.actor, "insights")).data as {
        current: { won: number };
        fullHistoryAvailable: boolean;
      };
      expect(insight.current.won).toBe(1);
      expect(insight.fullHistoryAvailable).toBe(false);
    } finally {
      await f.close();
    }
  });
  it("shares HTTP authentication, origin/CSRF, restore fence and disabled-write behavior while refusing publication routes", async () => {
    const f = await fixture();
    try {
      const handler = createHandler(
        {
          config: f.config,
          pool: f.db.pool,
          journal: f.journal.pool,
          auth: f.auth,
          sources,
        },
        true,
      );
      const url = f.config.origin + "/api/admin/v2/business/records";
      expect((await handler(new Request(url))).status).toBe(401);
      const headers = {
        cookie: "velani_admin_test_session=" + f.session.token,
        origin: f.config.origin,
        "content-type": "application/json",
        "x-csrf-token": f.actor.csrf,
      };
      expect(
        (
          await handler(
            new Request(url, {
              method: "POST",
              headers: { ...headers, "x-csrf-token": "wrong" },
              body: JSON.stringify(input(inquiry())),
            }),
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await handler(
            new Request(url.replace("records", "publish"), {
              method: "POST",
              headers,
              body: "{}",
            }),
          )
        ).status,
      ).toBe(404);
      f.config.writesEnabled = false;
      expect(
        (
          await handler(
            new Request(url, {
              method: "POST",
              headers,
              body: JSON.stringify(input(inquiry())),
            }),
          )
        ).status,
      ).toBe(503);
      await f.journal.pool.query(
        "UPDATE admin_journal.authorization_state SET recovery_pending=true",
      );
      expect((await handler(new Request(url, { headers }))).status).toBe(503);
    } finally {
      await f.close();
    }
  });
  it("gives the web role read-only observation grants and no provider publication authority", async () => {
    const f = await fixture(),
      suffix = randomUUID().replaceAll("-", "").slice(0, 12),
      web = "velani_admin_web_" + suffix,
      maintenance = "velani_admin_maintenance_" + suffix;
    try {
      await f.db.pool.query(`CREATE ROLE ${web}; CREATE ROLE ${maintenance}`);
      for (const statement of adminGrants(web, maintenance))
        await f.db.pool.query(statement);
      const c = await f.db.pool.connect();
      try {
        await c.query(`SET ROLE ${web}`);
        await expect(
          c.query("SELECT * FROM admin.business_observations"),
        ).resolves.toBeTruthy();
        await expect(
          c.query("DELETE FROM admin.business_feeds"),
        ).rejects.toMatchObject({ code: "42501" });
        await expect(
          c.query(
            "UPDATE admin.business_feeds SET provenance='provider_verified'",
          ),
        ).rejects.toMatchObject({ code: "42501" });
      } finally {
        await c.query("RESET ROLE");
        c.release();
      }
    } finally {
      await f.close();
    }
  });
});
