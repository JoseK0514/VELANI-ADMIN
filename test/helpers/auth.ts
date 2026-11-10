import { journalFixture } from "./journal";
import { AuthorizationFence } from "../../src/server/auth/fence";
import { randomUUID } from "node:crypto";
import { testDatabase } from "./db";
import { fixtureConfig } from "./config";
import { oidcFixture } from "./oidc";
import { authenticator } from "./authenticator";
import { GoogleOidc } from "../../src/server/auth/oidc";
import { AuthService } from "../../src/server/auth/service";
export async function authFixture(claims: Record<string, unknown> = {}) {
  const db = await testDatabase(),
    journal = await journalFixture(),
    config = fixtureConfig(db.url),
    issuer = await oidcFixture(claims),
    id = randomUUID();
  config.journalUrl = journal.url;
  await db.pool.query(
    "INSERT INTO admin.actors(id,email,google_subject,enabled,enrollment_until) VALUES($1,$2,$3,true,clock_timestamp()+interval '10 minutes')",
    [id, config.ownerEmail, "owned-google-subject"],
  );
  const auth = new AuthService(
    db.pool,
    config,
    new AuthorizationFence(db.pool, journal.pool, config),
    new GoogleOidc(config, async () => issuer.configuration),
  );
  const pending = async () => {
    const start = await auth.start();
    return auth.callback(await issuer.callback(start.url), start.flowToken);
  };
  const login = async () => {
    const p = await pending(),
      key = authenticator(),
      backup = authenticator();
    for (const k of [key, backup]) {
      const o = await auth.registrationOptions(p.pendingToken);
      await auth.register(
        p.pendingToken,
        o.challengeId,
        k.register(o.options.challenge, config.origin),
      );
    }
    const o = await auth.authenticationOptions(p.pendingToken),
      session = await auth.verify(
        p.pendingToken,
        o.challengeId,
        key.assert(o.options.challenge, config.origin),
      );
    return {
      key,
      backup,
      session,
      actor: await auth.authenticate(session.token),
    };
  };
  return {
    db,
    journal,
    config,
    issuer,
    id,
    auth,
    pending,
    login,
    close: async () => {
      await issuer.close();
      await db.close();
      await journal.close();
    },
  };
}
