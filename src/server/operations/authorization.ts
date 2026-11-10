import type { Pool, PoolClient } from "pg";
import { AdminError } from "../errors";
import { rootFingerprints, type AuthRoots } from "../auth/fence";
async function owner(c: PoolClient, schema: string) {
  const r = await c.query(
    "SELECT current_user=session_user AND session_user=pg_get_userbyid(nspowner) AS approved FROM pg_namespace WHERE nspname=$1",
    [schema],
  );
  if (r.rows[0]?.approved !== true)
    throw new AdminError(403, "private_operator_required");
}
async function exclusive<T>(
  admin: Pool,
  journal: Pool,
  work: (a: PoolClient, j: PoolClient) => Promise<T>,
) {
  const a = await admin.connect(),
    j = await journal.connect();
  let unlocked = false;
  try {
    await owner(a, "admin");
    await owner(j, "admin_journal");
    await j.query(
      "SELECT pg_advisory_lock(hashtext('velani-admin-independent-deletion-journal'))",
    );
    return await work(a, j);
  } finally {
    try {
      await j.query(
        "SELECT pg_advisory_unlock(hashtext('velani-admin-independent-deletion-journal'))",
      );
      unlocked = true;
    } finally {
      a.release();
      j.release(!unlocked);
    }
  }
}
export async function bindAuthorization(
  admin: Pool,
  journal: Pool,
  roots: AuthRoots,
) {
  return exclusive(admin, journal, async (a, j) => {
    const state = (
        await j.query(
          "SELECT epoch::text,root_fingerprints FROM admin_journal.authorization_state",
        )
      ).rows[0],
      local = (
        await a.query("SELECT epoch::text FROM admin.authorization_state")
      ).rows[0];
    if (
      state?.root_fingerprints ||
      state?.epoch !== "1" ||
      local?.epoch !== "1"
    )
      throw new AdminError(409, "authorization_already_bound");
    await j.query(
      "UPDATE admin_journal.authorization_state SET root_fingerprints=$1,recovery_pending=false",
      [rootFingerprints(roots)],
    );
    return { state: "authorization_bound" };
  });
}
/** MUST complete before any provider/logical restore. This durably closes access. */
export async function beginAuthorizationRecovery(admin: Pool, journal: Pool) {
  return exclusive(admin, journal, async (_a, j) => {
    const state = (
      await j.query(
        "SELECT epoch::text,recovery_pending,root_fingerprints FROM admin_journal.authorization_state",
      )
    ).rows[0];
    if (!state?.root_fingerprints)
      throw new AdminError(409, "authorization_not_bound");
    if (!state.recovery_pending)
      await j.query(
        "UPDATE admin_journal.authorization_state SET epoch=epoch+1,recovery_pending=true",
      );
    return { state: "recovery_pending" };
  });
}
export async function completeAuthorizationRecovery(
  admin: Pool,
  journal: Pool,
  roots: AuthRoots,
) {
  return exclusive(admin, journal, async (a, j) => {
    const state = (
        await j.query(
          "SELECT epoch::text,recovery_pending,root_fingerprints FROM admin_journal.authorization_state",
        )
      ).rows[0],
      fingerprints = rootFingerprints(roots);
    if (!state?.recovery_pending || !state.root_fingerprints)
      throw new AdminError(409, "recovery_not_pending");
    if (
      fingerprints.session === state.root_fingerprints.session ||
      fingerprints.encryption === state.root_fingerprints.encryption
    )
      throw new AdminError(409, "auth_roots_not_rotated");
    const external = (
        await j.query(
          "SELECT COALESCE(max(sequence),0)::text AS n FROM admin_journal.deletions",
        )
      ).rows[0].n,
      local = (
        await a.query(
          "SELECT applied_sequence::text AS n FROM admin.restore_barrier",
        )
      ).rows[0]?.n;
    if (local !== external)
      throw new AdminError(503, "restore_reconciliation_required");
    await a.query("BEGIN");
    try {
      await a.query(
        "UPDATE admin.actors SET generation=generation+1,enrollment_until=statement_timestamp()+interval '15 minutes',pending_google_subject=NULL,pending_identity_id=NULL,pending_identity_expires_at=NULL",
      );
      await a.query(
        "UPDATE admin.credentials SET revoked_at=statement_timestamp() WHERE revoked_at IS NULL",
      );
      await a.query(
        "UPDATE admin.sessions SET revoked_at=statement_timestamp() WHERE revoked_at IS NULL",
      );
      await a.query("DELETE FROM admin.pending_logins");
      await a.query(
        "UPDATE admin.challenges SET used_at=statement_timestamp() WHERE used_at IS NULL",
      );
      await a.query("UPDATE admin.authorization_state SET epoch=$1", [
        state.epoch,
      ]);
      await a.query(
        "INSERT INTO admin.audit(action,entity_type,result) VALUES('restore_authorization_reset','authority','saved')",
      );
      await a.query("COMMIT");
    } catch (e) {
      await a.query("ROLLBACK");
      throw e;
    }
    // If this fails, the independent fence stays closed. Re-running recovery is safe.
    await j.query(
      "UPDATE admin_journal.authorization_state SET root_fingerprints=$1,recovery_pending=false",
      [fingerprints],
    );
    return { state: "recovered_enrollment_required" };
  });
}
