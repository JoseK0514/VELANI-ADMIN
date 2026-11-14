import { z } from "zod";
export const money = z.number().int().min(0).max(100_000_000_000);
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s));
const note = z.string().trim().max(2000).default("");
const date = z.iso.datetime({ offset: true });
const optionalDate = date.nullable().default(null);
const currency = z.literal("USD").default("USD");
const product = z.enum(["velani", "nevora", "shared"]);
export const recordSchemas = {
  inquiry: z
    .object({
      channel: z.enum([
        "client_hub",
        "shopify",
        "email",
        "phone",
        "rondo",
        "other",
      ]),
      sourceRequestId: z.uuid().nullable().default(null),
      reference: text(160),
      title: text(200),
      service: z.enum(["velani", "nevora", "relay", "other"]),
      stage: z.enum(["new", "qualified", "quoted", "won", "lost"]),
      receivedAt: date,
      firstRespondedAt: optionalDate,
      followUpAt: optionalDate,
      estimatedMinor: money.nullable().default(null),
      currency,
      lostReason: z.string().trim().max(300).default(""),
    })
    .strict(),
  plan: z
    .object({
      title: text(200),
      scope: note,
      approvedMinor: money.nullable().default(null),
      estimatedCostMinor: money.nullable().default(null),
      acceptedAt: optionalDate,
      blocker: z.string().trim().max(300).default(""),
      invoiceReference: z.string().trim().max(160).default(""),
      renewalAt: optionalDate,
      currency,
    })
    .strict(),
  milestone: z
    .object({
      title: text(200),
      dueAt: date,
      state: z.enum([
        "planned",
        "in_progress",
        "waiting_client",
        "completed",
        "canceled",
      ]),
      completedAt: optionalDate,
      acceptedAt: optionalDate,
      blocker: z.string().trim().max(300).default(""),
    })
    .strict(),
  expense: z
    .object({
      title: text(200),
      product,
      category: z.enum([
        "hosting",
        "ai",
        "email",
        "support",
        "delivery",
        "other",
      ]),
      amountMinor: money,
      currency,
      occurredAt: date,
      supportMinutes: z.number().int().min(0).max(100000).default(0),
      evidenceReference: text(160),
    })
    .strict(),
  budget: z
    .object({
      title: text(200),
      product,
      month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      amountMinor: money,
      costsReviewed: z.boolean().default(false),
      currency,
    })
    .strict(),
};
export type RecordKind = keyof typeof recordSchemas;
export type BusinessRecord = {
  id: string;
  kind: RecordKind;
  clientId: string | null;
  projectId: string | null;
  data: Record<string, unknown>;
  version: string;
  createdAt: string;
  expiresAt: string | null;
};
const base = {
  sourceId: text(200),
  clientId: z.uuid(),
  projectId: z.uuid().nullable().default(null),
  product: z.enum(["velani", "nevora"]),
  currency: z.literal("USD"),
};
export const financialSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...base,
      kind: z.literal("invoice"),
      status: z.enum(["draft", "open", "paid", "void", "uncollectible"]),
      totalMinor: money,
      paidMinor: money,
      dueAt: optionalDate,
      occurredAt: date,
    })
    .strict()
    .refine((x) => x.paidMinor <= x.totalMinor),
  z
    .object({
      ...base,
      kind: z.literal("subscription"),
      status: z.enum([
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "paused",
      ]),
      monthlyMinor: money,
      renewalAt: optionalDate,
      occurredAt: date,
    })
    .strict(),
  z
    .object({
      ...base,
      kind: z.enum(["payment", "refund"]),
      amountMinor: money,
      occurredAt: date,
    })
    .strict(),
]);
export const healthSchema = z
  .object({
    sourceId: z.uuid(),
    clientId: z.uuid(),
    projectId: z.null().default(null),
    sourceRevision: z.string().regex(/^[1-9][0-9]{0,17}$/),
    incarnation: z.string().regex(/^[1-9][0-9]{0,17}$/),
    origin: z.url().refine((s) => {
      const u = new URL(s);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        u.pathname === "/" &&
        !u.search &&
        !u.hash
      );
    }),
    stage: z.enum([
      "registered",
      "provisioning",
      "setup",
      "activated",
      "trial",
      "paid",
      "restricted",
    ]),
    stageSince: date,
    setupComplete: z.boolean().nullable(),
    firstUsedAt: optionalDate,
    trialStartedAt: optionalDate,
    paidStartedAt: optionalDate,
    canceledAt: optionalDate,
    workerState: z.enum(["healthy", "failed", "unknown"]),
    workerObservedAt: optionalDate,
    trialEndsAt: optionalDate,
    restrictionReason: z.string().trim().max(120).default(""),
  })
  .strict();
export const feedSchema = z
  .object({
    system: z.enum(["finance", "health"]),
    environment: z.enum(["test", "staging", "production"]),
    accountId: text(200),
    observedAt: date,
    validUntil: date,
    historyFrom: z.iso.date().optional(),
    historyThrough: z.iso.date().optional(),
    coverage: z.enum(["complete", "partial"]),
    items: z.array(z.unknown()).max(5000),
  })
  .strict();
