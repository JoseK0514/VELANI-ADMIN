import { expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { collectStripeFeed } from "../src/server/business/stripe-read";
const config = {
  key: "rk_test_owned",
  accountId: "acct_owned",
  environment: "test" as const,
  mapping: [
    { customerId: "cus_owned", clientId: randomUUID(), product: "nevora" },
  ],
};
const now = Math.floor(Date.now() / 1000);
const fixtures: Record<string, unknown> = {
  account: { id: "acct_owned" },
  invoices: {
    data: [
      {
        id: "in_owned",
        customer: "cus_owned",
        livemode: false,
        currency: "usd",
        total: 10000,
        amount_paid: 2000,
        status: "open",
        created: now - 100,
        due_date: now - 10,
      },
    ],
    has_more: false,
  },
  subscriptions: {
    data: [
      {
        id: "sub_owned",
        customer: "cus_owned",
        livemode: false,
        status: "active",
        created: now - 100,
        items: {
          data: [
            {
              price: {
                currency: "usd",
                unit_amount: 1900,
                recurring: { interval: "month", interval_count: 1 },
              },
              quantity: 1,
              current_period_end: now + 10000,
            },
          ],
          has_more: false,
        },
      },
    ],
    has_more: false,
  },
  charges: {
    data: [
      {
        id: "ch_owned",
        customer: "cus_owned",
        livemode: false,
        currency: "usd",
        paid: true,
        captured: true,
        status: "succeeded",
        amount_captured: 2000,
        created: now - 50,
        billing_details: { email: "not-retained@example.invalid" },
      },
    ],
    has_more: false,
  },
  refunds: {
    data: [
      {
        id: "re_owned",
        charge: "ch_owned",
        livemode: false,
        currency: "usd",
        status: "succeeded",
        amount: 500,
        created: now - 20,
      },
    ],
    has_more: false,
  },
};
function provider(overrides: Record<string, unknown> = {}) {
  const calls: { url: string; method: string }[] = [];
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    const u = new URL(String(url));
    calls.push({ url: u.href, method: init?.method ?? "GET" });
    expect(u.origin).toBe("https://api.stripe.com");
    return Response.json(
      { ...fixtures, ...overrides }[u.pathname.slice(4)] ?? {},
    );
  }) as typeof fetch;
  return { calls, fetcher };
}
it("reads the bound merchant using only GET and publishes minimal financial facts without billing contacts or keys", async () => {
  const p = provider(),
    result = await collectStripeFeed(config, p.fetcher);
  expect(result.coverage).toBe("complete");
  expect(result.items).toHaveLength(4);
  expect(result.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "subscription", monthlyMinor: 1900 }),
      expect.objectContaining({ kind: "payment", amountMinor: 2000 }),
      expect.objectContaining({ kind: "refund", amountMinor: 500 }),
    ]),
  );
  expect(p.calls.every((c) => c.method === "GET")).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /not-retained|rk_test_owned|billing_details/,
  );
  expect(result.historyFrom < result.historyThrough).toBe(true);
});
it("refuses a different merchant and unapproved live mode before reading financial resources", async () => {
  const p = provider({ account: { id: "acct_other" } });
  await expect(collectStripeFeed(config, p.fetcher)).rejects.toThrow(
    "reporting_account_mismatch",
  );
  expect(p.calls).toHaveLength(1);
  await expect(
    collectStripeFeed({ ...config, key: "rk_live_owned" }, p.fetcher),
  ).rejects.toThrow("live_reporting_not_approved");
  expect(p.calls).toHaveLength(1);
});
it("keeps unmapped customers or unsupported recurring terms partial instead of undercounting as complete", async () => {
  const p = provider({
    subscriptions: {
      data: [
        {
          id: "sub_year",
          customer: "cus_owned",
          status: "active",
          livemode: false,
          created: now,
          items: {
            data: [
              {
                price: {
                  currency: "usd",
                  unit_amount: 10000,
                  recurring: { interval: "year", interval_count: 1 },
                },
                quantity: 1,
              },
            ],
            has_more: false,
          },
        },
      ],
      has_more: false,
    },
  });
  expect((await collectStripeFeed(config, p.fetcher)).coverage).toBe("partial");
  expect(
    (await collectStripeFeed({ ...config, mapping: [] }, provider().fetcher))
      .coverage,
  ).toBe("partial");
});
it("rejects mixed provider test/live observations", async () => {
  const p = provider({
    invoices: { data: [{ id: "in_bad", livemode: true }], has_more: false },
  });
  await expect(collectStripeFeed(config, p.fetcher)).rejects.toThrow(
    "reporting_mode_mismatch",
  );
});
