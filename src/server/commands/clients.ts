import { randomUUID } from "node:crypto";
import { payloads, type CommandKind } from "./validation";
import { AdminError } from "../errors";
import { catalogAccess } from "../reads";
import { lockClient, bump, root, type Context, type Saved } from "./context";
export async function clientCommand(
  ctx: Context,
  kind: CommandKind,
  target: { id?: string; parentId?: string },
  raw: unknown,
): Promise<Saved> {
  const { c, sources, config, expected } = ctx;
  if (kind === "client.create") {
    root(expected);
    const p = payloads[kind].parse(raw),
      id = randomUUID();
    await c.query("INSERT INTO admin.clients(id,display_name) VALUES($1,$2)", [
      id,
      p.displayName,
    ]);
    return { entityType: "client", entityId: id, version: "1" };
  }
  const clientId = kind === "contact.update" ? target.parentId : target.id;
  if (!clientId) throw new AdminError(422, "missing_target");
  const client = await lockClient(ctx, clientId, expected);
  if (kind === "client.update") {
    const p = payloads[kind].parse(raw),
      next = p.relationshipState ?? client.relationship_state;
    if (next !== client.relationship_state) {
      if (next === "active") {
        if (
          !p.confirmServiceRelationship ||
          p.reasonCode !==
            (client.engaged_at
              ? "engagement_reconfirmed"
              : "engagement_confirmed")
        )
          throw new AdminError(422, "engagement_confirmation_required");
        await c.query(
          "UPDATE admin.clients SET relationship_state='active',engaged_at=statement_timestamp(),closed_at=NULL,delete_after=NULL WHERE id=$1",
          [clientId],
        );
      } else if (next === "inactive") {
        if (p.reasonCode !== "relationship_closed")
          throw new AdminError(422, "closure_reason_required");
        if (
          (
            await c.query(
              "SELECT 1 FROM admin.projects WHERE client_id=$1 AND stage NOT IN('completed','canceled') LIMIT 1",
              [clientId],
            )
          ).rowCount
        )
          throw new AdminError(409, "open_projects");
        const links = (
          await c.query(
            "SELECT source_id,incarnation FROM admin.source_links WHERE client_id=$1 LIMIT 101",
            [clientId],
          )
        ).rows;
        if (links.length > 100)
          throw new AdminError(503, "source_coverage_unavailable");
        if (links.length) {
          let ws, cat;
          try {
            [ws, cat] = await Promise.all([
              sources.batch(
                "workplaces",
                links.map((l) => l.source_id),
              ),
              sources.batch(
                "catalog",
                links.map((l) => l.source_id),
              ),
            ]);
          } catch {
            throw new AdminError(503, "source_unavailable");
          }
          for (const l of links) {
            const w = ws.find((x) => x.id === l.source_id),
              b = cat.find((x) => x.id === l.source_id);
            if (
              !w ||
              !b ||
              w.environment !== config.environment ||
              w.incarnation !== l.incarnation ||
              b.incarnation !== l.incarnation ||
              catalogAccess(b) === "unknown"
            )
              throw new AdminError(503, "source_unavailable");
            if (["trial", "paid", "grace"].includes(catalogAccess(b)))
              throw new AdminError(409, "live_nevora_relationship");
          }
        }
        await c.query(
          "UPDATE admin.clients SET relationship_state='inactive',closed_at=CASE WHEN engaged_at IS NOT NULL THEN statement_timestamp() ELSE NULL END,delete_after=CASE WHEN engaged_at IS NOT NULL THEN statement_timestamp()+interval '12 months' ELSE NULL END WHERE id=$1",
          [clientId],
        );
      } else {
        if (
          client.engaged_at ||
          client.relationship_state !== "inactive" ||
          p.reasonCode !== "reopened_work"
        )
          throw new AdminError(422, "invalid_relationship_transition");
        await c.query(
          "UPDATE admin.clients SET relationship_state='prospect' WHERE id=$1",
          [clientId],
        );
      }
    }
    if (p.displayName !== undefined)
      await c.query("UPDATE admin.clients SET display_name=$2 WHERE id=$1", [
        clientId,
        p.displayName,
      ]);
    return {
      entityType: "client",
      entityId: clientId,
      version: await bump(c, "clients", clientId),
    };
  }
  if (kind === "source-link.create") {
    const p = payloads[kind].parse(raw),
      w = await sources.get("workplaces", p.sourceId);
    if (!w) throw new AdminError(404, "not_found");
    if (
      w.environment !== config.environment ||
      w.revision !== p.expectedSourceRevision ||
      w.incarnation !== p.expectedIncarnation
    )
      throw new AdminError(409, "source_changed");
    const id = randomUUID();
    await c.query(
      "INSERT INTO admin.source_links(id,client_id,system,environment,source_id,source_revision,incarnation) VALUES($1,$2,'nevora',$3,$4,$5,$6)",
      [
        id,
        clientId,
        config.environment,
        p.sourceId,
        p.expectedSourceRevision,
        p.expectedIncarnation,
      ],
    );
    return {
      entityType: "source_link",
      entityId: id,
      version: await bump(c, "clients", clientId),
    };
  }
  const p =
    kind === "contact.create"
      ? payloads["contact.create"].parse(raw)
      : payloads["contact.update"].parse(raw);
  let old;
  if (kind === "contact.update") {
    old = (
      await c.query(
        "SELECT * FROM admin.contacts WHERE id=$1 AND client_id=$2",
        [target.id, clientId],
      )
    ).rows[0];
    if (!old) throw new AdminError(404, "not_found");
  }
  let prov = p.provenance ?? old?.provenance,
    sourceId = p.sourceId ?? old?.source_id ?? null,
    verifiedAt = old?.verified_at ?? null;
  const email = p.email ?? old?.email;
  if (
    old &&
    p.email !== undefined &&
    p.email !== old.email &&
    p.provenance === undefined
  ) {
    prov = "asserted";
    sourceId = null;
    verifiedAt = null;
  }
  if (prov === "operator_verified") {
    if (
      (kind === "contact.create" ||
        p.provenance === "operator_verified" ||
        p.email !== undefined) &&
      p.reasonCode !== "confirmed_contact"
    )
      throw new AdminError(422, "contact_confirmation_required");
    if (
      kind === "contact.create" ||
      p.provenance === "operator_verified" ||
      p.email !== undefined
    )
      verifiedAt = new Date();
    sourceId = null;
  } else if (prov === "source_enrollment") {
    if (!sourceId) throw new AdminError(422, "source_contact_mismatch");
    const link = (
      await c.query(
        "SELECT incarnation FROM admin.source_links WHERE client_id=$1 AND source_id=$2 AND environment=$3",
        [clientId, sourceId, config.environment],
      )
    ).rows[0];
    const source = link ? await sources.get("catalog", sourceId) : null;
    if (
      !source ||
      source.incarnation !== link.incarnation ||
      String(source.enrollmentEmail).toLowerCase() !== email
    )
      throw new AdminError(422, "source_contact_mismatch");
    verifiedAt = null;
  } else {
    verifiedAt = null;
    sourceId = null;
  }
  const id = old?.id ?? randomUUID();
  if (old)
    await c.query(
      "UPDATE admin.contacts SET name=$2,email=$3,phone=$4,language=$5,active=$6,provenance=$7,source_id=$8,verified_at=$9,updated_at=statement_timestamp() WHERE id=$1",
      [
        id,
        p.name ?? old.name,
        email,
        p.phone === undefined ? old.phone : p.phone,
        p.language ?? old.language,
        "active" in p ? (p.active ?? old.active) : old.active,
        prov,
        sourceId,
        verifiedAt,
      ],
    );
  else
    await c.query(
      "INSERT INTO admin.contacts(id,client_id,name,email,phone,language,provenance,source_id,verified_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        clientId,
        p.name,
        email,
        p.phone ?? null,
        p.language,
        prov,
        sourceId,
        verifiedAt,
      ],
    );
  return {
    entityType: "contact",
    entityId: id,
    version: await bump(c, "clients", clientId),
  };
}
