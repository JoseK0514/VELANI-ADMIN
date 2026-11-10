import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { authFixture } from "./helpers/auth";
import { sourceFixture } from "./helpers/source";
import { PostgresSources } from "../src/server/sources/postgres";
import { createHandler } from "../src/server/http";
it("qualifies the private workflow using real source readers, cryptographic login, journal and HTTP commands", async () => {
  const f = await authFixture(),
    j = f.journal,
    v = await sourceFixture("velani"),
    c = await sourceFixture("control"),
    b = await sourceFixture("catalog");
  try {
    const id = randomUUID();
    await v.db.pool.query(
      "INSERT INTO public.client_hub_requests VALUES($1,'VEL-2611-0001',$2,now(),now()+interval '88 days','EXCLUDED')",
      [
        id,
        {
          type: "new_work",
          name: "Fictional Contact",
          email: "fictional@example.invalid",
          company: "Fictional Café",
          project: "Fictional website",
          description:
            "Fictional source message; do not copy into admin storage.",
          urgency: null,
          language: "en",
        },
      ],
    );
    const sources = new PostgresSources(
        { control: c.config, catalog: b.config, velani: v.config },
        { control: c.pool, catalog: b.pool, velani: v.pool },
      ),
      { session, actor } = await f.login(),
      handle = createHandler({
        config: f.config,
        pool: f.db.pool,
        journal: j.pool,
        auth: f.auth,
        sources,
      }),
      events: unknown[] = [];
    const get = async (path: string) => {
      const r = await handle(
        new Request(f.config.origin + "/api/admin/v1/" + path, {
          headers: { cookie: "velani_admin_test_session=" + session.token },
        }),
      );
      expect(r.status).toBe(200);
      return r.json();
    };
    const send = async (
      path: string,
      payload: unknown,
      version = "0",
      method = "POST",
    ) => {
      const operationId = randomUUID(),
        r = await handle(
          new Request(f.config.origin + "/api/admin/v1/" + path, {
            method,
            headers: {
              cookie: "velani_admin_test_session=" + session.token,
              origin: f.config.origin,
              "content-type": "application/json",
              "x-csrf-token": actor.csrf,
            },
            body: JSON.stringify({
              schemaVersion: 1,
              operationId,
              expectedVersion: version,
              payload,
            }),
          }),
        );
      const body = await r.json();
      expect([200, 201]).toContain(r.status);
      expect(body.receipt.operationId).toBe(operationId);
      events.push({ path, method, status: r.status, body });
      return body.receipt;
    };
    const client = await send("clients", {
        displayName: "Fictional Qualification Café",
        relationshipState: "prospect",
      }),
      contact = await send(
        "clients/" + client.entityId + "/contacts",
        {
          name: "Fictional Contact",
          email: "fictional@example.invalid",
          language: "en",
          provenance: "asserted",
        },
        "1",
      );
    expect(contact.version).toBe("2");
    await send(
      "clients/" + client.entityId,
      {
        relationshipState: "active",
        reasonCode: "engagement_confirmed",
        confirmServiceRelationship: true,
      },
      "2",
      "PATCH",
    );
    const project = await send("projects", {
      clientId: client.entityId,
      name: "Fictional website",
      stage: "in_progress",
    });
    await send(
      "notes",
      {
        targetType: "project",
        targetId: project.entityId,
        text: "Fictional internal qualification note",
      },
      "1",
    );
    await send(
      "projects/" + project.entityId,
      { stage: "completed" },
      "2",
      "PATCH",
    );
    const caseReceipt = await send("cases", { sourceRequestId: id });
    expect((await get("velani/requests/" + id)).data.description).toContain(
      "Fictional source message",
    );
    expect((await get("cases/" + caseReceipt.entityId)).data.state).toBe("new");
    const closed = await send(
      "clients/" + client.entityId,
      { relationshipState: "inactive", reasonCode: "relationship_closed" },
      "3",
      "PATCH",
    );
    expect(closed.version).toBe("4");
    const overview = await get("overview");
    expect(overview.data.revenue.value).toBeNull();
    const profile = await get("clients/" + client.entityId);
    expect(profile.data.relationshipState).toBe("inactive");
    expect(profile.data.contacts[0].provenance).toBe("asserted");
    expect(
      (
        await f.db.pool.query(
          "SELECT count(*) FROM admin.audit WHERE action='detail_viewed' AND actor_id=$1",
          [actor.id],
        )
      ).rows[0].count,
    ).toBe("3");
    expect(
      JSON.stringify(
        (await f.db.pool.query("SELECT receipt FROM admin.commands")).rows,
      ),
    ).not.toContain("fictional@example.invalid");
    if (process.env.ADMIN_CAPTURE_EVIDENCE_DIR) {
      const dir = join(process.cwd(), "docs/evidence");
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, "qualification-sample.json"),
        JSON.stringify(
          {
            date: "2026-11-10",
            environment: "owned-loopback-test",
            containsRealCustomers: false,
            events,
            overview,
            profile: {
              ...profile,
              data: {
                ...profile.data,
                contacts: profile.data.contacts.map(
                  (x: { id: string; provenance: string }) => ({
                    id: x.id,
                    provenance: x.provenance,
                    contact: "fictional fixture omitted",
                  }),
                ),
              },
            },
          },
          null,
          2,
        ) + "\n",
      );
    }
  } finally {
    await f.close();

    await v.close();
    await c.close();
    await b.close();
  }
});
