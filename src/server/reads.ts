import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { AdminConfig } from "./config";
import type { Actor } from "./auth/authority";
import { assertActor } from "./auth/authority";
import { transaction } from "./db";
import type { BusinessTransaction } from "./retention";
import { AdminError } from "./errors";
import { encodeCursor, decodeCursor } from "./cursor";
import {
  sourceFor,
  type Sources,
  type SourceKind,
  type Item,
} from "./sources/types";
export const visibleClient = (a = "c") =>
  `((${a}.engaged_at IS NULL AND ${a}.prospect_expires_at>statement_timestamp()) OR (${a}.engaged_at IS NOT NULL AND (${a}.delete_after IS NULL OR ${a}.delete_after>statement_timestamp())) OR EXISTS(SELECT 1 FROM admin.retention_holds h WHERE h.entity_type='client' AND h.entity_id=${a}.id AND h.review_at>statement_timestamp()))`;
export const listInput = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(1024).optional(),
    state: z.string().max(32).optional(),
    classification: z
      .enum(["exclude_internal", "include_internal"])
      .default("exclude_internal"),
  })
  .strict();
const sourceKinds: Record<string, SourceKind> = {
  "nevora/workplaces": "workplaces",
  "nevora/registrations": "registrations",
  "velani/requests": "requests",
};
export function catalogAccess(c: Item | null, now = Date.now()): string {
  if (!c) return "unknown";
  const ms = (v: unknown) => (typeof v === "string" ? Date.parse(v) : NaN);
  // The catalog is enrollment/synchronization evidence, not a live Stripe assertion.
  if (
    !Number.isFinite(ms(c.observedAt)) ||
    now - ms(c.observedAt) > 300_000 ||
    ms(c.observedAt) > now + 30_000
  )
    return "unknown";
  if (ms(c.paidThrough) > now) return "paid";
  if (ms(c.trialEndsAt) > now) return "trial";
  if (
    ["past_due", "unpaid"].includes(String(c.subscriptionStatus)) &&
    Number.isFinite(ms(c.paidThrough)) &&
    Number.isFinite(ms(c.pastDueSince)) &&
    ms(c.pastDueSince) + 7 * 86400_000 > now
  )
    return "grace";
  return "restricted";
}
function safeCatalog(c: Item | null) {
  return c
    ? {
        enrollmentName: c.enrollmentName,
        contactProvenance: "source_enrollment",
        access: catalogAccess(c),
        trialEndsAt: c.trialEndsAt,
        planKey: c.planKey,
        observedAt: c.observedAt,
      }
    : { access: "unknown" };
}
export class ReadService {
  constructor(
    private pool: Pool,
    private config: AdminConfig,
    private sources: Sources,
    private business: BusinessTransaction = (work) => transaction(pool, work),
  ) {}
  private wrap(
    data: unknown,
    system: string,
    state: "ready" | "partial" | "unavailable" = "ready",
  ) {
    return {
      schemaVersion: 1,
      state,
      data,
      source: {
        system,
        environment: this.config.environment,
        observedAt: new Date().toISOString(),
        freshness: state === "unavailable" ? "unknown" : "fresh",
        coverage:
          state === "ready"
            ? "complete"
            : state === "partial"
              ? "partial"
              : "unknown",
      },
    };
  }
  private async exclusions(c: PoolClient) {
    const rows = (
      await c.query(
        "SELECT source_id FROM admin.classifications WHERE classification='internal' AND system='nevora' AND environment=$1 LIMIT 1001",
        [this.config.environment],
      )
    ).rows;
    if (rows.length > 1000)
      throw new AdminError(503, "classification_coverage_unavailable");
    return rows.map((r) => r.source_id as string);
  }
  async execute(
    actor: Actor,
    route: string,
    raw: Record<string, unknown> = {},
    id?: string,
    search?: { entity: string; query: string },
  ) {
    const parsed = listInput.safeParse(raw);
    if (!parsed.success) throw new AdminError(400, "invalid_filter");
    const p = parsed.data;
    if (id && !z.uuid().safeParse(id).success)
      throw new AdminError(400, "invalid_id");
    if (
      search &&
      (!["client", "project", "request", "workplace"].includes(search.entity) ||
        !search.query.trim() ||
        search.query.length > 120)
    )
      throw new AdminError(422, "invalid_search");
    return this.business(async (c) => {
      await assertActor(c, actor, this.config);
      if (route === "overview") return this.overview(c);
      if (route === "integrations") return this.integrations(c);
      if (route in sourceKinds) {
        if (p.state) throw new AdminError(400, "invalid_filter");
        const kind = sourceKinds[route],
          excluded =
            p.classification === "exclude_internal" && kind === "workplaces"
              ? await this.exclusions(c)
              : [];
        if (id && excluded.includes(id)) throw new AdminError(404, "not_found");
        let data: unknown,
          state: "ready" | "partial" = "ready";
        if (id) {
          const row = await this.sources.get(kind, id);
          if (!row) throw new AdminError(404, "not_found");
          data = row;
          if (kind === "requests")
            await c.query(
              "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,result) VALUES($1,'detail_viewed','request',$2,'allowed')",
              [actor.id, id],
            );
        } else {
          const scope = JSON.stringify({
              route,
              state: p.state,
              classification: p.classification,
              query: search?.query ?? null,
            }),
            after = p.cursor
              ? decodeCursor(this.config.cursorKey, scope, p.cursor)
              : undefined;
          const page = await this.sources.list(kind, {
            limit: p.limit,
            after,
            query: search?.query,
            excludeIds: excluded,
          });
          const last = page.items.at(-1);
          data = {
            items: page.items,
            nextCursor:
              page.more && last
                ? encodeCursor(this.config.cursorKey, scope, {
                    id: last.id,
                    createdAt: last.createdAt,
                  })
                : null,
          };
        }
        if (kind === "workplaces") {
          const items = id ? [data as Item] : (data as { items: Item[] }).items;
          let catalog: Item[] = [];
          try {
            catalog = await this.sources.batch(
              "catalog",
              items.map((x) => x.id),
            );
          } catch {
            state = "partial";
          }
          const classes = (
            await c.query(
              "SELECT source_id,classification FROM admin.classifications WHERE system='nevora' AND environment=$1 AND source_id=ANY($2::uuid[])",
              [this.config.environment, items.map((x) => x.id)],
            )
          ).rows;
          for (const row of items) {
            row.classification =
              classes.find((x) => x.source_id === row.id)?.classification ??
              "unclassified";
            row.catalog = safeCatalog(
              catalog.find((x) => x.id === row.id) ?? null,
            );
            row.currentHeadcount = { state: "not_supported" };
            row.setupReadiness = { state: "not_supported" };
            row.workerHealth = { state: "not_supported" };
          }
        }
        return this.wrap(data, sourceFor[kind], state);
      }
      return this.internal(c, actor, route, p, id, search?.query);
    });
  }
  private async overview(c: PoolClient) {
    const exclude = await this.exclusions(c),
      results = await Promise.allSettled([
        this.sources.count("workplaces", exclude),
        this.sources.count("registrations"),
        this.sources.count("requests"),
        this.sources.list("catalog", { limit: 100, excludeIds: exclude }),
      ]);
    if (results.every((r) => r.status === "rejected"))
      throw new AdminError(503, "sources_unavailable");
    const section = (i: 0 | 1 | 2, system: string) => {
      const r = results[i];
      return r.status === "fulfilled"
        ? this.wrap({ count: r.value }, system)
        : this.wrap(null, system, "unavailable");
    };
    const internal = (
      await c.query(
        `SELECT (SELECT count(*)::int FROM admin.clients c WHERE ${visibleClient()}) AS clients,(SELECT count(*)::int FROM admin.projects p JOIN admin.clients c ON c.id=p.client_id WHERE ${visibleClient()} AND p.stage NOT IN('completed','canceled')) AS open_projects,(SELECT count(*)::int FROM admin.cases WHERE source_expires_at>statement_timestamp() AND state NOT IN('resolved','closed')) AS open_cases`,
      )
    ).rows[0];
    const catalog = results[3],
      trials =
        catalog.status === "fulfilled" &&
        !catalog.value.more &&
        catalog.value.items.every((x) => catalogAccess(x) !== "unknown")
          ? {
              value: catalog.value.items.filter(
                (x) => catalogAccess(x) === "trial",
              ).length,
              unit: "workplaces",
              reason: null,
            }
          : {
              value: null,
              unit: "workplaces",
              reason: "catalog_coverage_or_freshness_unavailable",
            };
    return this.wrap(
      {
        trials,
        workplaces: section(0, "control"),
        registrations: section(1, "control"),
        requests: section(2, "velani"),
        clients: internal.clients,
        openProjects: internal.open_projects,
        openCases: internal.open_cases,
        revenue: {
          value: null,
          unit: "USD",
          reason: "live_billing_not_verified",
        },
      },
      "combined",
      results.some((r) => r.status === "rejected") ? "partial" : "ready",
    );
  }
  private async integrations(c: PoolClient) {
    const state = (
      await c.query(
        "SELECT last_success_at,removed_clients,removed_cases FROM admin.maintenance_state",
      )
    ).rows[0];
    return this.wrap(
      {
        sources: await Promise.all(
          (["workplaces", "catalog", "requests"] as const).map(async (k) => {
            try {
              await this.sources.list(k, { limit: 1 });
              return {
                system: sourceFor[k],
                state: "ready",
                coverage: "complete",
              };
            } catch {
              return {
                system: sourceFor[k],
                state: "unavailable",
                coverage: "unknown",
              };
            }
          }),
        ),
        retention: {
          lastSuccessAt: state.last_success_at,
          removedClients: state.removed_clients,
          removedCases: state.removed_cases,
        },
        rondoLeads: { state: "disabled", reason: "retention_not_qualified" },
        liveBilling: { state: "unavailable" },
        companySummaries: { state: "not_supported" },
      },
      "admin",
    );
  }
  private async internal(
    c: PoolClient,
    actor: Actor,
    route: string,
    p: z.infer<typeof listInput>,
    id?: string,
    query?: string,
  ) {
    const definitions: Record<
      string,
      {
        from: string;
        where: string;
        json: string;
        search: string;
        states?: string[];
        state?: string;
      }
    > = {
      clients: {
        from: "admin.clients t",
        where: visibleClient("t"),
        search:
          "(t.display_name ILIKE '%'||$5||'%' OR EXISTS(SELECT 1 FROM admin.contacts ct WHERE ct.client_id=t.id AND ct.active AND ct.email=lower($5)))",
        states: ["prospect", "active", "inactive"],
        state: "t.relationship_state",
        json: "jsonb_build_object('id',t.id,'displayName',t.display_name,'relationshipState',t.relationship_state,'version',t.version::text,'createdAt',t.created_at,'engagedAt',t.engaged_at,'closedAt',t.closed_at,'deleteAfter',t.delete_after,'prospectExpiresAt',t.prospect_expires_at)",
      },
      projects: {
        from: "admin.projects t JOIN admin.clients c ON c.id=t.client_id",
        where: visibleClient(),
        search: "t.name ILIKE '%'||$5||'%'",
        states: [
          "planned",
          "in_progress",
          "waiting_client",
          "completed",
          "canceled",
        ],
        state: "t.stage",
        json: "jsonb_build_object('id',t.id,'clientId',t.client_id,'name',t.name,'stage',t.stage,'targetDate',t.target_date,'version',t.version::text,'createdAt',t.created_at)",
      },
      cases: {
        from: "admin.cases t",
        where: "t.source_expires_at>statement_timestamp()",
        search: "t.reference ILIKE '%'||$5||'%'",
        states: ["new", "reviewing", "waiting_client", "resolved", "closed"],
        state: "t.state",
        json: "jsonb_build_object('id',t.id,'sourceRequestId',t.source_request_id,'reference',t.reference,'state',t.state,'clientId',t.client_id,'projectId',t.project_id,'followUpAt',t.follow_up_at,'sourceExpiresAt',t.source_expires_at,'version',t.version::text,'createdAt',t.created_at)",
      },
      activity: {
        from: "admin.audit t",
        where: "true",
        search: "false",
        json: "jsonb_build_object('id',t.id::text,'actorId',t.actor_id,'action',t.action,'entityType',t.entity_type,'entityId',t.entity_id,'reasonCode',t.reason_code,'result',t.result,'createdAt',t.created_at)",
      },
    };
    const d = definitions[route];
    if (!d) throw new AdminError(404, "not_found");
    if (p.state && !d.states?.includes(p.state))
      throw new AdminError(400, "invalid_filter");
    if (route === "activity" && id) throw new AdminError(400, "invalid_filter");
    const scope = JSON.stringify({
        route,
        state: p.state,
        query: query ?? null,
      }),
      after = p.cursor
        ? decodeCursor(this.config.cursorKey, scope, p.cursor)
        : undefined;
    const idType = route === "activity" ? "bigint" : "uuid";
    if (
      after &&
      !(route === "activity"
        ? /^[1-9][0-9]{0,18}$/.test(after.id)
        : z.uuid().safeParse(after.id).success)
    )
      throw new AdminError(400, "invalid_cursor");
    const rows = (
      await c.query(
        `SELECT ${d.json} AS data FROM ${d.from} WHERE ${d.where} AND ($1::${idType} IS NULL OR t.id=$1::${idType}) AND ($2::timestamptz IS NULL OR (t.created_at,t.id)<($2::timestamptz,$3::${idType})) AND ($4::text IS NULL OR ${d.state ?? "NULL::text"}=$4) AND ($5::text IS NULL OR ${d.search}) ORDER BY t.created_at DESC,t.id DESC LIMIT $6`,
        [
          id ?? null,
          after?.createdAt ?? null,
          after?.id ?? null,
          p.state ?? null,
          query ?? null,
          id ? 1 : p.limit + 1,
        ],
      )
    ).rows.map((r) => r.data as Item);
    if (id) {
      if (!rows.length) throw new AdminError(404, "not_found");
      const result = rows[0];
      if (route === "clients") {
        result.contacts = (
          await c.query(
            'SELECT id,name,email,phone,language,active,provenance,source_id AS "sourceId",verified_at AS "verifiedAt" FROM admin.contacts WHERE client_id=$1 ORDER BY created_at,id LIMIT 100',
            [id],
          )
        ).rows;
        result.sourceLinks = (
          await c.query(
            'SELECT system,environment,source_id AS "sourceId",source_revision::text AS "sourceRevision",incarnation::text FROM admin.source_links WHERE client_id=$1 ORDER BY created_at,id LIMIT 100',
            [id],
          )
        ).rows;
      }
      const column = {
        clients: "client_id",
        projects: "project_id",
        cases: "case_id",
      }[route];
      if (column)
        result.notes = (
          await c.query(
            `SELECT id,text,created_at AS "createdAt" FROM admin.notes WHERE ${column}=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,
            [id],
          )
        ).rows;
      await c.query(
        "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,result) VALUES($1,'detail_viewed',$2,$3,'allowed')",
        [actor.id, route, id],
      );
      return this.wrap(result, "admin");
    }
    const items = rows.slice(0, p.limit),
      last = items.at(-1);
    return this.wrap(
      {
        items,
        nextCursor:
          rows.length > p.limit && last
            ? encodeCursor(this.config.cursorKey, scope, {
                id: last.id,
                createdAt: new Date(last.createdAt).toISOString(),
              })
            : null,
      },
      "admin",
    );
  }
}
