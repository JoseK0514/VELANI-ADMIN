// Private operator adapter. Only GETs to Stripe's fixed API origin; no SDK or provider secret in the web runtime.
import { z } from "zod";
const mappingSchema = z
  .array(
    z
      .object({
        customerId: z.string().regex(/^cus_[A-Za-z0-9]+$/),
        clientId: z.uuid(),
        product: z.enum(["velani", "nevora"]),
      })
      .strict(),
  )
  .max(5000);
const obj = (value: unknown): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(value);
const id = (value: unknown) =>
  typeof value === "string"
    ? value
    : value && typeof value === "object"
      ? String(obj(value).id ?? "")
      : "";
const timestamp = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
export type StripeReadConfig = {
  key: string;
  accountId: string;
  environment: "test" | "staging" | "production";
  liveReadApproved?: boolean;
  mapping: unknown;
};
export async function collectStripeFeed(
  config: StripeReadConfig,
  fetcher: typeof fetch = fetch,
) {
  if (
    !/^(sk|rk)_(test|live)_[A-Za-z0-9]+$/.test(config.key) ||
    !/^acct_[A-Za-z0-9]+$/.test(config.accountId)
  )
    throw Error("invalid_reporting_key_or_account");
  const live = /_(live)_/.test(config.key);
  if (live && (config.environment !== "production" || !config.liveReadApproved))
    throw Error("live_reporting_not_approved");
  if (!live && config.environment === "production")
    throw Error("reporting_mode_mismatch");
  const mapping = mappingSchema.parse(config.mapping);
  if (new Set(mapping.map((x) => x.customerId)).size !== mapping.length)
    throw Error("duplicate_customer_mapping");
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 30000);
  let complete = true;
  const get = async (path: string, query: Record<string, string> = {}) => {
    const url = new URL("https://api.stripe.com/v1/" + path);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        authorization: "Bearer " + config.key,
        "stripe-version": "2026-10-28.endive",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw Error("reporting_provider_unavailable");
    return obj(await response.json());
  };
  const list = async (path: string, query: Record<string, string> = {}) => {
    const result: Record<string, unknown>[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const response = await get(path, {
        ...query,
        limit: "100",
        ...(cursor ? { starting_after: cursor } : {}),
      });
      if (
        !Array.isArray(response.data) ||
        typeof response.has_more !== "boolean"
      )
        throw Error("reporting_provider_shape");
      const data = response.data.map(obj);
      result.push(...data);
      if (!response.has_more) return result;
      cursor = id(data.at(-1));
      if (!cursor) throw Error("reporting_cursor_missing");
    }
    complete = false;
    return result;
  };
  try {
    const account = await get("account");
    if (account.id !== config.accountId)
      throw Error("reporting_account_mismatch");
    const since = String(
      Date.parse(
        new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10) +
          "T00:00:00Z",
      ) / 1000,
    );
    const [invoices, subscriptions, charges, refunds] = await Promise.all([
      list("invoices"),
      list("subscriptions", { status: "all" }),
      list("charges", { "created[gte]": since }),
      list("refunds", { "created[gte]": since }),
    ]);
    const items: Record<string, unknown>[] = [],
      chargeCustomers = new Map<string, string>();
    const parent = (customer: unknown) => {
      const found = mapping.find((x) => x.customerId === id(customer));
      if (!found) complete = false;
      return found;
    };
    const usd = (record: Record<string, unknown>) => {
      if (record.currency !== "usd") {
        complete = false;
        return false;
      }
      return true;
    };
    for (const invoice of invoices) {
      if (invoice.livemode !== live) throw Error("reporting_mode_mismatch");
      const client = parent(invoice.customer);
      if (!client || !usd(invoice)) continue;
      items.push({
        kind: "invoice",
        sourceId: "invoice:" + id(invoice),
        clientId: client.clientId,
        product: client.product,
        currency: "USD",
        status: invoice.status ?? "draft",
        totalMinor: invoice.total,
        paidMinor: invoice.amount_paid,
        dueAt: timestamp(invoice.due_date),
        occurredAt: timestamp(invoice.created),
      });
    }
    for (const subscription of subscriptions) {
      if (subscription.livemode !== live)
        throw Error("reporting_mode_mismatch");
      const client = parent(subscription.customer);
      if (!client) continue;
      const lineItems = obj(subscription.items),
        lines = Array.isArray(lineItems.data) ? lineItems.data.map(obj) : [];
      if (lineItems.has_more || !lines.length) {
        complete = false;
        continue;
      }
      let monthlyMinor = 0,
        supported = true;
      for (const line of lines) {
        const price = obj(line.price),
          recurring = obj(price.recurring);
        if (
          !usd(price) ||
          recurring.interval !== "month" ||
          recurring.interval_count !== 1 ||
          typeof price.unit_amount !== "number" ||
          !Number.isSafeInteger(price.unit_amount) ||
          !Number.isInteger(line.quantity)
        ) {
          supported = false;
          complete = false;
          break;
        }
        monthlyMinor += price.unit_amount * Number(line.quantity);
      }
      if (!supported) continue;
      items.push({
        kind: "subscription",
        sourceId: "subscription:" + id(subscription),
        clientId: client.clientId,
        product: client.product,
        currency: "USD",
        status: subscription.status,
        monthlyMinor,
        renewalAt: timestamp(
          subscription.current_period_end ?? lines[0].current_period_end,
        ),
        occurredAt: timestamp(subscription.created),
      });
    }
    for (const charge of charges) {
      if (charge.livemode !== live) throw Error("reporting_mode_mismatch");
      chargeCustomers.set(id(charge), id(charge.customer));
      if (!charge.paid || !charge.captured || charge.status !== "succeeded")
        continue;
      const client = parent(charge.customer);
      if (!client || !usd(charge)) continue;
      items.push({
        kind: "payment",
        sourceId: "payment:" + id(charge),
        clientId: client.clientId,
        product: client.product,
        currency: "USD",
        amountMinor: charge.amount_captured,
        occurredAt: timestamp(charge.created),
      });
    }
    let extraCharges = 0;
    for (const refund of refunds) {
      if (refund.livemode !== live) throw Error("reporting_mode_mismatch");
      if (refund.status !== "succeeded") continue;
      const chargeId = id(refund.charge);
      let customer = chargeCustomers.get(chargeId);
      if (
        !customer &&
        /^ch_[A-Za-z0-9]+$/.test(chargeId) &&
        extraCharges++ < 20
      ) {
        const charge = await get("charges/" + chargeId);
        customer = id(charge.customer);
        chargeCustomers.set(chargeId, customer);
      }
      const client = parent(customer);
      if (!client || !usd(refund)) continue;
      items.push({
        kind: "refund",
        sourceId: "refund:" + id(refund),
        clientId: client.clientId,
        product: client.product,
        currency: "USD",
        amountMinor: refund.amount,
        occurredAt: timestamp(refund.created),
      });
    }
    const observedAt = new Date().toISOString();
    return {
      system: "finance",
      environment: config.environment,
      accountId: config.accountId,
      observedAt,
      validUntil: new Date(Date.now() + 15 * 60000).toISOString(),
      coverage: complete ? "complete" : "partial",
      historyFrom: new Date(Number(since) * 1000).toISOString().slice(0, 10),
      historyThrough: observedAt.slice(0, 10),
      items,
    };
  } finally {
    clearTimeout(timer);
  }
}
