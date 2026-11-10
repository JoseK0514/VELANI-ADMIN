import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AdminConfig } from "../config";
import { assertActor, type Actor } from "../auth/authority";
import type { Sources } from "../sources/types";
import { transaction } from "../db";
import type { BusinessTransaction } from "../retention";
import { digest } from "../crypto";
import { AdminError } from "../errors";
import { parseCommand, payloads, type CommandKind } from "./validation";
import { clientCommand } from "./clients";
import { projectCommand } from "./projects";
import { caseCommand } from "./cases";
import {
  lockClient,
  lockProject,
  lockCase,
  bump,
  type Context,
  type Saved,
} from "./context";
export type Receipt = {
  operationId: string;
  entityType: string;
  entityId: string;
  version: string;
  replayed: boolean;
};
export type Target = { id?: string; parentId?: string };
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export class CommandService {
  constructor(
    private pool: Pool,
    private config: AdminConfig,
    private sources: Sources,
    private business: BusinessTransaction = (work) => transaction(pool, work),
  ) {}
  async execute(
    actor: Actor,
    kind: CommandKind,
    target: Target,
    raw: unknown,
  ): Promise<Receipt> {
    if (!this.config.writesEnabled)
      throw new AdminError(503, "writes_disabled");
    if (
      Object.values(target).some(
        (x) => x !== undefined && !z.uuid().safeParse(x).success,
      )
    )
      throw new AdminError(422, "invalid_target");
    const e = parseCommand(kind, raw),
      hash = digest(
        this.config.sessionKey,
        "command",
        canonical({ kind, target, envelope: e }),
      );
    try {
      return await this.business(async (c) => {
        await assertActor(c, actor, this.config);
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
        const p = e.payload as Record<string, unknown>;
        const sensitive =
          kind === "source-link.create" ||
          kind === "contact.update" ||
          (kind === "contact.create" && p.provenance === "operator_verified") ||
          (kind === "client.update" && p.relationshipState !== undefined) ||
          (kind === "case.update" &&
            (p.clientId !== undefined || p.projectId !== undefined));
        if (sensitive) await assertActor(c, actor, this.config, true);
        const ctx: Context = {
          c,
          config: this.config,
          sources: this.sources,
          expected: e.expectedVersion,
        };
        let saved: Saved;
        if (
          kind.startsWith("client.") ||
          kind.startsWith("contact.") ||
          kind === "source-link.create"
        )
          saved = await clientCommand(ctx, kind, target, e.payload);
        else if (kind === "project.create" || kind === "project.update")
          saved = await projectCommand(ctx, kind, target.id, e.payload);
        else if (kind === "case.create" || kind === "case.update")
          saved = await caseCommand(ctx, kind, target.id, e.payload);
        else {
          const p = payloads["note.create"].parse(e.payload),
            id = randomUUID();
          let table: "clients" | "projects" | "cases";
          if (p.targetType === "client") {
            await lockClient(ctx, p.targetId, ctx.expected);
            table = "clients";
          } else if (p.targetType === "project") {
            await lockProject(ctx, p.targetId);
            table = "projects";
          } else {
            await lockCase(ctx, p.targetId);
            table = "cases";
          }
          const col = {
            client: "client_id",
            project: "project_id",
            case: "case_id",
          }[p.targetType];
          await c.query(
            `INSERT INTO admin.notes(id,${col},text) VALUES($1,$2,$3)`,
            [id, p.targetId, p.text],
          );
          saved = {
            entityType: "note",
            entityId: id,
            version: await bump(c, table, p.targetId),
          };
        }
        const receipt = {
          operationId: e.operationId,
          ...saved,
          replayed: false,
        };
        await c.query(
          "INSERT INTO admin.audit(actor_id,action,entity_type,entity_id,reason_code,result) VALUES($1,$2,$3,$4,$5,'saved')",
          [
            actor.id,
            kind,
            saved.entityType,
            saved.entityId,
            p.reasonCode ?? null,
          ],
        );
        await c.query(
          "INSERT INTO admin.commands(actor_id,operation_id,request_hash,receipt) VALUES($1,$2,$3,$4)",
          [actor.id, e.operationId, hash, receipt],
        );
        return receipt;
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505")
        throw new AdminError(
          409,
          kind === "case.create"
            ? "case_exists"
            : kind === "source-link.create"
              ? "source_link_exists"
              : "duplicate_record",
        );
      throw err;
    }
  }
}
