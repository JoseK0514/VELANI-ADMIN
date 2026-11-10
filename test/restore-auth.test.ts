import { expect, it } from "vitest";
import { authFixture } from "./helpers/auth";
import { recoverOwner } from "../src/server/auth/operator";
import {
  beginAuthorizationRecovery,
  completeAuthorizationRecovery,
} from "../src/server/operations/authorization";
import { AuthorizationFence } from "../src/server/auth/fence";
import { Retention } from "../src/server/retention";
it.each(["logout", "owner_recovery"])(
  "keeps restored pre-%s authentication closed while the deletion journal is unchanged",
  async (scenario) => {
    const f = await authFixture(),
      j = f.journal;
    try {
      const { session, actor } = await f.login();
      if (scenario === "logout") await f.auth.logout(actor);
      else await recoverOwner(f.db.pool, f.config.ownerEmail);
      await expect(f.auth.authenticate(session.token)).rejects.toMatchObject({
        status: 401,
      });
      await beginAuthorizationRecovery(f.db.pool, j.pool);
      await f.db.pool.query("UPDATE admin.actors SET generation=1");
      await f.db.pool.query("UPDATE admin.sessions SET revoked_at=NULL");
      await f.db.pool.query("UPDATE admin.credentials SET revoked_at=NULL");
      expect(
        (await j.pool.query("SELECT count(*) FROM admin_journal.deletions"))
          .rows[0].count,
      ).toBe("0");
      await expect(f.auth.authenticate(session.token)).rejects.toMatchObject({
        code: "authorization_recovery_required",
      });
      await expect(
        new AuthorizationFence(f.db.pool, j.pool, f.config).verify(),
      ).rejects.toMatchObject({ code: "authorization_recovery_required" });
      await expect(
        new Retention(f.db.pool, j.pool).guard((c) =>
          c.query("SELECT * FROM admin.clients"),
        ),
      ).rejects.toMatchObject({ code: "authorization_recovery_required" });
    } finally {
      await f.close();
    }
  },
);
it("refuses recovery without fresh auth roots and invalidates all sessions, factors and proofs before reopening", async () => {
  const f = await authFixture(),
    j = f.journal;
  try {
    await f.login();
    await beginAuthorizationRecovery(f.db.pool, j.pool);
    await expect(
      completeAuthorizationRecovery(f.db.pool, j.pool, f.config),
    ).rejects.toMatchObject({ code: "auth_roots_not_rotated" });
    const roots = {
      ...f.config,
      sessionKey: Buffer.alloc(32, 7),
      encryptionKey: Buffer.alloc(32, 8),
    };
    await completeAuthorizationRecovery(f.db.pool, j.pool, roots);
    await expect(
      new AuthorizationFence(f.db.pool, j.pool, f.config).verify(),
    ).rejects.toMatchObject({ code: "authorization_recovery_required" });
    await new AuthorizationFence(f.db.pool, j.pool, roots).verify();
    expect(
      (
        await f.db.pool.query(
          "SELECT count(*) FROM admin.credentials WHERE revoked_at IS NULL",
        )
      ).rows[0].count,
    ).toBe("0");
    expect(
      (
        await f.db.pool.query(
          "SELECT count(*) FROM admin.sessions WHERE revoked_at IS NULL",
        )
      ).rows[0].count,
    ).toBe("0");
    expect(
      (await f.db.pool.query("SELECT count(*) FROM admin.pending_logins"))
        .rows[0].count,
    ).toBe("0");
    expect(
      (
        await f.db.pool.query(
          "SELECT generation::text,enrollment_until>now() AS enroll FROM admin.actors",
        )
      ).rows[0],
    ).toEqual({ generation: "2", enroll: true });
  } finally {
    await f.close();
  }
});
it("requires two newly enrolled factors after restore and rejects the prior factor and session", async () => {
  const f = await authFixture();
  try {
    const old = await f.login();
    await beginAuthorizationRecovery(f.db.pool, f.journal.pool);
    const config = {
      ...f.config,
      sessionKey: Buffer.alloc(32, 7),
      encryptionKey: Buffer.alloc(32, 8),
    };
    await completeAuthorizationRecovery(f.db.pool, f.journal.pool, config);
    const { AuthService } = await import("../src/server/auth/service"),
      { GoogleOidc } = await import("../src/server/auth/oidc"),
      { authenticator } = await import("./helpers/authenticator"),
      auth = new AuthService(
        f.db.pool,
        config,
        new AuthorizationFence(f.db.pool, f.journal.pool, config),
        new GoogleOidc(config, async () => f.issuer.configuration),
      );
    await expect(auth.authenticate(old.session.token)).rejects.toMatchObject({
      status: 401,
    });
    const start = await auth.start(),
      p = await auth.callback(
        await f.issuer.callback(start.url),
        start.flowToken,
      );
    expect(p.state).toBe("enrollment_required");
    await expect(
      auth.authenticationOptions(p.pendingToken),
    ).rejects.toMatchObject({ code: "backup_factor_required" });
    const keys = [authenticator(), authenticator()];
    for (const k of keys) {
      const options = await auth.registrationOptions(p.pendingToken);
      await auth.register(
        p.pendingToken,
        options.challengeId,
        k.register(options.options.challenge, config.origin),
      );
    }
    const challenge = await auth.authenticationOptions(p.pendingToken);
    await expect(
      auth.verify(
        p.pendingToken,
        challenge.challengeId,
        old.key.assert(challenge.options.challenge, config.origin),
      ),
    ).rejects.toMatchObject({ code: "passkey_invalid" });
    const next = await auth.authenticationOptions(p.pendingToken),
      session = await auth.verify(
        p.pendingToken,
        next.challengeId,
        keys[0].assert(next.options.challenge, config.origin),
      );
    expect((await auth.authenticate(session.token)).id).toBe(f.id);
  } finally {
    await f.close();
  }
});
