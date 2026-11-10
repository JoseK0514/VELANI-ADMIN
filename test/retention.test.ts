import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./helpers/db";
import { journalFixture } from "./helpers/journal";
import { Retention } from "../src/server/retention";
it("blocks restored data until the independent journal has been reconciled", async () => {
  const db = await testDatabase(),
    j = await journalFixture();
  try {
    const id = randomUUID(),
      r = new Retention(db.pool, j.pool);
    await db.pool.query(
      "INSERT INTO admin.clients(id,display_name) VALUES($1,'Owned')",
      [id],
    );
    await j.pool.query(
      "INSERT INTO admin_journal.deletions(entity_type,entity_id) VALUES('client',$1)",
      [id],
    );
    await expect(
      r.guard((c) => c.query("SELECT display_name FROM admin.clients")),
    ).rejects.toMatchObject({ code: "restore_reconciliation_required" });
    await r.reconcile();
    expect(
      (await r.guard((c) => c.query("SELECT * FROM admin.clients"))).rowCount,
    ).toBe(0);
    await db.pool.query(
      "INSERT INTO admin.clients(id,display_name) VALUES($1,'Restored old row')",
      [id],
    );
    await db.pool.query("UPDATE admin.restore_barrier SET applied_sequence=0");
    await r.reconcile();
    expect((await db.pool.query("SELECT * FROM admin.clients")).rowCount).toBe(
      0,
    );
  } finally {
    await db.close();
    await j.close();
  }
});
it("purges expired prospects/cases and dependent notes, respects reviewed holds, and leaves source systems untouched", async () => {
  const db = await testDatabase(),
    j = await journalFixture();
  try {
    const a = randomUUID(),
      held = randomUUID(),
      caseId = randomUUID();
    await db.pool.query(
      "INSERT INTO admin.clients(id,display_name,prospect_expires_at) VALUES($1,'Expired',now()-interval '1 second'),($2,'Held',now()-interval '1 second')",
      [a, held],
    );
    await db.pool.query(
      "INSERT INTO admin.retention_holds(entity_type,entity_id,owner_ref,reason_code,review_at) VALUES('client',$1,'private-operator','reviewed_hold',now()+interval '1 day')",
      [held],
    );
    await db.pool.query(
      "INSERT INTO admin.cases(id,source_request_id,reference,source_created_at,source_expires_at,purge_by) VALUES($1,$2,'VEL-2608-0001',now()-interval '91 days',now()-interval '3 days',now()-interval '1 day')",
      [caseId, randomUUID()],
    );
    await db.pool.query(
      "INSERT INTO admin.notes(id,client_id,text) VALUES($1,$2,'Expired note')",
      [randomUUID(), a],
    );
    await new Retention(db.pool, j.pool).purge();
    expect((await db.pool.query("SELECT id FROM admin.clients")).rows).toEqual([
      { id: held },
    ]);
    expect((await db.pool.query("SELECT * FROM admin.notes")).rowCount).toBe(0);
    expect((await db.pool.query("SELECT * FROM admin.cases")).rowCount).toBe(0);
    expect(
      (await j.pool.query("SELECT * FROM admin_journal.deletions")).rowCount,
    ).toBe(2);
    expect(
      (
        await db.pool.query(
          "SELECT last_success_at FROM admin.maintenance_state",
        )
      ).rows[0].last_success_at,
    ).toBeTruthy();
  } finally {
    await db.close();
    await j.close();
  }
});
it("survives a crash after durable deletion intent and blocks serving the unpurged row", async () => {
  const db = await testDatabase(),
    j = await journalFixture();
  try {
    const id = randomUUID(),
      r = new Retention(db.pool, j.pool);
    await db.pool.query(
      "INSERT INTO admin.clients(id,display_name,prospect_expires_at) VALUES($1,'Owned',now()-interval '1 second')",
      [id],
    );
    await db.pool.query(
      "CREATE FUNCTION admin.fail_purge() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned crash'; END $$; CREATE TRIGGER fail_purge BEFORE DELETE ON admin.clients FOR EACH ROW EXECUTE FUNCTION admin.fail_purge()",
    );
    await expect(r.purge()).rejects.toBeTruthy();
    expect(
      (await j.pool.query("SELECT * FROM admin_journal.deletions")).rowCount,
    ).toBe(1);
    expect((await db.pool.query("SELECT * FROM admin.clients")).rowCount).toBe(
      1,
    );
    await expect(
      r.guard((c) => c.query("SELECT * FROM admin.clients")),
    ).rejects.toMatchObject({ code: "restore_reconciliation_required" });
    await db.pool.query("DROP TRIGGER fail_purge ON admin.clients");
    await r.reconcile();
    expect(
      (await r.guard((c) => c.query("SELECT * FROM admin.clients"))).rowCount,
    ).toBe(0);
  } finally {
    await db.close();
    await j.close();
  }
});
