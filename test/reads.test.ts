import { expect, it } from "vitest";
import { authFixture } from "./helpers/auth";
import type { Sources } from "../src/server/sources/types";
import { ReadService, catalogAccess } from "../src/server/reads";
const unavailable: Sources = {
  list: async () => {
    throw Error();
  },
  get: async () => {
    throw Error();
  },
  batch: async () => {
    throw Error();
  },
  count: async () => {
    throw Error();
  },
};
it("fails total source outage instead of displaying zero and preserves unavailable revenue", async () => {
  const f = await authFixture();
  try {
    const { actor } = await f.login(),
      r = new ReadService(f.db.pool, f.config, unavailable);
    await expect(r.execute(actor, "overview")).rejects.toMatchObject({
      status: 503,
    });
    const partial = new ReadService(f.db.pool, f.config, {
      ...unavailable,
      count: async (k) => {
        if (k === "requests") return 0;
        throw Error();
      },
    });
    const result = await partial.execute(actor, "overview");
    expect(result).toMatchObject({
      state: "partial",
      data: {
        workplaces: { state: "unavailable", data: null },
        requests: { data: { count: 0 } },
        revenue: { value: null, reason: "live_billing_not_verified" },
      },
    });
  } finally {
    await f.close();
  }
});
it("never grants current setup/headcount/worker or current-owner proof from enrollment", () => {
  const now = Date.now(),
    base = {
      id: "x",
      createdAt: new Date(now).toISOString(),
      observedAt: new Date(now).toISOString(),
      trialEndsAt: new Date(now + 86400000).toISOString(),
    };
  expect(catalogAccess(base, now)).toBe("trial");
  expect(
    catalogAccess(
      { ...base, observedAt: new Date(now - 600000).toISOString() },
      now,
    ),
  ).toBe("unknown");
  expect(catalogAccess(null)).toBe("unknown");
});
it("rejects unknown list filters and unauthenticated/disabled reads", async () => {
  const f = await authFixture();
  try {
    const { actor } = await f.login(),
      r = new ReadService(f.db.pool, f.config, unavailable);
    await expect(
      r.execute(actor, "clients", { sql: "anything" }),
    ).rejects.toMatchObject({ status: 400 });
    await f.db.pool.query("UPDATE admin.actors SET enabled=false");
    await expect(r.execute(actor, "clients")).rejects.toMatchObject({
      status: 401,
    });
  } finally {
    await f.close();
  }
});
it("paginates safe activity and attributes personal detail reads to the authenticated actor", async () => {
  const f = await authFixture();
  try {
    const { actor } = await f.login(),
      r = new ReadService(f.db.pool, f.config, unavailable);
    await f.db.pool.query(
      "INSERT INTO admin.clients(id,display_name) VALUES('016e0187-e95b-4cf8-bd27-25db26920a30','Owned')",
    );
    await r.execute(
      actor,
      "clients",
      {},
      "016e0187-e95b-4cf8-bd27-25db26920a30",
    );
    expect(
      (
        await f.db.pool.query(
          "SELECT actor_id FROM admin.audit WHERE action='detail_viewed'",
        )
      ).rows[0].actor_id,
    ).toBe(actor.id);
    const page = (await r.execute(actor, "activity", { limit: 1 })) as {
      data: { items: unknown[]; nextCursor: string };
    };
    expect(page.data.items).toHaveLength(1);
    expect(page.data.nextCursor).toBeTruthy();
    const next = (await r.execute(actor, "activity", {
      limit: 1,
      cursor: page.data.nextCursor,
    })) as { data: { items: unknown[] } };
    expect(next.data.items).toHaveLength(1);
  } finally {
    await f.close();
  }
});
it("traverses every row across sub-millisecond and equal-timestamp cursor boundaries", async () => {
  const f = await authFixture();
  try {
    const { actor } = await f.login(),
      r = new ReadService(f.db.pool, f.config, unavailable),
      ids = [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
        "00000000-0000-4000-8000-000000000003",
      ];
    await f.db.pool.query(
      "INSERT INTO admin.clients(id,display_name,created_at,prospect_expires_at) VALUES($1,'Older',date_trunc('second',statement_timestamp())-interval '1 minute'+interval '0.123100 second',statement_timestamp()+interval '1 day'),($2,'Newer',date_trunc('second',statement_timestamp())-interval '1 minute'+interval '0.123900 second',statement_timestamp()+interval '1 day'),($3,'Same time',date_trunc('second',statement_timestamp())-interval '1 minute'+interval '0.123900 second',statement_timestamp()+interval '1 day')",
      ids,
    );
    let cursor: string | undefined;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      const page = (await r.execute(actor, "clients", {
        limit: 1,
        ...(cursor ? { cursor } : {}),
      })) as { data: { items: { id: string }[]; nextCursor: string | null } };
      seen.push(...page.data.items.map((x) => x.id));
      cursor = page.data.nextCursor ?? undefined;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen)).toEqual(new Set(ids));
  } finally {
    await f.close();
  }
});
it.each(["trial", "paid"])(
  "treats a different catalog incarnation as unknown, even for fresh %s evidence",
  async (entitlement) => {
    const f = await authFixture();
    try {
      const { actor } = await f.login(),
        id = "10902c3d-abde-4eaa-814c-5409a06111f1",
        now = new Date().toISOString(),
        w = { id, createdAt: now, environment: "test", incarnation: "2" },
        cat = {
          ...w,
          incarnation: "1",
          observedAt: now,
          [entitlement === "paid" ? "paidThrough" : "trialEndsAt"]: new Date(
            Date.now() + 86400000,
          ).toISOString(),
        };
      const s: Sources = {
        ...unavailable,
        list: async () => ({ items: [w], more: false }),
        batch: async () => [cat],
      };
      const result = (await new ReadService(f.db.pool, f.config, s).execute(
        actor,
        "nevora/workplaces",
      )) as {
        state: string;
        data: { items: { catalog: { access: string } }[] };
      };
      expect(result.state).toBe("partial");
      expect(result.data.items[0].catalog.access).toBe("unknown");
    } finally {
      await f.close();
    }
  },
);
it.each(["missing", "subset", "orphan", "incarnation", "verified_empty"])(
  "qualifies trial metric coverage: %s",
  async (scenario) => {
    const f = await authFixture();
    try {
      const { actor } = await f.login(),
        now = new Date().toISOString(),
        ids = [
          "10902c3d-abde-4eaa-814c-5409a06111f1",
          "10902c3d-abde-4eaa-814c-5409a06111f2",
        ],
        ws =
          scenario === "verified_empty"
            ? []
            : ids.map((id) => ({
                id,
                createdAt: now,
                environment: "test",
                incarnation: "2",
              })),
        catalog =
          scenario === "missing" || scenario === "verified_empty"
            ? []
            : scenario === "subset"
              ? [ws[0]]
              : scenario === "orphan"
                ? [
                    ...ws,
                    { ...ws[0], id: "10902c3d-abde-4eaa-814c-5409a06111f3" },
                  ]
                : ws.map((x) => ({ ...x, incarnation: "1" }));
      const s: Sources = {
        ...unavailable,
        count: async (k) => (k === "workplaces" ? ws.length : 0),
        list: async (k) => ({
          items: (k === "catalog" ? catalog : ws).map((x) => ({
            ...x,
            observedAt: now,
            trialEndsAt: new Date(Date.now() + 86400000).toISOString(),
          })),
          more: false,
        }),
      };
      const result = (await new ReadService(f.db.pool, f.config, s).execute(
        actor,
        "overview",
      )) as { state: string; data: { trials: { value: number | null } } };
      expect(result.data.trials.value).toBe(
        scenario === "verified_empty" ? 0 : null,
      );
      expect(result.state).toBe(
        scenario === "verified_empty" ? "ready" : "partial",
      );
    } finally {
      await f.close();
    }
  },
);
