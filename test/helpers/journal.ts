import { readFile } from "node:fs/promises";
import { testDatabase } from "./db";
export async function journalFixture() {
  const db = await testDatabase(false);
  await db.pool.query(await readFile("db/journal/0001_journal.sql", "utf8"));
  return db;
}
