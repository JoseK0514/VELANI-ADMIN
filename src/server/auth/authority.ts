import type { PoolClient } from "pg";
import type { AdminConfig } from "../config";
import { AdminError } from "../errors";
export type Actor = {
  id: string;
  email: string;
  generation: string;
  sessionHash: string;
  csrf: string;
  factorAt: number;
};
export async function assertActor(
  client: PoolClient,
  actor: Actor,
  config: AdminConfig,
  recent = false,
) {
  const r = await client.query(
    "SELECT s.factor_at FROM admin.actors a JOIN admin.sessions s ON s.actor_id=a.id WHERE a.id=$1 AND a.email=$2 AND a.google_subject IS NOT NULL AND a.enabled AND a.generation=$3 AND s.hash=$4 AND s.generation=a.generation AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.idle_expires_at>clock_timestamp() FOR SHARE OF a,s",
    [actor.id, config.ownerEmail, actor.generation, actor.sessionHash],
  );
  if (r.rowCount !== 1) throw new AdminError(401, "authentication_required");
  if (recent && Date.now() - new Date(r.rows[0].factor_at).getTime() > 300000)
    throw new AdminError(403, "reauth_required");
}
