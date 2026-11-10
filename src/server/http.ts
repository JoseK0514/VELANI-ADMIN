import { withinDeadline } from "./deadline";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { AdminError } from "./errors";
import { digest, equal } from "./crypto";
import type { AdminConfig } from "./config";
import type { AuthService } from "./auth/service";
import type { Sources } from "./sources/types";
import { ReadService } from "./reads";
import { CommandService, type Target } from "./commands/execute";
import type { CommandKind } from "./commands/validation";
import { Retention } from "./retention";
export type Dependencies = {
  config: AdminConfig;
  pool: Pool;
  journal: Pool;
  auth: AuthService;
  sources: Sources;
};
const prefix = "/api/admin/v1/";
export const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};
function cookies(r: Request) {
  const result: Record<string, string> = {};
  for (const part of (r.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) {
      const key = part.slice(0, at).trim();
      if (key in result) throw new AdminError(400, "invalid_cookie");
      result[key] = part.slice(at + 1).trim();
    }
  }
  return result;
}
async function body(request: Request): Promise<unknown> {
  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new AdminError(415, "json_required");
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > 32768))
    throw new AdminError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new AdminError(400, "invalid_json");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new AdminError(413, "body_too_large");
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (e) {
    if (e instanceof AdminError) throw e;
    throw new AdminError(400, "invalid_json");
  } finally {
    reader.releaseLock();
  }
}
const empty = z.object({}).strict();
const credential = {
  id: z.string().min(1).max(2048),
  rawId: z.string().min(1).max(2048),
  type: z.literal("public-key"),
  clientExtensionResults: z.record(z.string(), z.unknown()),
};
const registrationProof = z
  .object({
    challengeId: z.uuid(),
    response: z
      .object({
        ...credential,
        response: z
          .object({
            clientDataJSON: z.string().max(16000),
            attestationObject: z.string().max(20000),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .strict();
const authenticationProof = z
  .object({
    challengeId: z.uuid(),
    response: z
      .object({
        ...credential,
        response: z
          .object({
            clientDataJSON: z.string().max(16000),
            authenticatorData: z.string().max(16000),
            signature: z.string().max(4096),
            userHandle: z.string().nullable().optional(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .strict();
function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw new AdminError(422, "invalid_fields");
  return p.data;
}
export function createHandler({
  config,
  pool,
  journal,
  auth,
  sources,
}: Dependencies) {
  const retention = new Retention(pool, journal),
    reads = new ReadService(pool, config, sources, retention.guard),
    commands = new CommandService(pool, config, sources, retention.guard);
  const cookiePrefix =
    config.environment === "test"
      ? "velani_admin_test_"
      : "__Host-velani_admin_";
  const cookie = (
    name: string,
    value: string,
    maxAge: number,
    sameSite = "Strict",
  ) =>
    `${cookiePrefix}${name}=${value}; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=${maxAge}${config.environment === "test" ? "" : "; Secure"}`;
  async function limit(key: string, cap: number) {
    const r = (
      await pool.query(
        "INSERT INTO admin.limits(key,hits,expires_at) VALUES($1,1,date_trunc('minute',statement_timestamp())+interval '1 minute') ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN admin.limits.expires_at<=statement_timestamp() THEN 1 ELSE admin.limits.hits+1 END,expires_at=date_trunc('minute',statement_timestamp())+interval '1 minute' RETURNING hits,expires_at",
        [key],
      )
    ).rows[0];
    if (r.hits > cap) {
      const err = new AdminError(429, "rate_limited") as AdminError & {
        retryAfterMs: number;
      };
      err.retryAfterMs = Math.max(
        1000,
        new Date(r.expires_at).getTime() - Date.now(),
      );
      throw err;
    }
  }
  return async (request: Request): Promise<Response> => {
    const requestId = randomUUID(),
      headers = new Headers({ ...privateHeaders, "x-request-id": requestId });
    const json = (value: unknown, status = 200) =>
      Response.json(
        { schemaVersion: 1, ...(value as object), requestId },
        { status, headers },
      );
    const redirect = (location: string, status = 303) => {
      headers.set("location", location);
      return new Response(null, { status, headers });
    };
    const clear = (name: string) =>
      headers.append(
        "set-cookie",
        cookie(name, "", 0, name === "flow" ? "Lax" : "Strict"),
      );
    let path = "";
    const work = async () => {
      try {
        const url = new URL(request.url);
        if (url.origin !== config.origin)
          throw new AdminError(403, "origin_denied");
        if (!url.pathname.startsWith(prefix))
          throw new AdminError(404, "not_found");
        path = url.pathname.slice(prefix.length);
        if (!["GET", "POST", "PATCH"].includes(request.method))
          throw new AdminError(405, "method_not_allowed");
        const origin = request.headers.get("origin"),
          site = request.headers.get("sec-fetch-site");
        if (origin && origin !== config.origin)
          throw new AdminError(403, "origin_denied");
        if (
          request.method !== "GET" &&
          (origin !== config.origin || site === "cross-site")
        )
          throw new AdminError(403, "origin_denied");
        const jar = cookies(request),
          query: Record<string, string> = {};
        for (const [k, v] of url.searchParams) {
          if (k in query) throw new AdminError(400, "invalid_filter");
          query[k] = v;
        }
        if (path.startsWith("auth/")) {
          const ip =
            process.env.VERCEL === "1"
              ? (request.headers.get("x-forwarded-for") ?? "unavailable")
              : "local";
          if (path !== "auth/status" && !path.startsWith("auth/step-up"))
            await limit(
              "login-ip:" +
                digest(config.sessionKey, "rate-ip", ip.slice(0, 200)),
              10,
            );
          if (path === "auth/start" && request.method === "GET") {
            if (Object.keys(query).length)
              throw new AdminError(400, "invalid_filter");
            const start = await auth.start();
            headers.append(
              "set-cookie",
              cookie("flow", start.flowToken, 300, "Lax"),
            );
            return redirect(start.url, 302);
          }
          if (path === "auth/callback" && request.method === "GET") {
            clear("flow");
            const result = await auth.callback(
              url,
              jar[cookiePrefix + "flow"] ?? "",
            );
            await limit("login-owner", 5);
            if (result.pendingToken)
              headers.append(
                "set-cookie",
                cookie("pending", result.pendingToken, 600),
              );
            else clear("pending");
            return redirect(
              config.origin +
                "/login?state=" +
                result.state +
                ("identityRequestId" in result
                  ? "&request=" + result.identityRequestId
                  : ""),
            );
          }
          if (path === "auth/status" && request.method === "GET") {
            await limit("pending-status", 30);
            return json(
              await auth.pendingStatus(jar[cookiePrefix + "pending"] ?? ""),
            );
          }
          if (!path.startsWith("auth/step-up")) {
            if (request.method !== "POST")
              throw new AdminError(405, "method_not_allowed");
            const input = await body(request),
              pending = jar[cookiePrefix + "pending"] ?? "";
            if (path.endsWith("/options")) {
              validate(empty, input);
              await limit("login-owner", 5);
              if (path === "auth/enroll/options")
                return json(await auth.registrationOptions(pending));
              if (path === "auth/passkey/options")
                return json(await auth.authenticationOptions(pending));
            }
            if (path.endsWith("/verify")) {
              if (path === "auth/enroll/verify") {
                const p = validate(registrationProof, input);
                return json(
                  await auth.register(
                    pending,
                    p.challengeId,
                    p.response as RegistrationResponseJSON,
                  ),
                );
              }
              if (path === "auth/passkey/verify") {
                const p = validate(authenticationProof, input);
                const result = await auth.verify(
                  pending,
                  p.challengeId,
                  p.response as AuthenticationResponseJSON,
                );
                headers.append(
                  "set-cookie",
                  cookie("session", result.token, 8 * 3600),
                );
                clear("pending");
                return json({ state: result.state });
              }
            }
            throw new AdminError(404, "not_found");
          }
        }
        const actor = await auth.authenticate(
          jar[cookiePrefix + "session"] ?? "",
        );
        if (
          request.method !== "GET" &&
          !equal(request.headers.get("x-csrf-token") ?? "", actor.csrf)
        )
          throw new AdminError(403, "csrf_denied");
        if (path === "session" && request.method === "GET") {
          await limit("read:" + actor.id, 60);
          if (Object.keys(query).length)
            throw new AdminError(400, "invalid_filter");
          const s = (
            await pool.query(
              "SELECT expires_at,idle_expires_at,factor_at FROM admin.sessions WHERE hash=$1",
              [actor.sessionHash],
            )
          ).rows[0];
          return json({
            state: "authenticated",
            actor: { id: actor.id, email: actor.email, role: "platform_owner" },
            session: {
              expiresAt: s.expires_at,
              idleExpiresAt: s.idle_expires_at,
              factorAt: s.factor_at,
            },
            environment: config.environment,
            csrfToken: actor.csrf,
            capabilities: {
              viewInternalFixtures: true,
              internalWrites: config.writesEnabled,
              customerActions: false,
            },
          });
        }
        if (path === "logout" && request.method === "POST") {
          validate(empty, await body(request));
          clear("session");
          return json(await auth.logout(actor));
        }
        if (path === "auth/step-up/options" && request.method === "POST") {
          validate(empty, await body(request));
          await limit("factor:" + actor.id, 5);
          return json(await auth.stepUpOptions(actor));
        }
        if (path === "auth/step-up/verify" && request.method === "POST") {
          const p = validate(authenticationProof, await body(request));
          await limit("factor-proof:" + actor.id, 10);
          return json(
            await auth.stepUp(
              actor,
              p.challengeId,
              p.response as AuthenticationResponseJSON,
            ),
          );
        }
        if (path === "search" && request.method === "POST") {
          const input = validate(
            z
              .object({
                entity: z.enum(["client", "project", "request", "workplace"]),
                query: z.string().trim().min(1).max(120),
                limit: z.number().int().min(1).max(100).optional(),
                cursor: z.string().max(1024).optional(),
              })
              .strict(),
            await body(request),
          );
          await limit("read:" + actor.id, 60);
          const route = {
            client: "clients",
            project: "projects",
            request: "velani/requests",
            workplace: "nevora/workplaces",
          }[input.entity];
          return json(
            await reads.execute(
              actor,
              route,
              {
                ...(input.limit ? { limit: input.limit } : {}),
                ...(input.cursor ? { cursor: input.cursor } : {}),
              },
              undefined,
              input,
            ),
          );
        }
        const m = path.match(
          /^(nevora\/(?:workplaces|registrations)|velani\/requests|clients|projects|cases|overview|activity|integrations)(?:\/([0-9a-f-]{36}))?$/i,
        );
        if (request.method === "GET" && m) {
          if (
            m[2] &&
            [
              "overview",
              "activity",
              "integrations",
              "nevora/registrations",
            ].includes(m[1])
          )
            throw new AdminError(404, "not_found");
          await limit("read:" + actor.id, 60);
          if (m[2]) await limit("detail:" + actor.id, 20);
          return json(await reads.execute(actor, m[1], query, m[2]));
        }
        if (Object.keys(query).length)
          throw new AdminError(400, "invalid_filter");
        let kind: CommandKind | undefined,
          target: Target = {};
        if (request.method === "POST") {
          kind = (
            {
              clients: "client.create",
              projects: "project.create",
              cases: "case.create",
              notes: "note.create",
            } as Record<string, CommandKind>
          )[path];
          const child = path.match(
            /^clients\/([0-9a-f-]{36})\/(contacts|source-links)$/i,
          );
          if (child) {
            kind =
              child[2] === "contacts" ? "contact.create" : "source-link.create";
            target = { id: child[1] };
          }
        } else if (request.method === "PATCH") {
          const contact = path.match(
            /^clients\/([0-9a-f-]{36})\/contacts\/([0-9a-f-]{36})$/i,
          );
          if (contact) {
            kind = "contact.update";
            target = { parentId: contact[1], id: contact[2] };
          } else if (
            m &&
            m[2] &&
            ["clients", "projects", "cases"].includes(m[1])
          ) {
            kind = (
              {
                clients: "client.update",
                projects: "project.update",
                cases: "case.update",
              } as Record<string, CommandKind>
            )[m[1]];
            target = { id: m[2] };
          }
        }
        if (!kind) throw new AdminError(404, "not_found");
        await limit("write:" + actor.id, 10);
        const receipt = await commands.execute(
          actor,
          kind,
          target,
          await body(request),
        );
        return json(
          { state: "saved", receipt },
          kind.endsWith(".create") && !receipt.replayed ? 201 : 200,
        );
      } catch (e) {
        if (path === "logout") clear("session");
        const known =
            e instanceof AdminError
              ? e
              : new AdminError(503, "service_unavailable"),
          retry = (known as AdminError & { retryAfterMs?: number })
            .retryAfterMs;
        if (retry) headers.set("retry-after", String(Math.ceil(retry / 1000)));
        return json(
          {
            error: {
              code: known.code,
              ...(known.fields ? { fields: known.fields } : {}),
              ...(retry ? { retryAfterMs: retry } : {}),
            },
          },
          known.status,
        );
      }
    };
    let timer: ReturnType<typeof setTimeout>;
    try {
      return await Promise.race([
        withinDeadline(work),
        new Promise<Response>((resolve) => {
          timer = setTimeout(
            () =>
              resolve(
                json(
                  {
                    error: { code: "request_timeout", retry: "same_operation" },
                  },
                  503,
                ),
              ),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer!);
    }
  };
}
