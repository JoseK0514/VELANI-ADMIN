import type { Pool } from "pg";
import { createHash } from "node:crypto";
import type { AdminConfig } from "../config";
import { AdminError } from "../errors";
export type AuthRoots = Pick<
  AdminConfig,
  "sessionKey" | "encryptionKey" | "cursorKey"
>;
export function rootFingerprints(roots: AuthRoots) {
  const keys = [roots.sessionKey, roots.encryptionKey, roots.cursorKey];
  if (
    keys.some((k) => !Buffer.isBuffer(k) || k.length !== 32) ||
    new Set(keys.map((k) => k.toString("base64url"))).size !== 3
  )
    throw new AdminError(422, "invalid_auth_roots");
  const hash = (key: Buffer) =>
    createHash("sha256")
      .update("velani-admin-root-fingerprint\0")
      .update(key)
      .digest("hex");
  return {
    session: hash(roots.sessionKey),
    encryption: hash(roots.encryptionKey),
    cursor: hash(roots.cursorKey),
  };
}
/** Epoch lives outside the restorable business/auth DB. Web has SELECT only. */
export class AuthorizationFence {
  constructor(
    private admin: Pool,
    private journal: Pool,
    private roots: AuthRoots,
  ) {}
  async verify() {
    const [a, j] = await Promise.all([
        this.admin.query(
          "SELECT epoch::text FROM admin.authorization_state WHERE singleton",
        ),
        this.journal.query(
          "SELECT epoch::text,recovery_pending,root_fingerprints FROM admin_journal.authorization_state WHERE singleton",
        ),
      ]),
      state = j.rows[0],
      fingerprints = rootFingerprints(this.roots);
    if (
      a.rowCount !== 1 ||
      j.rowCount !== 1 ||
      state.recovery_pending ||
      a.rows[0].epoch !== state.epoch ||
      Object.entries(fingerprints).some(
        ([key, v]) => state.root_fingerprints?.[key] !== v,
      )
    )
      throw new AdminError(503, "authorization_recovery_required");
  }
}
