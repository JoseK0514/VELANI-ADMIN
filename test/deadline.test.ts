import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabase } from "./helpers/db";
import { transaction } from "../src/server/db";
import { withinDeadline } from "../src/server/deadline";
it("rolls back a command that exceeds its request deadline before commit", async () => {
  const db = await testDatabase();
  try {
    await expect(
      withinDeadline(
        () =>
          transaction(db.pool, async (c) => {
            await c.query(
              "INSERT INTO admin.clients(id,display_name) VALUES($1,'Late owned write')",
              [randomUUID()],
            );
            await delay(30);
          }),
        10,
      ),
    ).rejects.toMatchObject({ code: "request_timeout" });
    expect(
      (await db.pool.query("SELECT count(*) FROM admin.clients")).rows[0].count,
    ).toBe("0");
  } finally {
    await db.close();
  }
});
