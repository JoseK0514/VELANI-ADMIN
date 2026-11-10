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
