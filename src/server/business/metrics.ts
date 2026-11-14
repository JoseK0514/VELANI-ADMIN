export type FinancialFact = Record<string, unknown>;
export function summarizeMoney(
  items: FinancialFact[],
  from: string,
  to: string,
  now = new Date(),
) {
  const result = {
    currency: "USD",
    mrrMinor: 0,
    receivablesMinor: 0,
    overdueMinor: 0,
    grossCashMinor: 0,
    refundsMinor: 0,
    netCashMinor: 0,
  };
  const start = Date.parse(from),
    end = Date.parse(to.length === 10 ? to + "T23:59:59.999Z" : to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end)
    throw Error("invalid_period");
  const number = (v: unknown) => {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)
      throw Error("invalid_amount");
    return v;
  };
  for (const item of items) {
    if (item.currency !== "USD") throw Error("currency_not_supported");
    if (
      item.kind === "subscription" &&
      item.product === "nevora" &&
      item.status === "active"
    )
      result.mrrMinor += number(item.monthlyMinor);
    if (item.kind === "invoice" && item.status === "open") {
      const outstanding = Math.max(
        0,
        number(item.totalMinor) - number(item.paidMinor),
      );
      result.receivablesMinor += outstanding;
      if (
        typeof item.dueAt === "string" &&
        Date.parse(item.dueAt) < now.getTime()
      )
        result.overdueMinor += outstanding;
    }
    const at =
      typeof item.occurredAt === "string" ? Date.parse(item.occurredAt) : NaN;
    if (at >= start && at <= end) {
      if (item.kind === "payment")
        result.grossCashMinor += number(item.amountMinor);
      if (item.kind === "refund")
        result.refundsMinor += number(item.amountMinor);
    }
  }
  result.netCashMinor = result.grossCashMinor - result.refundsMinor;
  if (
    Object.values(result).some(
      (x) => typeof x === "number" && !Number.isSafeInteger(x),
    )
  )
    throw Error("amount_overflow");
  return result;
}
