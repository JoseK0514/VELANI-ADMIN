// Jose's approved operating calendar: every day, 07:00–22:00 U.S. Eastern.
export const SERVICE_CALENDAR = {
  timeZone: "America/New_York",
  opens: 7,
  closes: 22,
  daysPerWeek: 7,
  replyDays: 2,
} as const;
const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SERVICE_CALENDAR.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function parts(date: Date) {
  const p = Object.fromEntries(
    formatter.formatToParts(date).map((x) => [x.type, x.value]),
  );
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}
function instant(local: ReturnType<typeof parts>) {
  const target = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  let value = target;
  for (let i = 0; i < 4; i++) {
    const p = parts(new Date(value));
    const observed = Date.UTC(
      p.year,
      p.month - 1,
      p.day,
      p.hour,
      p.minute,
      p.second,
    );
    value += target - observed;
  }
  return new Date(value);
}
function advance(p: ReturnType<typeof parts>, days: number) {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + days));
  return {
    ...p,
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}
/** Two service dates after the effective receipt, at the same local time.
 * Before opening starts at 07:00; at/after closing starts at the next opening.
 * Calendar dates, not 48 UTC hours: Eastern daylight-saving changes are preserved. */
export function replyDue(receivedAt: string): string {
  const date = new Date(receivedAt);
  if (!Number.isFinite(date.getTime())) throw Error("invalid_received_at");
  let p = parts(date);
  if (p.hour >= SERVICE_CALENDAR.closes)
    p = { ...advance(p, 1), hour: 7, minute: 0, second: 0 };
  else if (p.hour < SERVICE_CALENDAR.opens)
    p = { ...p, hour: 7, minute: 0, second: 0 };
  return instant(advance(p, SERVICE_CALENDAR.replyDays)).toISOString();
}
export function serviceDateDue(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(day);
  if (!match) throw Error("invalid_service_date");
  return instant({
    year: +match[1],
    month: +match[2],
    day: +match[3],
    hour: 22,
    minute: 0,
    second: 0,
  }).toISOString();
}
