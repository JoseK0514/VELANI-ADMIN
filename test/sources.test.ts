import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { sourceFixture } from "./helpers/source";
import { PostgresSources } from "../src/server/sources/postgres";
import { encodeCursor, decodeCursor } from "../src/server/cursor";
it("reads only approved source views and excludes credentials and foreign environments", async () => {
  const f = await sourceFixture("control");
  try {
    const id = randomUUID();
    await f.db.pool.query(
      "INSERT INTO nevora_onboarding.workspace_registry VALUES($1,'https://owned.invalid','test',1,2,'ACTIVE',now(),'DO_NOT_EXPOSE'),($2,'https://foreign.invalid','production',1,1,'ACTIVE',now(),'FOREIGN')",
      [id, randomUUID()],
    );
    const sources = new PostgresSources(
      { control: f.config },
      { control: f.pool },
    );
    const result = await sources.list("workplaces", { limit: 25 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id,
      revision: "2",
      incarnation: "1",
    });
    expect(JSON.stringify(result)).not.toMatch(
      /DO_NOT_EXPOSE|FOREIGN|app_secret_ref/,
    );
    await expect(
      f.pool.query("SELECT * FROM nevora_onboarding.workspace_registry"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      f.pool.query("UPDATE velani_admin_projection.binding SET version=2"),
    ).rejects.toMatchObject({ code: "42501" });
  } finally {
    await f.close();
  }
});
it("rejects wrong pinned branch and any reader granted base table access", async () => {
  const f = await sourceFixture("control");
  try {
    const bad = new PostgresSources(
      { control: { ...f.config, branchId: "foreign" } },
      { control: f.pool },
    );
    await expect(bad.list("workplaces", { limit: 25 })).rejects.toMatchObject({
      code: "source_unavailable",
    });
    await f.db.pool.query(
      "GRANT USAGE ON SCHEMA nevora_onboarding TO " + f.config.role,
    );
    await f.db.pool.query(
      "GRANT SELECT ON nevora_onboarding.workspace_registry TO " +
        f.config.role,
    );
    await expect(
      new PostgresSources({ control: f.config }, { control: f.pool }).list(
        "workplaces",
        { limit: 25 },
      ),
    ).rejects.toMatchObject({ code: "source_unavailable" });
  } finally {
    await f.close();
  }
});
it("keeps source message on demand only and hides expired requests even before purge", async () => {
  const f = await sourceFixture("velani");
  try {
    const id = randomUUID();
    await f.db.pool.query(
      "INSERT INTO public.client_hub_requests VALUES($1,'VEL-2611-0001',$2,now(),now()+interval '88 days','SECRET')",
      [
        id,
        {
          type: "new_work",
          name: "Owned Person",
          email: "owned@example.invalid",
          company: "Owned",
          project: "Website",
          description: "PRIVATE MESSAGE",
          urgency: null,
          language: "en",
        },
      ],
    );
    const s = new PostgresSources({ velani: f.config }, { velani: f.pool }),
      list = await s.list("requests", { limit: 25 });
    expect(JSON.stringify(list)).not.toMatch(
      /PRIVATE MESSAGE|owned@example|SECRET/,
    );
    expect(await s.get("requests", id)).toMatchObject({
      description: "PRIVATE MESSAGE",
      email: "owned@example.invalid",
    });
    await f.db.pool.query(
      "UPDATE public.client_hub_requests SET expires_at=now()-interval '1 second'",
    );
    expect(await s.get("requests", id)).toBeNull();
    expect((await s.list("requests", { limit: 25 })).items).toHaveLength(0);
  } finally {
    await f.close();
  }
});
it("binds cursors to filters and scope without contact text", () => {
  const key = Buffer.alloc(32, 8),
    after = { id: randomUUID(), createdAt: new Date().toISOString() },
    c = encodeCursor(key, "clients:active", after);
  expect(decodeCursor(key, "clients:active", c)).toEqual(after);
  expect(() => decodeCursor(key, "clients:inactive", c)).toThrow(
    "invalid_cursor",
  );
  expect(() => decodeCursor(key, "clients:active", c + "x")).toThrow(
    "invalid_cursor",
  );
});
it("projects enrollment-only catalog facts without instance credentials or workforce counts", async () => {
  const f = await sourceFixture("catalog");
  try {
    const id = randomUUID();
    await f.db.pool.query(
      "INSERT INTO commerce.accounts VALUES($1,'owned@example.invalid',$2,now(),'PASSWORD_SECRET')",
      [
        id,
        {
          businessName: "Owned Cafe",
          ownerEmployeeId: "OWNER-1",
          private: "EXCLUDE",
        },
      ],
    );
    await f.db.pool.query(
      "INSERT INTO commerce.businesses VALUES($1,now(),now()+interval '30 days',NULL,NULL,NULL,'small',now(),12)",
      [id],
    );
    await f.db.pool.query(
      "INSERT INTO commerce.external_installations VALUES($1,'test',1,'INSTANCE_SECRET')",
      [id],
    );
    const s = new PostgresSources({ catalog: f.config }, { catalog: f.pool }),
      r = await s.get("catalog", id);
    expect(r).toMatchObject({
      enrollmentName: "Owned Cafe",
      enrollmentEmail: "owned@example.invalid",
      contactProvenance: "source_enrollment",
    });
    expect(JSON.stringify(r)).not.toMatch(
      /PASSWORD_SECRET|INSTANCE_SECRET|EXCLUDE|OWNER-1|employee_count/,
    );
  } finally {
    await f.close();
  }
});
it("does not forward new fields if a source view accidentally broadens its JSON", async () => {
  const f = await sourceFixture("control");
  try {
    const id = randomUUID();
    await f.db.pool.query(
      "INSERT INTO nevora_onboarding.workspace_registry VALUES($1,'https://owned.invalid','test',1,1,'ACTIVE',now(),'SECRET')",
      [id],
    );
    await f.db.pool.query(
      "ALTER VIEW velani_admin_projection.workplaces RENAME TO original_workplaces; CREATE VIEW velani_admin_projection.workplaces AS SELECT id,created_at,search_text,search_email,data||jsonb_build_object('privateKey','SECRET_MUST_NOT_LEAK') AS data FROM velani_admin_projection.original_workplaces",
    );
    await f.db.pool.query(
      "GRANT SELECT ON velani_admin_projection.workplaces TO " + f.config.role,
    );
    const r = await new PostgresSources(
      { control: f.config },
      { control: f.pool },
    ).list("workplaces", { limit: 25 });
    expect(JSON.stringify(r)).not.toContain("SECRET_MUST_NOT_LEAK");
  } finally {
    await f.close();
  }
});
