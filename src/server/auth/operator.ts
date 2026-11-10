import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { transaction } from "../db";
import { AdminError } from "../errors";
async function privateOwner(c: PoolClient) {
  const r = await c.query(
    "SELECT current_user=session_user AND session_user=pg_get_userbyid(nspowner) AS approved FROM pg_namespace WHERE nspname='admin'",
  );
  if (r.rows[0]?.approved !== true)
    throw new AdminError(403, "private_operator_required");
}
export async function prepareOwner(pool: Pool, email: string) {
  return transaction(pool, async (c) => {
    await privateOwner(c);
    const old = (await c.query("SELECT id,email FROM admin.actors FOR UPDATE"))
      .rows[0];
    if (old) {
      if (old.email !== email)
        throw new AdminError(409, "different_owner_exists");
      return { state: "owner_prepared", actorId: old.id };
    }
    const id = randomUUID();
    await c.query(
      "INSERT INTO admin.actors(id,email,enabled) VALUES($1,$2,true)",
      [id, email],
    );
    return { state: "owner_prepared", actorId: id };
  });
}
export async function reviewIdentity(
  pool: Pool,
  email: string,
  requestId: string,
) {
  return transaction(pool, async (c) => {
    await privateOwner(c);
    const a = (
      await c.query(
        "SELECT * FROM admin.actors WHERE email=$1 AND pending_identity_id=$2 FOR UPDATE",
        [email, requestId],
      )
    ).rows[0];
    if (!a || !a.pending_google_subject || !a.enabled)
      throw new AdminError(409, "identity_review_expired");
    if (a.google_subject === a.pending_google_subject)
      return { state: "identity_bound", actorId: a.id };
    if (
      a.google_subject !== null ||
      !a.pending_identity_expires_at ||
      new Date(a.pending_identity_expires_at).getTime() <= Date.now()
    )
      throw new AdminError(409, "identity_review_expired");
    await c.query(
      "UPDATE admin.actors SET google_subject=pending_google_subject,enrollment_until=clock_timestamp()+interval '15 minutes',pending_identity_expires_at=NULL WHERE id=$1",
      [a.id],
    );
    await c.query(
      "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,result) VALUES($1::uuid,'identity_bound','actor',$1::text,'saved')",
      [a.id],
    );
    return { state: "identity_bound", actorId: a.id };
  });
}
/** Private provider-owner recovery; never called by the HTTP application. */
export async function recoverOwner(pool: Pool, email: string) {
  return transaction(pool, async (c) => {
    await privateOwner(c);
    const a = (
      await c.query(
        "SELECT id FROM admin.actors WHERE email=$1 AND google_subject IS NOT NULL FOR UPDATE",
        [email],
      )
    ).rows[0];
    if (!a) throw new AdminError(409, "owner_not_enrolled");
    const r = await c.query(
      "UPDATE admin.actors SET generation=generation+1,enrollment_until=clock_timestamp()+interval '15 minutes' WHERE id=$1 RETURNING generation::text",
      [a.id],
    );
    await c.query(
      "UPDATE admin.credentials SET revoked_at=clock_timestamp() WHERE actor_id=$1 AND revoked_at IS NULL",
      [a.id],
    );
    await c.query(
      "UPDATE admin.sessions SET revoked_at=clock_timestamp() WHERE actor_id=$1 AND revoked_at IS NULL",
      [a.id],
    );
    await c.query("DELETE FROM admin.pending_logins WHERE actor_id=$1", [a.id]);
    await c.query(
      "UPDATE admin.challenges SET used_at=clock_timestamp() WHERE actor_id=$1 AND used_at IS NULL",
      [a.id],
    );
    await c.query(
      "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,reason_code,result) VALUES($1::uuid,'owner_recovery','actor',$1::text,'owner_recovery','saved')",
      [a.id],
    );
    return { state: "recovery_ready", generation: r.rows[0].generation };
  });
}
