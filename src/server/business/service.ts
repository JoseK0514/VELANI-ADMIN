import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { assertActor, type Actor } from "../auth/authority";
import type { AdminConfig } from "../config";
import { transaction } from "../db";
import { AdminError } from "../errors";
import type { BusinessTransaction } from "../retention";
import type { Sources, SourceKind, Item } from "../sources/types";
import { replyDue, serviceDateDue, SERVICE_CALENDAR } from "./calendar";
import { qualifyHealth, lifecycleMetrics } from "./health";
import { catalogAccess } from "../reads";
import { recordSchemas, type BusinessRecord } from "./model";
import { summarizeMoney } from "./metrics";

const visible = (alias: string) =>
  `(${alias}.engaged_at IS NULL AND ${alias}.prospect_expires_at>statement_timestamp() OR ${alias}.engaged_at IS NOT NULL AND (${alias}.delete_after IS NULL OR ${alias}.delete_after>statement_timestamp()))`;
const shape = `r.id,r.kind,r.client_id AS "clientId",r.project_id AS "projectId",r.data,r.version::text,r.created_at AS "createdAt",r.expires_at AS "expiresAt"`;
const recordWhere = `(r.expires_at IS NULL OR r.expires_at>statement_timestamp()) AND (r.client_id IS NULL OR ${visible("c")})`;
const envelope = z
  .object({
    schemaVersion: z.literal(1),
    operationId: z.uuid(),
    expectedVersion: z.string().regex(/^(0|[1-9][0-9]{0,17})$/),
    payload: z
      .object({
        kind: z.enum(["inquiry", "plan", "milestone", "expense", "budget"]),
        clientId: z.uuid().nullable().default(null),
        projectId: z.uuid().nullable().default(null),
        data: z.unknown(),
      })
      .strict(),
  })
  .strict();
