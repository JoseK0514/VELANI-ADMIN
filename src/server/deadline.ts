import { AsyncLocalStorage } from "node:async_hooks";
import { AdminError } from "./errors";
const deadlines = new AsyncLocalStorage<number>();
export function withinDeadline<T>(
  work: () => Promise<T>,
  milliseconds = 4500,
): Promise<T> {
  return deadlines.run(
    Math.min(deadlines.getStore() ?? Infinity, Date.now() + milliseconds),
    work,
  );
}
export function assertDeadline() {
  const end = deadlines.getStore();
  if (end !== undefined && Date.now() >= end)
    throw new AdminError(503, "request_timeout");
}
