import { z } from "zod";
import { digest, equal } from "./crypto";
import { AdminError } from "./errors";
import type { Page } from "./sources/types";
const position = z
  .object({
    id: z.uuid().or(z.string().regex(/^[1-9][0-9]{0,18}$/)),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export function encodeCursor(
  key: Buffer,
  scope: string,
  after: NonNullable<Page["after"]>,
): string {
  const body = Buffer.from(JSON.stringify(position.parse(after))).toString(
    "base64url",
  );
  return body + "." + digest(key, "cursor:" + scope, body);
}
export function decodeCursor(
  key: Buffer,
  scope: string,
  cursor: string,
): NonNullable<Page["after"]> {
  try {
    if (cursor.length > 1024) throw Error();
    const [body, proof, extra] = cursor.split(".");
    if (
      !body ||
      !proof ||
      extra ||
      !equal(digest(key, "cursor:" + scope, body), proof)
    )
      throw Error();
    return position.parse(
      JSON.parse(Buffer.from(body, "base64url").toString("utf8")),
    );
  } catch {
    throw new AdminError(400, "invalid_cursor");
  }
}
