import { describe, it, expect } from "vitest";
import { replyDue } from "../src/server/business/calendar";
import { summarizeMoney } from "../src/server/business/metrics";

describe("approved seven-day Eastern response calendar", () => {
  it("counts Saturday and Sunday, preserving local receipt time", () => {
    expect(replyDue("2026-11-13T17:00:00Z")).toBe("2026-11-15T17:00:00.000Z");
  });
  it("moves after-hours receipt to the next opening and handles DST as calendar dates", () => {
    expect(replyDue("2026-11-14T03:01:00Z")).toBe("2026-11-16T12:00:00.000Z");
    expect(replyDue("2026-10-30T16:00:00Z")).toBe("2026-11-01T17:00:00.000Z");
    expect(replyDue("2026-11-13T10:00:00Z")).toBe("2026-11-15T12:00:00.000Z");
  });
});
describe("source-bound financial definitions", () => {
  it("uses the provider's remaining invoice balance after credit adjustments", () => {
    expect(
      summarizeMoney(
        [
          {
            kind: "invoice",
            product: "velani",
            currency: "USD",
            totalMinor: 10000,
            paidMinor: 2000,
            remainingMinor: 3000,
            status: "open",
            dueAt: "2026-11-01T00:00:00Z",
          },
        ],
        "2026-11-01",
        "2026-11-30",
        new Date("2026-11-13T12:00:00Z"),
      ),
    ).toMatchObject({ receivablesMinor: 3000, overdueMinor: 3000 });
  });
  it("keeps MRR, invoice receivables and net cash separate, including partial payments and refunds", () => {
    const result = summarizeMoney(
      [
        {
          kind: "subscription",
          product: "nevora",
          currency: "USD",
          monthlyMinor: 1900,
          status: "active",
        },
        {
          kind: "subscription",
          product: "nevora",
          currency: "USD",
          monthlyMinor: 2900,
          status: "trialing",
        },
        {
          kind: "invoice",
          product: "velani",
          currency: "USD",
          totalMinor: 100000,
          paidMinor: 20000,
          remainingMinor: 80000,
          status: "open",
          dueAt: "2026-11-01T00:00:00Z",
        },
        {
          kind: "payment",
          product: "velani",
          currency: "USD",
          amountMinor: 20000,
          occurredAt: "2026-11-10T00:00:00Z",
        },
        {
          kind: "refund",
          product: "velani",
          currency: "USD",
          amountMinor: 5000,
          occurredAt: "2026-11-11T00:00:00Z",
        },
      ],
      "2026-11-01",
      "2026-11-30",
      new Date("2026-11-13T12:00:00Z"),
    );
    expect(result).toMatchObject({
      mrrMinor: 1900,
      receivablesMinor: 80000,
      overdueMinor: 80000,
      grossCashMinor: 20000,
      refundsMinor: 5000,
      netCashMinor: 15000,
    });
  });
  it("does not mix currencies or count uncollectible invoices as collectible receivables", () => {
    expect(() =>
      summarizeMoney(
        [
          {
            kind: "payment",
            product: "velani",
            currency: "EUR",
            amountMinor: 1,
            occurredAt: "2026-11-10",
          },
        ],
        "2026-11-01",
        "2026-11-30",
      ),
    ).toThrow();
    expect(
      summarizeMoney(
        [
          {
            kind: "invoice",
            product: "velani",
            currency: "USD",
            totalMinor: 100,
            paidMinor: 0,
            status: "uncollectible",
          },
        ],
        "2026-11-01",
        "2026-11-30",
      ).receivablesMinor,
    ).toBe(0);
  });
});
