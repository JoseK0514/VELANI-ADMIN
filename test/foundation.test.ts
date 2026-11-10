import { it, expect } from "vitest";
import { testDatabase } from "./helpers/db";
import { adminGrants } from "../src/server/principals";
import { migrate } from "../src/server/db";
it("creates isolated admin authority and business storage without customer workforce tables", async () => {
  const db = await testDatabase();
  try {
    const r = await db.pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='admin' ORDER BY table_name",
    );
    expect(r.rows.map((x) => x.table_name)).toEqual(
      expect.arrayContaining([
        "actors",
        "sessions",
        "clients",
        "projects",
        "cases",
        "audit",
        "commands",
        "deletions",
      ]),
    );
    expect(
      (
        await db.pool.query(
          "SELECT count(*)::integer n FROM information_schema.tables WHERE table_name IN('employee_credentials','workspace_secrets','provisioning_private')",
        )
      ).rows[0].n,
    ).toBe(0);
  } finally {
    await db.close();
  }
});
it("gives the web principal business writes but no audit deletion, owner enrollment or role escalation", async () => {
  const db = await testDatabase();
  try {
    await db.pool.query(
      "CREATE ROLE velani_admin_web; CREATE ROLE velani_admin_maintenance",
    );
    for (const sql of adminGrants(
      "velani_admin_web",
      "velani_admin_maintenance",
    ))
      await db.pool.query(sql);
    const rows = await db.pool.query(
      "SELECT has_table_privilege('velani_admin_web','admin.clients','UPDATE') AS edit,has_table_privilege('velani_admin_web','admin.audit','DELETE') AS erase_audit,has_table_privilege('velani_admin_web','admin.actors','UPDATE') AS enroll,has_schema_privilege('velani_admin_web','admin','CREATE') AS create_schema",
    );
    expect(rows.rows[0]).toEqual({
      edit: true,
      erase_audit: false,
      enroll: false,
      create_schema: false,
    });
  } finally {
    await db.close();
  }
});
it("applies explicit migrations atomically with checksums and replays without recreating tables", async () => {
  const db = await testDatabase(false);
  try {
    await migrate(db.pool);
    await migrate(db.pool);
    const r = await db.pool.query(
      "SELECT version FROM admin.schema_migrations ORDER BY version",
    );
    expect(r.rows.map((x) => x.version)).toEqual([
      "0001_admin.sql",
      "0002_identity_review.sql",
      "0003_stable_creation_time.sql",
      "0004_deployment_binding.sql",
      "0005_authorization_epoch.sql",
    ]);
  } finally {
    await db.close();
  }
});
it("uses one creation instant for an exact prospect expiry without intermittent constraint failures", async () => {
  const db = await testDatabase();
  try {
    await db.pool.query(
      "INSERT INTO admin.clients(id,display_name) SELECT gen_random_uuid(),'Owned' FROM generate_series(1,100)",
    );
    expect(
      (
        await db.pool.query(
          "SELECT bool_and(prospect_expires_at=created_at+interval '90 days') exact FROM admin.clients",
        )
      ).rows[0].exact,
    ).toBe(true);
  } finally {
    await db.close();
  }
});
it("migrates the independent journal with immutable version checksums", async () => {
  const db = await testDatabase(false);
  try {
    const { migrateJournal } = await import("../src/server/db");
    await migrateJournal(db.pool);
    await migrateJournal(db.pool);
    expect(
      (
        await db.pool.query(
          "SELECT version FROM admin_journal.schema_migrations ORDER BY version",
        )
      ).rows.map((x) => x.version),
    ).toEqual(["0001_journal.sql", "0002_authorization_epoch.sql"]);
    expect(
      (
        await db.pool.query(
          "SELECT recovery_pending FROM admin_journal.authorization_state",
        )
      ).rows[0].recovery_pending,
    ).toBe(true);
  } finally {
    await db.close();
  }
});