const querySchema = z
  .object({
    kind: z
      .enum(["inquiry", "plan", "milestone", "expense", "budget"])
      .optional(),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .strict();
type Action = {
  id: string;
  title: string;
  reason: string;
  dueAt: string | null;
  href: string;
  overdue: boolean;
};
function canonical(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
        .join(",") +
      "}"
    );
  return JSON.stringify(v);
}
function problem(error: z.ZodError) {
  return new AdminError(
    422,
    "invalid_fields",
    Object.fromEntries(error.issues.map((i) => [i.path.join("."), [i.code]])),
  );
}
function text(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}
function date(v: unknown) {
  return typeof v === "string" || v instanceof Date
    ? new Date(v).toISOString()
    : null;
}

export class BusinessService {
  constructor(
    private pool: Pool,
    private config: AdminConfig,
    private sources: Sources,
    private business: BusinessTransaction = (work) => transaction(pool, work),
  ) {}
  async command(actor: Actor, raw: unknown, id?: string) {
    if (!this.config.writesEnabled)
      throw new AdminError(503, "writes_disabled");
    if (id && !z.uuid().safeParse(id).success)
      throw new AdminError(422, "invalid_target");
    const parsed = envelope.safeParse(raw);
    if (!parsed.success) throw problem(parsed.error);
    const e = parsed.data,
      p = e.payload,
      dataResult = recordSchemas[p.kind].safeParse(p.data);
    if (!dataResult.success) throw problem(dataResult.error);
    const data = dataResult.data as Record<string, unknown>;
    const hash = createHash("sha256")
      .update(canonical({ id: id ?? null, envelope: e }))
      .digest("hex");
    try {
      return await this.business(async (c) => {
        await assertActor(c, actor, this.config, true);
        await c.query(
          "SELECT pg_advisory_xact_lock(hashtext($1),hashtext($2))",
          [actor.id, e.operationId],
        );
        const prior = (
          await c.query(
            "SELECT request_hash,receipt FROM admin.commands WHERE actor_id=$1 AND operation_id=$2",
            [actor.id, e.operationId],
          )
        ).rows[0];
        if (prior) {
          if (prior.request_hash !== hash)
            throw new AdminError(409, "operation_changed");
          return { ...prior.receipt, replayed: true };
        }
        let existing: BusinessRecord | undefined;
        if (id) {
          existing = (
            await c.query(
              `SELECT ${shape} FROM admin.business_records r LEFT JOIN admin.clients c ON c.id=r.client_id WHERE r.id=$1 AND ${recordWhere} FOR UPDATE OF r`,
              [id],
            )
          ).rows[0];
          if (!existing) throw new AdminError(404, "not_found");
          if (existing.version !== e.expectedVersion)
            throw new AdminError(409, "version_changed");
          const canLink =
            p.kind === "inquiry" &&
            (!existing.clientId || existing.clientId === p.clientId) &&
            (!existing.projectId || existing.projectId === p.projectId);
          if (
            existing.kind !== p.kind ||
            (!canLink &&
              (existing.clientId !== p.clientId ||
                existing.projectId !== p.projectId))
          )
            throw new AdminError(409, "business_identity_changed");
          if (
            p.kind === "inquiry" &&
            ["channel", "reference", "receivedAt", "sourceRequestId"].some(
              (k) => data[k] !== existing!.data[k],
            )
          )
            throw new AdminError(409, "business_identity_changed");
        } else if (e.expectedVersion !== "0")
          throw new AdminError(409, "version_changed");
        if (p.clientId) {
          const client = (
            await c.query(
              `SELECT c.relationship_state FROM admin.clients c WHERE c.id=$1 AND ${visible("c")} FOR SHARE`,
              [p.clientId],
            )
          ).rows[0];
          if (!client) throw new AdminError(404, "not_found");
          if (client.relationship_state === "inactive")
            throw new AdminError(409, "client_inactive");
        }
        if (p.projectId) {
          const project = (
            await c.query(
              "SELECT client_id FROM admin.projects WHERE id=$1 FOR SHARE",
              [p.projectId],
            )
          ).rows[0];
          if (!project || project.client_id !== p.clientId)
            throw new AdminError(422, "project_client_mismatch");
        }
        if (["plan", "milestone"].includes(p.kind) && !p.projectId)
          throw new AdminError(422, "project_required");
        if (p.kind === "budget" && (p.clientId || p.projectId))
          throw new AdminError(422, "budget_is_business_wide");
        for (const key of p.kind === "expense"
          ? ["occurredAt"]
          : ["acceptedAt", "completedAt"])
          if (data[key] && Date.parse(text(data[key])) > Date.now() + 30_000)
            throw new AdminError(422, "future_observation");
        if (
          p.kind === "milestone" &&
          ((data.state === "completed" && !data.completedAt) ||
            (data.acceptedAt &&
              (!data.completedAt ||
                Date.parse(text(data.acceptedAt)) <
                  Date.parse(text(data.completedAt)))))
        )
          throw new AdminError(422, "completion_required");
        let expires = existing
          ? existing.expiresAt
            ? new Date(existing.expiresAt)
            : null
          : p.clientId && p.kind !== "inquiry"
            ? null
            : new Date(Date.now() + 90 * 86400_000);
        if (p.kind === "inquiry") {
          const received = Date.parse(text(data.receivedAt));
          if (
            received > Date.now() + 30_000 ||
            received + 90 * 86400_000 <= Date.now()
          )
            throw new AdminError(422, "inquiry_expired_or_future");
          if (
            data.firstRespondedAt &&
            (Date.parse(text(data.firstRespondedAt)) < received ||
              Date.parse(text(data.firstRespondedAt)) > Date.now() + 30_000)
          )
            throw new AdminError(422, "invalid_response_time");
          if (data.stage === "lost" && !text(data.lostReason).trim())
            throw new AdminError(422, "lost_reason_required");
          if (data.stage === "won" && !p.clientId)
            throw new AdminError(422, "client_required");
          expires = new Date(
            Math.min(expires?.getTime() ?? Infinity, received + 90 * 86400_000),
          );
          if (data.channel === "client_hub") {
            const source = data.sourceRequestId
              ? await this.sources.get("requests", text(data.sourceRequestId))
              : null;
            if (
              !source ||
              source.reference !== data.reference ||
              Date.parse(source.createdAt) !== received ||
              !source.expiresAt
            )
              throw new AdminError(409, "source_changed");
            expires = new Date(
              Math.min(expires.getTime(), Date.parse(text(source.expiresAt))),
            );
          } else if (data.sourceRequestId)
            throw new AdminError(422, "invalid_fields");
        }
        if (expires && expires.getTime() <= Date.now())
          throw new AdminError(404, "not_found");
        const entityId = id ?? randomUUID();
        const row = id
          ? (
              await c.query(
                "UPDATE admin.business_records SET data=$2,version=version+1,expires_at=$3,client_id=$4,project_id=$5,updated_at=statement_timestamp() WHERE id=$1 RETURNING version::text",
                [id, data, expires, p.clientId, p.projectId],
              )
            ).rows[0]
          : (
              await c.query(
                "INSERT INTO admin.business_records(id,kind,client_id,project_id,data,expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING version::text",
                [entityId, p.kind, p.clientId, p.projectId, data, expires],
              )
            ).rows[0];
        const receipt = {
          operationId: e.operationId,
          entityType: "business_" + p.kind,
          entityId,
          version: row.version as string,
          replayed: false,
        };
        await c.query(
          "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,result) VALUES($1,$2,$3,$4,'saved')",
          [
            actor.id,
            "business." + p.kind + (id ? ".update" : ".create"),
            receipt.entityType,
            entityId,
          ],
        );
        await c.query(
          "INSERT INTO admin.commands(actor_id,operation_id,request_hash,receipt) VALUES($1,$2,$3,$4)",
          [actor.id, e.operationId, hash, receipt],
        );
        return receipt;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new AdminError(409, "business_record_exists");
      throw error;
    }
  }
  async read(actor: Actor, path: string, raw: Record<string, string> = {}) {
    const q = querySchema.safeParse(raw);
    if (!q.success) throw new AdminError(400, "invalid_filter");
    const from =
        q.data.from ??
        new Date(Date.now() - 29 * 86400_000).toISOString().slice(0, 10),
      to = q.data.to ?? new Date().toISOString().slice(0, 10);
    if (
      Date.parse(from) > Date.parse(to) ||
      Date.parse(to) - Date.parse(from) > 89 * 86400_000
    )
      throw new AdminError(422, "invalid_period");
    return this.business(async (c) => {
      await assertActor(c, actor, this.config);
      const customers = path.match(/^customers\/([0-9a-f-]{36})$/i),
        customerId = customers?.[1] ?? null;
      const recordsResult = await c.query(
        `SELECT ${shape} FROM admin.business_records r LEFT JOIN admin.clients c ON c.id=r.client_id WHERE ${recordWhere} AND ($1::uuid IS NULL OR r.client_id=$1) AND ($2::text IS NULL OR r.kind=$2) ORDER BY r.created_at DESC,r.id DESC LIMIT 1001`,
        [customerId, path === "records" ? (q.data.kind ?? null) : null],
      );
      const records = recordsResult.rows.slice(0, 1000) as BusinessRecord[],
        truncated = recordsResult.rows.length > 1000;
      const feedRows = (
        await c.query(
          'SELECT system,environment,account_id AS "accountId",observed_at AS "observedAt",valid_until AS "validUntil",coverage,provenance,item_count AS "itemCount",to_char(history_from,\'YYYY-MM-DD\') AS "historyFrom",to_char(history_through,\'YYYY-MM-DD\') AS "historyThrough" FROM admin.business_feeds',
        )
      ).rows;
      const feeds: Record<string, Record<string, unknown>> = Object.fromEntries(
        ["finance", "health"].map((system) => {
          const f = feedRows.find((x) => x.system === system),
            fresh =
              f?.environment === this.config.environment &&
              new Date(f.validUntil).getTime() > Date.now();
          return [
            system,
            f
              ? { ...f, state: fresh ? "ready" : "stale" }
              : { system, state: "unavailable", coverage: "unknown" },
          ];
        }),
      );
      const observations = (
        await c.query(
          `SELECT o.system,o.source_id AS "sourceId",o.client_id AS "clientId",o.project_id AS "projectId",o.data FROM admin.business_observations o JOIN admin.clients c ON c.id=o.client_id WHERE ${visible("c")} ORDER BY o.system,o.source_id LIMIT 10001`,
        )
      ).rows;
      const finance = observations
        .filter((x) => x.system === "finance")
        .map((x) => ({
          ...x.data,
          sourceId: x.sourceId,
          clientId: x.clientId,
          projectId: x.projectId,
        }));
      const health = observations
        .filter((x) => x.system === "health")
        .map((x) => ({ ...x.data, clientId: x.clientId }));
      const moneyFor = (a: string, b: string) =>
        feeds.finance.state === "ready" &&
        feeds.finance.coverage === "complete" &&
        finance.length === feeds.finance.itemCount &&
        finance.length <= 5000 &&
        text(feeds.finance.historyFrom) <= a &&
        text(feeds.finance.historyThrough) >= b
          ? summarizeMoney(finance, a, b)
          : null;
      const money = moneyFor(from, to);
      const wrap = (data: unknown, partial = truncated) => ({
        state: partial ? "partial" : "ready",
        data,
        source: {
          system: "business",
          environment: this.config.environment,
          observedAt: new Date().toISOString(),
          freshness: "fresh",
          coverage: partial ? "partial" : "complete",
        },
      });
      if (path === "records")
        return wrap({
          items: q.data.kind
            ? records.filter((r) => r.kind === q.data.kind)
            : records,
          truncated,
        });
      const detail = path.match(/^records\/([0-9a-f-]{36})$/i);
      if (detail) {
        const r = (
          await c.query(
            `SELECT ${shape} FROM admin.business_records r LEFT JOIN admin.clients c ON c.id=r.client_id WHERE r.id=$1 AND ${recordWhere}`,
            [detail[1]],
          )
        ).rows[0];
        if (!r) throw new AdminError(404, "not_found");
        await c.query(
          "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,result) VALUES($1,'detail_viewed','business_record',$2,'allowed')",
          [actor.id, r.id],
        );
        return wrap(r, false);
      }
      const projects = (
        await c.query(
          `SELECT p.id,p.client_id AS "clientId",p.name,p.stage,to_char(p.target_date,'YYYY-MM-DD') AS "targetDate",p.created_at AS "createdAt" FROM admin.projects p JOIN admin.clients c ON c.id=p.client_id WHERE ${visible("c")} AND ($1::uuid IS NULL OR p.client_id=$1) ORDER BY p.created_at DESC LIMIT 1001`,
          [customerId],
        )
      ).rows;
      const cases = (
        await c.query(
          `SELECT x.id,x.reference,x.state,x.client_id AS "clientId",x.project_id AS "projectId",x.source_request_id AS "sourceRequestId",x.follow_up_at AS "followUpAt",x.created_at AS "createdAt" FROM admin.cases x LEFT JOIN admin.clients c ON c.id=x.client_id WHERE x.source_expires_at>statement_timestamp() AND (x.client_id IS NULL OR ${visible("c")}) AND ($1::uuid IS NULL OR x.client_id=$1) ORDER BY x.created_at DESC LIMIT 1001`,
          [customerId],
        )
      ).rows;
      const partial =
        truncated ||
        projects.length > 1000 ||
        cases.length > 1000 ||
        observations.length > 10000;
      if (customers) {
        const id = customers[1],
          client = (
            await c.query(
              `SELECT c.id,c.display_name AS "displayName",c.relationship_state AS state,c.created_at AS "createdAt",c.engaged_at AS "engagedAt" FROM admin.clients c WHERE c.id=$1 AND ${visible("c")}`,
              [id],
            )
          ).rows[0];
        if (!client) throw new AdminError(404, "not_found");
        const contacts = (
          await c.query(
            'SELECT name,language,provenance,verified_at AS "verifiedAt" FROM admin.contacts WHERE client_id=$1 AND active ORDER BY created_at LIMIT 100',
            [id],
          )
        ).rows;
        const customerFinance = finance.filter((x) => x.clientId === id),
          customerHealth = health.filter((x) => x.clientId === id);
        let current: Item[] = [];
        try {
          current = await this.sources.batch(
            "workplaces",
            customerHealth.slice(0, 100).map((x) => String(x.sourceId)),
          );
        } catch {
          /* Absence closes health qualification. */
        }
        await c.query(
          "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,result) VALUES($1,'detail_viewed','business_customer',$2,'allowed')",
          [actor.id, id],
        );
        return wrap(
          {
            client,
            from,
            to,
            contacts,
            records: records.filter((r) => r.clientId === id),
            projects: projects.filter((p) => p.clientId === id),
            cases: cases.filter((x) => x.clientId === id),
            finance: customerFinance,
            financialMetrics: money
              ? summarizeMoney(customerFinance, from, to)
              : null,
            health: qualifyHealth(
              customerHealth,
              feeds.health,
              current,
              this.config.environment,
            ),
            feeds,
          },
          partial || customerHealth.length > 100,
        );
      }
      if (path === "finance")
        return wrap(
          {
            from,
            to,
            metrics: money,
            byProduct: ["velani", "nevora"].map((product) => ({
              product,
              metrics: money
                ? summarizeMoney(
                    finance.filter((f) => f.product === product),
                    from,
                    to,
                  )
                : null,
            })),
            items: finance,
            feeds,
            definitions: {
              mrr: "Current active NEVORA subscription contractual monthly value; excludes trials and past-due subscriptions. Not cash or paid-access proof.",
              cash: "Successful captured payments less successful refunds grouped by provider record creation date in the selected UTC period; includes collected tax. Not service revenue or bank payouts.",
              receivables:
                "Current open invoice balance including tax; excludes draft, void and uncollectible invoices.",
            },
          },
          partial || !money,
        );
      if (path === "costs") {
        const expenses = records.filter(
          (r) =>
            r.kind === "expense" &&
            text(r.data.occurredAt).slice(0, 10) >= from &&
            text(r.data.occurredAt).slice(0, 10) <= to,
        );
        const budgets = records.filter(
          (r) =>
            r.kind === "budget" &&
            text(r.data.month) >= from.slice(0, 7) &&
            text(r.data.month) <= to.slice(0, 7),
        );
        const spendMinor = expenses.reduce(
            (sum, r) => sum + Number(r.data.amountMinor),
            0,
          ),
          budgetMinor = budgets.reduce(
            (sum, r) => sum + Number(r.data.amountMinor),
            0,
          );
        const budgetSpendMinor = records
          .filter(
            (r) =>
              r.kind === "expense" &&
              text(r.data.occurredAt).slice(0, 7) >= from.slice(0, 7) &&
              text(r.data.occurredAt).slice(0, 10) <= to,
          )
          .reduce((sum, r) => sum + Number(r.data.amountMinor), 0);
        const reviewed =
          ["velani", "nevora", "shared"].every((p) =>
            budgets.some(
              (b) => b.data.product === p && b.data.costsReviewed === true,
            ),
          ) && from.slice(0, 7) === to.slice(0, 7);
        return wrap(
          {
            from,
            to,
            expenses,
            budgets,
            spendMinor,
            budgetMinor: budgets.length ? budgetMinor : null,
            budgetSpendMinor,
            headroomMinor:
              budgets.length && !truncated
                ? budgetMinor - budgetSpendMinor
                : null,
            contributionMinor:
              money && reviewed && !partial
                ? money.netCashMinor - spendMinor
                : null,
            costsReviewed: reviewed,
            supportMinutes: expenses.reduce(
              (n, x) => n + Number(x.data.supportMinutes),
              0,
            ),
            basis:
              "Operator-recorded costs. Monthly budget headroom deducts all recorded costs from the first selected month's start through the report end, including costs before the report start. It is not a provider spending limit. Contribution is selected-period net cash less recorded costs; not accounting profit.",
          },
          partial || !reviewed || !money,
        );
      }
      if (path === "insights") {
        const start = Date.parse(from),
          end = Date.parse(to + "T23:59:59.999Z"),
          span = end - start + 1;
        const inRange = (v: unknown, a = start, b = end) =>
          typeof v === "string" && Date.parse(v) >= a && Date.parse(v) <= b;
        const inquiries = records.filter((r) => r.kind === "inquiry"),
          current = inquiries.filter((r) => inRange(r.data.receivedAt)),
          previous = inquiries.filter((r) =>
            inRange(r.data.receivedAt, start - span, start - 1),
          );
        const metrics = (rows: BusinessRecord[]) => ({
          inquiries: rows.length,
          qualified: rows.filter((r) =>
            ["qualified", "quoted", "won"].includes(text(r.data.stage)),
          ).length,
          won: rows.filter((r) => r.data.stage === "won").length,
          lost: rows.filter((r) => r.data.stage === "lost").length,
          replied: rows.filter((r) => !!r.data.firstRespondedAt).length,
          repliedOnTime: rows.filter(
            (r) =>
              r.data.firstRespondedAt &&
              Date.parse(text(r.data.firstRespondedAt)) <=
                Date.parse(replyDue(text(r.data.receivedAt))),
          ).length,
        });
        const daily = Array.from(
          { length: Math.round(span / 86400_000) },
          (_, i) => {
            const day = new Date(start + i * 86400_000)
              .toISOString()
              .slice(0, 10);
            return {
              day,
              ...metrics(
                current.filter(
                  (r) => text(r.data.receivedAt).slice(0, 10) === day,
                ),
              ),
            };
          },
        );
        const previousFrom = new Date(start - span).toISOString().slice(0, 10),
          previousTo = new Date(start - 1).toISOString().slice(0, 10);
        const evidence = await this.readSources(c),
          qualified = qualifyHealth(
            health,
            feeds.health,
            evidence.workplaces.items,
            this.config.environment,
          );
        const healthComplete =
          feeds.health.state === "ready" &&
          feeds.health.coverage === "complete" &&
          health.length === feeds.health.itemCount &&
          evidence.workplaces.coverage === "complete" &&
          qualified.every((x) => x.qualified);
        const lifecycle = {
          current: healthComplete
            ? lifecycleMetrics(qualified, from, to)
            : null,
          previous: healthComplete
            ? lifecycleMetrics(qualified, previousFrom, previousTo)
            : null,
          population:
            "Currently retained, linked workplaces in the published snapshot. Events use source-recorded dates; conversions are eventual observed outcomes for trials started in each period. Not a complete historical retention/churn rate.",
        };
        return wrap(
          {
            from,
            to,
            previousFrom,
            previousTo,
            lifecycle,
            financeComparison: {
              current: money,
              previous: moneyFor(previousFrom, previousTo),
            },
            current: metrics(current),
            previous: metrics(previous),
            daily,
            byChannel: [
              "client_hub",
              "shopify",
              "email",
              "phone",
              "rondo",
              "other",
            ].map((channel) => ({
              channel,
              ...metrics(current.filter((r) => r.data.channel === channel)),
            })),
            population:
              "Retained operator-tracked inquiries; stage is current, not a historical stage snapshot. Expired/unlogged channels are excluded; this is not a complete company-wide conversion rate.",
            calendar: SERVICE_CALENDAR,
            finance: money,
            feeds,
            fullHistoryAvailable: false,
          },
          true,
        );
      }
      if (!["today", "lifecycle", "coverage", "intake"].includes(path))
        throw new AdminError(404, "not_found");
      const sourceData = await this.readSources(c);
      const items: Action[] = [];
      const add = (
        id: string,
        title: string,
        reason: string,
        dueAt: string | null,
        href: string,
      ) => {
        items.push({
          id,
          title,
          reason,
          dueAt,
          href,
          overdue: !!dueAt && Date.parse(dueAt) < Date.now(),
        });
      };
      for (const r of records) {
        const d = r.data;
        if (r.kind === "inquiry" && !["won", "lost"].includes(text(d.stage))) {
          if (!d.firstRespondedAt)
            add(
              r.id + ":reply",
              text(d.title),
              "Human reply not recorded",
              replyDue(text(d.receivedAt)),
              "/business/intake?record=" + r.id,
            );
          if (d.followUpAt)
            add(
              r.id + ":followup",
              text(d.title),
              "Follow-up",
              text(d.followUpAt),
              "/business/intake?record=" + r.id,
            );
        }
        if (
          r.kind === "milestone" &&
          !["completed", "canceled"].includes(text(d.state))
        )
          add(
            r.id,
            text(d.title),
            text(d.blocker) || "Milestone due",
            text(d.dueAt),
            "/business/delivery?record=" + r.id,
          );
        if (r.kind === "milestone" && d.state === "completed" && !d.acceptedAt)
          add(
            r.id + ":acceptance",
            text(d.title),
            "Completed; client acceptance not recorded",
            null,
            "/business/delivery?record=" + r.id,
          );
        if (r.kind === "plan" && d.blocker)
          add(
            r.id + ":blocker",
            text(d.title),
            text(d.blocker),
            null,
            "/business/delivery?record=" + r.id,
          );
        if (r.kind === "plan" && d.renewalAt)
          add(
            r.id + ":renewal",
            text(d.title),
            "Agreement renewal",
            text(d.renewalAt),
            "/business/delivery?record=" + r.id,
          );
      }
      for (const p of projects.slice(0, 1000))
        if (p.targetDate && !["completed", "canceled"].includes(p.stage))
          add(
            p.id,
            p.name,
            "Project target",
            serviceDateDue(new Date(p.targetDate).toISOString().slice(0, 10)),
            "/projects/" + p.id,
          );
      for (const x of cases.slice(0, 1000))
        if (x.followUpAt && !["resolved", "closed"].includes(x.state))
          add(
            x.id,
            x.reference,
            "Case follow-up",
            date(x.followUpAt),
            "/cases/" + x.id,
          );
      for (const r of sourceData.requests.items) {
        const tracked = records.some(
          (x) => x.kind === "inquiry" && x.data.sourceRequestId === r.id,
        );
        if (!tracked)
          add(
            r.id,
            text(r.reference, "Client-hub request"),
            cases.some((c) => c.sourceRequestId === r.id)
              ? "Case exists; human reply not recorded"
              : "Untriaged client-hub inquiry",
            replyDue(r.createdAt),
            "/velani/requests/" + r.id,
          );
      }
      for (const r of sourceData.workplaces.items) {
        const catalog = sourceData.catalog.items.find(
          (x) =>
            x.id === r.id &&
            x.incarnation === r.incarnation &&
            x.environment === r.environment,
        );
        const access = catalogAccess(catalog ?? null);
        if (
          access === "trial" &&
          catalog?.trialEndsAt &&
          Date.parse(text(catalog.trialEndsAt)) <= Date.now() + 7 * 86400_000
        )
          add(
            r.id + ":trial",
            text(catalog.enrollmentName, text(r.origin)),
            "Trial ends within seven days; catalog observation only",
            text(catalog.trialEndsAt),
            "/nevora/workplaces/" + r.id,
          );
        if (["unknown", "restricted", "grace"].includes(access))
          add(
            r.id + ":access",
            text(catalog?.enrollmentName, text(r.origin)),
            access === "unknown"
              ? "Enrollment access needs a fresh source observation"
              : "Catalog reports " + access + " access",
            null,
            "/nevora/workplaces/" + r.id,
          );
      }
      const qualifiedHealth = qualifyHealth(
        health,
        feeds.health,
        sourceData.workplaces.items,
        this.config.environment,
      );
      for (const h of qualifiedHealth) {
        if (
          h.qualified &&
          h.stage === "trial" &&
          h.trialEndsAt &&
          Date.parse(text(h.trialEndsAt)) <= Date.now() + 7 * 86400_000 &&
          !items.some((x) => x.id === text(h.sourceId) + ":trial")
        )
          add(
            text(h.sourceId) + ":trial",
            text(h.origin),
            "Trial ends within seven days; qualified aggregate observation",
            text(h.trialEndsAt),
            "/business/lifecycle",
          );
        if (
          h.qualified &&
          ["registered", "provisioning", "setup"].includes(text(h.stage)) &&
          Date.parse(text(h.stageSince)) < Date.now() - 2 * 86400_000
        )
          add(
            text(h.sourceId) + ":setup",
            text(h.origin),
            "Onboarding stage unchanged for more than two days; review progress",
            text(h.stageSince),
            "/business/lifecycle",
          );
        if (!h.qualified || h.workerState !== "healthy")
          add(
            text(h.sourceId),
            text(h.origin),
            !h.qualified || h.workerState === "unknown"
              ? "Current health needs verification"
              : "Worker failure observed",
            null,
            "/business/lifecycle",
          );
      }
      if (money)
        for (const f of finance)
          if (
            f.kind === "invoice" &&
            f.status === "open" &&
            f.dueAt &&
            Date.parse(text(f.dueAt)) < Date.now() &&
            Number(f.remainingMinor) > 0
          )
            add(
              text(f.sourceId),
              text(f.sourceId),
              "Overdue invoice",
              text(f.dueAt),
              "/business/finance",
            );
      const coverage = [
        {
          channel: "client_hub",
          mode: "source_read",
          state: sourceData.requests.coverage,
        },
        ...["shopify", "email", "phone", "rondo", "other"].map((channel) => ({
          channel,
          mode: "operator_logged",
          state: "manual_coverage_only",
        })),
      ];
      if (path === "coverage")
        return wrap(
          {
            channels: coverage,
            feeds,
            note: "Manual logging does not import a mailbox, Shopify inbox or Rondo transcripts. Automatic coverage is claimed only for the explicitly connected client-hub source.",
          },
          true,
        );
      if (path === "intake")
        return wrap(
          {
            records: records.filter((r) => r.kind === "inquiry"),
            sourceRequests: sourceData.requests.items,
            channels: coverage,
            calendar: SERVICE_CALENDAR,
          },
          partial || sourceData.requests.coverage !== "complete",
        );
      if (path === "lifecycle")
        return wrap(
          {
            observations: qualifiedHealth,
            feed: feeds.health,
            workplaces: sourceData.workplaces.items,
            catalog: sourceData.catalog.items,
            registrations: sourceData.registrations.items,
            sourceCoverage: sourceData.coverage,
            definitions:
              "Control lifecycle and catalog access are not verified company setup, first use or worker health. Imported observations require the current control revision/incarnation; worker observations expire after fifteen minutes.",
          },
          partial ||
            feeds.health.state !== "ready" ||
            sourceData.coverage !== "complete" ||
            qualifiedHealth.some((h) => !h.qualified) ||
            feeds.health.coverage !== "complete" ||
            health.length !== feeds.health.itemCount,
        );
      items.sort(
        (a, b) =>
          Number(b.overdue) - Number(a.overdue) ||
          (a.dueAt ? Date.parse(a.dueAt) : 0) -
            (b.dueAt ? Date.parse(b.dueAt) : 0),
      );
      return wrap(
        {
          items: items.slice(0, 250),
          total: items.length,
          calendar: SERVICE_CALENDAR,
          coverage,
          feeds,
          sourceCoverage: sourceData.coverage,
          note: "Dates are recorded commitments; no mail or payment is sent by this view. Missing coverage is not an empty queue.",
        },
        partial ||
          sourceData.coverage !== "complete" ||
          items.length > 250 ||
          feeds.finance.state !== "ready" ||
          feeds.finance.coverage !== "complete" ||
          feeds.health.state !== "ready" ||
          feeds.health.coverage !== "complete",
      );
    });
  }
  private async readSources(c: PoolClient) {
    const excluded = (
      await c.query(
        "SELECT source_id FROM admin.classifications WHERE system='nevora' AND environment=$1 AND classification='internal' LIMIT 1001",
        [this.config.environment],
      )
    ).rows.map((x) => x.source_id as string);
    const load = async (kind: SourceKind) => {
      const items: Item[] = [];
      let after: { id: string; createdAt: string } | undefined,
        more = false;
      if (excluded.length > 1000) return { items, coverage: "unavailable" };
      try {
        for (let page = 0; page < 5; page++) {
          const result = await this.sources.list(kind, {
            limit: 100,
            after,
            excludeIds: ["workplaces", "catalog"].includes(kind)
              ? excluded
              : [],
          });
          items.push(...result.items);
          more = result.more;
          const last = result.items.at(-1);
          if (!more || !last) break;
          after = { id: last.id, createdAt: last.createdAt };
        }
        return { items, coverage: more ? "partial" : "complete" };
      } catch {
        return { items, coverage: "unavailable" };
      }
    };
    const [requests, workplaces, catalog, registrations] = await Promise.all([
      load("requests"),
      load("workplaces"),
      load("catalog"),
      load("registrations"),
    ]);
    return {
      requests,
      workplaces,
      catalog,
      registrations,
      coverage: [requests, workplaces, catalog, registrations].every(
        (x) => x.coverage === "complete",
      )
        ? "complete"
        : "partial",
    };
  }
}
