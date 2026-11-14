// Private operator entry only. The web principal has SELECT, never publication authority.
import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { transaction } from "../db";
import { feedSchema, financialSchema, healthSchema } from "./model";
import type { BusinessTransaction } from "../retention";
export type FeedBinding = {
  environment: "test" | "staging" | "production";
  financeAccountId: string;
  healthAccountId: string;
};
export async function publishFeed(
  pool: Pool,
  binding: FeedBinding,
  raw: unknown,
  provenance: "operator_recorded" | "provider_verified" = "operator_recorded",
  business: BusinessTransaction = (work) => transaction(pool, work),
) {
  const feed = feedSchema.parse(raw),
    expected =
      feed.system === "finance"
        ? binding.financeAccountId
        : binding.healthAccountId;
  if (
    !expected ||
    feed.environment !== binding.environment ||
    feed.accountId !== expected
  )
    throw Error("feed_binding_mismatch");
  const observed = Date.parse(feed.observedAt),
    valid = Date.parse(feed.validUntil);
  if (
    observed > Date.now() + 30_000 ||
    observed < Date.now() - 86400_000 ||
    valid <= Date.now() ||
    valid <= observed ||
    valid - observed > 86400_000
  )
    throw Error("feed_time_invalid");
  if (
    feed.system === "finance" &&
    (!feed.historyFrom ||
      !feed.historyThrough ||
      feed.historyFrom > feed.historyThrough ||
      feed.historyThrough > feed.observedAt.slice(0, 10))
  )
    throw Error("feed_history_required");
  const items = feed.items.map((x) =>
    feed.system === "finance"
      ? financialSchema.parse(x)
      : healthSchema.parse(x),
  );
  if (new Set(items.map((x) => x.sourceId)).size !== items.length)
    throw Error("duplicate_feed_source");
  for (const item of items) {
    for (const key of [
      "occurredAt",
      "stageSince",
      "firstUsedAt",
      "workerObservedAt",
      "trialStartedAt",
      "paidStartedAt",
      "canceledAt",
    ]) {
      const at = (item as Record<string, unknown>)[key];
      if (typeof at === "string" && Date.parse(at) > observed + 30_000)
        throw Error("feed_future_observation");
    }
    if (feed.system === "health") {
      const h = healthSchema.parse(item);
      if (
        h.paidStartedAt &&
        h.trialStartedAt &&
        Date.parse(h.paidStartedAt) < Date.parse(h.trialStartedAt)
      )
        throw Error("feed_lifecycle_order");
    }
  }
  const hash = createHash("sha256")
    .update(JSON.stringify({ ...feed, items, provenance }))
    .digest("hex");
  return business(async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtext('admin-business-feed'),hashtext($1))",
      [feed.system],
    );
    const prior = (
      await c.query(
        "SELECT observed_at,content_hash FROM admin.business_feeds WHERE system=$1 FOR UPDATE",
        [feed.system],
      )
    ).rows[0];
    if (prior && new Date(prior.observed_at).getTime() >= observed) {
      if (prior.content_hash === hash)
        return { system: feed.system, count: items.length, replayed: true };
      throw Error("feed_observation_not_newer");
    }
    const clientIds = [...new Set(items.map((x) => x.clientId))],
      projectIds = [
        ...new Set(items.map((x) => x.projectId).filter((x) => x !== null)),
      ];
    const clients = (
      await c.query(
        "SELECT c.id FROM admin.clients c WHERE c.id=ANY($1::uuid[]) AND (c.engaged_at IS NULL AND c.prospect_expires_at>statement_timestamp() OR c.engaged_at IS NOT NULL AND (c.delete_after IS NULL OR c.delete_after>statement_timestamp())) FOR SHARE",
        [clientIds],
      )
    ).rows;
    if (clients.length !== clientIds.length)
      throw Error("feed_client_not_visible");
    const projects = (
      await c.query(
        "SELECT id,client_id FROM admin.projects WHERE id=ANY($1::uuid[]) FOR SHARE",
        [projectIds],
      )
    ).rows;
    const links =
      feed.system === "health"
        ? (
            await c.query(
              "SELECT client_id,source_id,source_revision::text,incarnation::text FROM admin.source_links WHERE client_id=ANY($1::uuid[]) AND environment=$2 AND system='nevora' FOR SHARE",
              [clientIds, feed.environment],
            )
          ).rows
        : [];
    for (const item of items) {
      if (
        item.projectId &&
        !projects.some(
          (p) => p.id === item.projectId && p.client_id === item.clientId,
        )
      )
        throw Error("feed_project_client_mismatch");
      if (feed.system === "health") {
        const h = healthSchema.parse(item);
        if (
          !links.some(
            (l) =>
              l.client_id === h.clientId &&
              l.source_id === h.sourceId &&
              l.source_revision === h.sourceRevision &&
              l.incarnation === h.incarnation,
          )
        )
          throw Error("feed_workplace_binding_mismatch");
      }
    }
    await c.query(
      `INSERT INTO admin.business_feeds(system,environment,account_id,observed_at,valid_until,coverage,provenance,item_count,content_hash,history_from,history_through) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(system) DO UPDATE SET environment=excluded.environment,account_id=excluded.account_id,observed_at=excluded.observed_at,valid_until=excluded.valid_until,coverage=excluded.coverage,provenance=excluded.provenance,item_count=excluded.item_count,content_hash=excluded.content_hash,history_from=excluded.history_from,history_through=excluded.history_through,updated_at=statement_timestamp()`,
      [
        feed.system,
        feed.environment,
        feed.accountId,
        feed.observedAt,
        feed.validUntil,
        feed.coverage,
        provenance,
        items.length,
        hash,
        feed.historyFrom ?? null,
        feed.historyThrough ?? null,
      ],
    );
    await c.query("DELETE FROM admin.business_observations WHERE system=$1", [
      feed.system,
    ]);
    await c.query(
      `INSERT INTO admin.business_observations(system,source_id,client_id,project_id,data) SELECT $1,x->>'sourceId',(x->>'clientId')::uuid,(x->>'projectId')::uuid,x FROM jsonb_array_elements($2::jsonb) x`,
      [feed.system, JSON.stringify(items)],
    );
    await c.query(
      "INSERT INTO admin.audit(action,entity_type,entity_id,result) VALUES('business.feed.published','business_feed',$1,'saved')",
      [feed.system],
    );
    return { system: feed.system, count: items.length, replayed: false };
  });
}
