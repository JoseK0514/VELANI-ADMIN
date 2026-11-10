import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { authFixture } from "./helpers/auth";
import { authenticator } from "./helpers/authenticator";
import { createHandler } from "../src/server/http";
import type { Sources } from "../src/server/sources/types";
const sources: Sources = {
  list: async () => ({ items: [], more: false }),
  get: async () => null,
  batch: async () => [],
  count: async () => 0,
};
async function fixture() {
  const f = await authFixture(),
    journal = f.journal,
    handler = createHandler({
      config: f.config,
      pool: f.db.pool,
      journal: journal.pool,
      auth: f.auth,
      sources,
    });
  const req = (path: string, options: RequestInit = {}) =>
    new Request(f.config.origin + "/api/admin/v1/" + path, options);
  return {
    ...f,
    handler,
    req,
    journal,
    close: async () => {
      await f.close();
    },
  };
}
it("keeps guests out, rejects foreign origins/CSRF and malformed bodies, and exposes no secrets", async () => {
  const f = await fixture();
  try {
    expect((await f.handler(f.req("clients"))).status).toBe(401);
    const { session, actor } = await f.login(),
      cookie = "velani_admin_test_session=" + session.token;
    const request = (body: unknown, headers: Record<string, string> = {}) =>
      f.req("clients", {
        method: "POST",
        headers: {
          cookie,
          origin: f.config.origin,
          "content-type": "application/json",
          "x-csrf-token": actor.csrf,
          ...headers,
        },
        body: JSON.stringify(body),
      });
    expect(
      (await f.handler(request({}, { origin: "https://foreign.invalid" })))
        .status,
    ).toBe(403);
    expect(
      (await f.handler(request({}, { "x-csrf-token": "wrong" }))).status,
    ).toBe(403);
    expect(
      (
        await f.handler(
          request({
            schemaVersion: 1,
            operationId: randomUUID(),
            expectedVersion: "0",
            payload: {
              displayName: "Owned",
              relationshipState: "prospect",
              role: "admin",
            },
          }),
        )
      ).status,
    ).toBe(422);
    expect((await f.handler(request("x".repeat(33000)))).status).toBe(413);
    const s = await f.handler(f.req("session", { headers: { cookie } })),
      body = await s.text();
    expect(s.headers.get("cache-control")).toContain("no-store");
    expect(body).not.toContain(session.token);
    expect(body).not.toMatch(/sessionHash|google_subject|client_secret/);
    expect(s.headers.has("access-control-allow-origin")).toBe(false);
  } finally {
    await f.close();
  }
});
it("completes real signed OIDC and two actual passkeys over HTTP with HttpOnly cookies", async () => {
  const f = await fixture();
  try {
    const start = await f.handler(f.req("auth/start")),
      flow = start.headers
        .getSetCookie()
        .find((x) => x.startsWith("velani_admin_test_flow="))!
        .split(";")[0];
    expect(start.status).toBe(302);
    const callback = await f.issuer.callback(start.headers.get("location")!),
      cb = await f.handler(
        new Request(callback, { headers: { cookie: flow } }),
      ),
      pending = cb.headers
        .getSetCookie()
        .find((x) => x.startsWith("velani_admin_test_pending="))!
        .split(";")[0];
    expect(cb.status).toBe(303);
    const post = async (path: string, body: unknown) =>
      f.handler(
        f.req(path, {
          method: "POST",
          headers: {
            cookie: pending,
            origin: f.config.origin,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
        }),
      );
    const keys = [authenticator(), authenticator()];
    for (const key of keys) {
      const o = await (await post("auth/enroll/options", {})).json();
      expect(
        (
          await post("auth/enroll/verify", {
            challengeId: o.challengeId,
            response: key.register(o.options.challenge, f.config.origin),
          })
        ).status,
      ).toBe(200);
    }
    const o = await (await post("auth/passkey/options", {})).json(),
      verified = await post("auth/passkey/verify", {
        challengeId: o.challengeId,
        response: keys[0].assert(o.options.challenge, f.config.origin),
      });
    expect(verified.status).toBe(200);
    const sessionCookie = verified.headers
      .getSetCookie()
      .find((x) => x.startsWith("velani_admin_test_session="))!;
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(await verified.text()).not.toMatch(/token|cookie|hash/);
    const response = await f.handler(
      f.req("clients", { headers: { cookie: sessionCookie.split(";")[0] } }),
    );
    expect(response.status).toBe(200);
  } finally {
    await f.close();
  }
});
it("enforces shared write limits and logs out with confirmed follow-up rejection", async () => {
  const f = await fixture();
  try {
    const { session, actor } = await f.login(),
      cookie = "velani_admin_test_session=" + session.token,
      headers = {
        cookie,
        origin: f.config.origin,
        "content-type": "application/json",
        "x-csrf-token": actor.csrf,
      };
    for (let i = 0; i < 10; i++)
      expect(
        (
          await f.handler(
            f.req("clients", {
              method: "POST",
              headers,
              body: JSON.stringify({
                schemaVersion: 1,
                operationId: randomUUID(),
                expectedVersion: "0",
                payload: {
                  displayName: "Owned",
                  relationshipState: "prospect",
                },
              }),
            }),
          )
        ).status,
      ).toBe(201);
    const limited = await f.handler(
      f.req("clients", { method: "POST", headers, body: "{}" }),
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    await f.db.pool.query("DELETE FROM admin.limits");
    expect(
      (
        await f.handler(
          f.req("logout", { method: "POST", headers, body: "{}" }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await f.handler(f.req("clients", { headers: { cookie } }))).status,
    ).toBe(401);
  } finally {
    await f.close();
  }
});
it("blocks all business routes after an unreconciled independent deletion, including replay", async () => {
  const f = await fixture();
  try {
    const { session } = await f.login();
    await f.journal.pool.query(
      "INSERT INTO admin_journal.deletions(entity_type,entity_id) VALUES('client',$1)",
      [randomUUID()],
    );
    const response = await f.handler(
      f.req("clients", {
        headers: { cookie: "velani_admin_test_session=" + session.token },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "restore_reconciliation_required" },
    });
  } finally {
    await f.close();
  }
});
it("blocks private detail disclosure if its access audit cannot commit", async () => {
  const f = await fixture();
  try {
    const { session } = await f.login(),
      id = randomUUID(),
      handler = createHandler({
        config: f.config,
        pool: f.db.pool,
        journal: f.journal.pool,
        auth: f.auth,
        sources: {
          ...sources,
          get: async () => ({
            id,
            createdAt: new Date().toISOString(),
            description: "DO_NOT_DISCLOSE",
            email: "private@example.invalid",
          }),
        },
      });
    await f.db.pool.query(
      "CREATE FUNCTION admin.reject_detail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned test'; END $$; CREATE TRIGGER reject_detail_audit BEFORE INSERT ON admin.audit FOR EACH ROW EXECUTE FUNCTION admin.reject_detail_audit()",
    );
    const response = await handler(
      f.req("velani/requests/" + id, {
        headers: { cookie: "velani_admin_test_session=" + session.token },
      }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toMatch(
      /DO_NOT_DISCLOSE|private@example|owned test/,
    );
  } finally {
    await f.close();
  }
});
