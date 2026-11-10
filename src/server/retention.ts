import type { Pool, PoolClient } from "pg";
import { transaction } from "./db";
import { AdminError } from "./errors";
export type BusinessTransaction = <T>(
  work: (c: PoolClient) => Promise<T>,
) => Promise<T>;
const lock = "hashtext('velani-admin-independent-deletion-journal')";
export class Retention {
  constructor(
    private admin: Pool,
    private journal: Pool,
  ) {}
  guard: BusinessTransaction = async (work) =>
    transaction(this.journal, async (j) => {
      await j.query(`SELECT pg_advisory_xact_lock_shared(${lock})`);
      const latest = (
        await j.query(
          "SELECT COALESCE(max(sequence),0)::text AS n FROM admin_journal.deletions",
        )
      ).rows[0].n;
      return transaction(this.admin, async (c) => {
        const local = (
          await c.query(
            "SELECT applied_sequence::text FROM admin.restore_barrier WHERE singleton",
          )
        ).rows[0];
        if (local?.applied_sequence !== latest)
          throw new AdminError(503, "restore_reconciliation_required");
        return work(c);
      });
    });
  private async exclusive<T>(work: (j: PoolClient) => Promise<T>) {
    const j = await this.journal.connect();
    let unlocked = false;
    try {
      await j.query(`SELECT pg_advisory_lock(${lock})`);
      return await work(j);
    } finally {
      try {
        await j.query(`SELECT pg_advisory_unlock(${lock})`);
        unlocked = true;
      } finally {
        j.release(!unlocked);
      }
    }
  }
  private async apply(j: PoolClient) {
    let clients = 0,
      cases = 0;
    for (;;) {
      const done = await transaction(this.admin, async (c) => {
        const local = (
          await c.query(
            "SELECT applied_sequence::text AS n FROM admin.restore_barrier FOR UPDATE",
          )
        ).rows[0].n;
        const latest = (
          await j.query(
            "SELECT COALESCE(max(sequence),0)::text AS n FROM admin_journal.deletions",
          )
        ).rows[0].n;
        if (BigInt(local) > BigInt(latest))
          throw new AdminError(503, "journal_rollback_detected");
        const rows = (
          await j.query(
            "SELECT sequence::text,entity_type,entity_id,deleted_at FROM admin_journal.deletions WHERE sequence>$1 ORDER BY sequence LIMIT 100",
            [local],
          )
        ).rows;
        for (const row of rows) {
          const table = row.entity_type === "client" ? "clients" : "cases";
          const result = await c.query(
            `DELETE FROM admin.${table} WHERE id=$1`,
            [row.entity_id],
          );
          if (table === "clients")
            await c.query(
              "DELETE FROM admin.retention_holds WHERE entity_type='client' AND entity_id=$1",
              [row.entity_id],
            );
          if (table === "clients") clients += result.rowCount ?? 0;
          else cases += result.rowCount ?? 0;
          await c.query(
            "INSERT INTO admin.deletions(sequence,entity_type,entity_id,deleted_at) VALUES($1,$2,$3,$4) ON CONFLICT(sequence) DO NOTHING",
            [row.sequence, row.entity_type, row.entity_id, row.deleted_at],
          );
        }
        if (rows.length)
          await c.query(
            "UPDATE admin.restore_barrier SET applied_sequence=$1,updated_at=statement_timestamp()",
            [rows.at(-1)!.sequence],
          );
        return rows.length < 100;
      });
      if (done) return { clients, cases };
    }
  }
  async reconcile() {
    return this.exclusive((j) => this.apply(j));
  }
  async purge() {
    return this.exclusive(async (j) => {
      await this.apply(j);
      const candidates = (
        await this.admin.query(
          `SELECT 'client' AS entity_type,c.id FROM admin.clients c WHERE ((c.engaged_at IS NULL AND c.prospect_expires_at<=statement_timestamp()) OR (c.engaged_at IS NOT NULL AND c.delete_after<=statement_timestamp())) AND NOT EXISTS(SELECT 1 FROM admin.retention_holds h WHERE h.entity_id=c.id AND h.entity_type='client' AND h.review_at>statement_timestamp()) UNION ALL SELECT 'case',id FROM admin.cases WHERE purge_by<=statement_timestamp() LIMIT 100`,
        )
      ).rows;
      // Journal commits first. A crash from here blocks web reads until reconcile.
      for (const row of candidates)
        await j.query(
          "INSERT INTO admin_journal.deletions(entity_type,entity_id) VALUES($1,$2) ON CONFLICT(entity_type,entity_id) DO NOTHING",
          [row.entity_type, row.id],
        );
      const removed = await this.apply(j);
      await transaction(this.admin, async (c) => {
        await c.query(
          "DELETE FROM admin.audit WHERE created_at<statement_timestamp()-interval '365 days'",
        );
        await c.query(
          "DELETE FROM admin.commands WHERE created_at<statement_timestamp()-interval '365 days'",
        );
        for (const table of [
          "limits",
          "challenges",
          "pending_logins",
          "sessions",
        ])
          await c.query(
            `DELETE FROM admin.${table} WHERE expires_at<statement_timestamp()-interval '1 day'`,
          );
        await c.query(
          "UPDATE admin.maintenance_state SET last_success_at=statement_timestamp(),removed_clients=$1,removed_cases=$2",
          [removed.clients, removed.cases],
        );
      });
      return { ...removed, morePossible: candidates.length === 100 };
    });
  }
}
