import { readFile } from "node:fs/promises";
import { rootFingerprints } from "../../src/server/auth/fence";
import { testDatabase } from "./db";
export async function journalFixture() {
  const db = await testDatabase(false);
  await db.pool.query(await readFile("db/journal/0001_journal.sql", "utf8"));
  await db.pool.query(
    await readFile("db/journal/0002_authorization_epoch.sql", "utf8"),
  );
  await db.pool.query(
    "UPDATE admin_journal.authorization_state SET recovery_pending=false,root_fingerprints=$1",
    [
      rootFingerprints({
        sessionKey: Buffer.alloc(32, 1),
        encryptionKey: Buffer.alloc(32, 2),
        cursorKey: Buffer.alloc(32, 3),
      }),
    ],
  );
  return db;
}
