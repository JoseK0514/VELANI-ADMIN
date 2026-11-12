// @vitest-environment jsdom
/**
 * Drives the real admin UI (AdminApp, the real detail views and CommandForm)
 * in a DOM, with only the network and the passkey prompt replaced. No UI code
 * is stubbed, so these fail if the form drops or regenerates an operation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

const nav = vi.hoisted(() => ({ pathname: "/overview", pushed: [] as string[] }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({
    push: (to: string) => nav.pushed.push(to),
    replace: (to: string) => nav.pushed.push(to),
  }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) =>
    createElement("a", { href, ...rest }, children),
}));
const passkey = vi.hoisted(() => ({ prompts: 0, fail: false }));
vi.mock("@simplewebauthn/browser", () => ({
  startAuthentication: async () => {
    passkey.prompts += 1;
    if (passkey.fail) throw new Error("NotAllowedError");
    return { id: "fictional", rawId: "fictional", type: "public-key", response: {}, clientExtensionResults: {} };
  },
  startRegistration: async () => ({}),
}));

import { AdminApp } from "../src/ui/app";

const CLIENT = "00000000-0000-4000-8000-000000000401";
const PROJECT = "00000000-0000-4000-8000-000000000501";
type Reply = { status: number; body: unknown } | "drop";
type Handler = (method: string, path: string, body: Record<string, unknown> | undefined) => Reply | undefined;

const source = { system: "admin", environment: "test", observedAt: "2026-11-12T14:05:00.000Z", freshness: "fresh", coverage: "complete" };
const ok = (data: unknown): Reply => ({ status: 200, body: { schemaVersion: 1, state: "ready", data, source, requestId: "r" } });
const fail = (status: number, code: string): Reply => ({ status, body: { schemaVersion: 1, error: { code }, requestId: "r" } });
const saved = (entityType: string, entityId: string, replayed = false): Reply => ({
  status: 200,
  body: { schemaVersion: 1, state: "saved", receipt: { operationId: "o", entityType, entityId, version: "7", replayed }, requestId: "r" },
});
const session: Reply = {
  status: 200,
  body: {
    schemaVersion: 1,
    state: "authenticated",
    actor: { id: "a", email: "owner@velani.example", role: "platform_owner" },
    environment: "test",
    session: { expiresAt: "x", idleExpiresAt: "x", factorAt: "x" },
    csrfToken: "fictional-csrf",
    capabilities: { viewInternalFixtures: true, internalWrites: true, customerActions: false },
  },
};
const client = (version = "6") => ({
  id: CLIENT,
  displayName: "Harbor Cafe (fictional)",
  relationshipState: "active",
  version,
  createdAt: "2026-10-03T14:00:00Z",
  engagedAt: "2026-10-05T14:00:00Z",
  closedAt: null,
  deleteAfter: null,
  prospectExpiresAt: null,
  contacts: [],
  sourceLinks: [],
  notes: [],
});

let root: Root;
let host: HTMLElement;
let sent: { method: string; path: string; body: Record<string, unknown> | undefined; csrf: string | null }[];

function serve(handler: Handler) {
  sent = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    const path = String(url).replace("/api/admin/v1/", "");
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    sent.push({ method, path, body, csrf: (init.headers as Record<string, string>)?.["x-csrf-token"] ?? null });
    const reply =
      handler(method, path, body) ??
      (path === "session" ? session : path === "clients/" + CLIENT ? ok(client()) : fail(404, "not_found"));
    if (reply === "drop") throw new TypeError("network dropped");
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { "content-type": "application/json" } });
  });
}
const settle = async () => {
  for (let i = 0; i < 6; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
};
async function open(pathname: string) {
  nav.pathname = pathname;
  await act(async () => root.render(createElement(AdminApp)));
  await settle();
}
const text = () => host.textContent ?? "";
const button = (name: string) => {
  const found = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`No button "${name}". Page: ${text().slice(0, 400)}`);
  return found;
};
const has = (name: string) => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === name);
async function press(name: string) {
  await act(async () => button(name).click());
  await settle();
}
async function type(label: string, value: string) {
  const id = [...document.querySelectorAll("label")].find((l) => l.textContent?.trim().startsWith(label))?.htmlFor;
  const field = document.getElementById(id ?? "") as HTMLInputElement | HTMLTextAreaElement;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const field = (label: string) => {
  const id = [...document.querySelectorAll("label")].find((l) => l.textContent?.trim().startsWith(label))?.htmlFor;
  return document.getElementById(id ?? "") as HTMLInputElement;
};
const commands = (path: string) => sent.filter((s) => s.method !== "GET" && s.path === path);

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  nav.pushed = [];
  passkey.prompts = 0;
  passkey.fail = false;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("admin UI form lifecycle: one operation ID per command", () => {
  it("unknown outcome, close, reload, reopen, retry: New project keeps its operation ID and exact body, and a saved project is not created twice", async () => {
    let posts = 0;
    serve((m, p) => {
      if (m === "POST" && p === "projects") return ++posts === 1 ? "drop" : saved("project", PROJECT, true);
    });
    await open("/clients/" + CLIENT);
    await press("New project");
    await type("Project name", "Online ordering page");
    await press("Create project");
    expect(text()).toContain("may or may not have gone through");
    expect(has("Create project")).toBe(false);

    // Stop: the form closes and the record is reread, the operation is not dropped.
    await press("Close and reload the record");
    expect(document.querySelector("form")).toBeNull();
    expect(text()).toContain("New project has no answer yet");
    expect(sent.filter((s) => s.method === "GET" && s.path === "clients/" + CLIENT).length).toBe(2);

    // Reopening through the normal button shows the same command, never a blank form.
    await press("New project");
    expect(field("Project name").value).toBe("Online ordering page");
    expect(field("Project name").disabled).toBe(true);
    expect(has("Create project")).toBe(false);
    await press("Close and reload the record");

    await press("Review New project");
    await press("Retry the same save");
    const tries = commands("projects");
    expect(tries.length).toBe(2);
    expect(tries[1].body).toEqual(tries[0].body);
    expect(tries[0].body?.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(tries[0].body?.expectedVersion).toBe("0");
    expect(tries[0].csrf).toBe("fictional-csrf");
    // The replay receipt settles it: the project exists, the user is taken to it.
    expect(nav.pushed).toContain("/projects/" + PROJECT);
    expect(text()).not.toContain("has no answer yet");
  });

  it("an unknown outcome survives leaving the page and coming back", async () => {
    let patches = 0;
    serve((m, p) => {
      if (m === "PATCH" && p === "clients/" + CLIENT) return ++patches === 1 ? fail(503, "request_timeout") : saved("client", CLIENT);
    });
    await open("/clients/" + CLIENT);
    await press("Rename");
    await type("Client name", "Harbor Cafe and Bakery (fictional)");
    await press("Save name");
    expect(has("Retry the same save")).toBe(true);
    await open("/integrations");
    expect(text()).not.toContain("Rename client");
    await open("/clients/" + CLIENT);
    expect(text()).toContain("Rename client has no answer yet");
    await press("Review Rename client");
    expect(field("Client name").value).toBe("Harbor Cafe and Bakery (fictional)");
    await press("Retry the same save");
    const tries = commands("clients/" + CLIENT);
    expect(tries.length).toBe(2);
    expect(tries[1].body).toEqual(tries[0].body);
    expect(text()).toContain("Saved. The record below is the current one.");
  });

  it("a definitive rejection ends the operation: typed input stays and the next save has a new ID", async () => {
    let patches = 0;
    serve((m, p) => {
      if (m === "PATCH" && p === "clients/" + CLIENT) return ++patches === 1 ? fail(409, "version_changed") : saved("client", CLIENT);
      if (m === "GET" && p === "clients/" + CLIENT) return ok(client(patches ? "9" : "6"));
    });
    await open("/clients/" + CLIENT);
    await press("Rename");
    await type("Client name", "Harbor Cafe and Bakery (fictional)");
    await press("Save name");
    expect(text()).toContain("This record changed after you opened it");
    await press("Reload record");
    expect(field("Client name").value).toBe("Harbor Cafe and Bakery (fictional)");
    await press("Save name");
    const tries = commands("clients/" + CLIENT);
    expect(tries.map((t) => t.body?.expectedVersion)).toEqual(["6", "9"]);
    expect(tries[1].body?.operationId).not.toBe(tries[0].body?.operationId);
    expect(tries[1].body?.payload).toEqual(tries[0].body?.payload);
  });
});

describe("admin UI form lifecycle: passkey step-up goes through the one global path", () => {
  const stepUpServer = (stepUp: Handler): Handler => {
    let verified = false;
    return (m, p, b) => {
      if (m === "PATCH" && p === "clients/" + CLIENT) return verified ? saved("client", CLIENT) : fail(403, "reauth_required");
      if (p === "auth/step-up/verify") {
        const reply = stepUp(m, p, b) ?? { status: 200, body: { schemaVersion: 1, state: "verified" } };
        if (reply !== "drop" && reply.status === 200) verified = true;
        return reply;
      }
      if (p === "auth/step-up/options")
        return stepUp(m, p, b) ?? { status: 200, body: { schemaVersion: 1, challengeId: "c", options: { challenge: "x" } } };
    };
  };
  const startRelationshipChange = async () => {
    await open("/clients/" + CLIENT);
    await press("Change relationship");
    await press("Save relationship");
    expect(text()).toContain("Confirm it is you");
  };

  it("step-up in the middle of a save resumes the same operation after the proof", async () => {
    serve(stepUpServer(() => undefined));
    await startRelationshipChange();
    await press("Use passkey");
    const tries = commands("clients/" + CLIENT);
    expect(passkey.prompts).toBe(1);
    expect(tries.length).toBe(2);
    expect(tries[1].body).toEqual(tries[0].body);
    expect(commands("auth/step-up/options")[0].csrf).toBe("fictional-csrf");
    expect(text()).toContain("Saved. The record below is the current one.");
    expect(text()).not.toContain("Confirm it is you");
  });

  it("declining the proof keeps the typed input and the pending operation", async () => {
    serve(stepUpServer(() => undefined));
    await startRelationshipChange();
    await press("Not now");
    expect(text()).toContain("Not saved yet. This change needs a passkey check.");
    expect(has("Confirm and save")).toBe(true);
    await press("Confirm and save");
    await press("Use passkey");
    const tries = commands("clients/" + CLIENT);
    expect(tries.length).toBe(3);
    expect(new Set(tries.map((t) => JSON.stringify(t.body))).size).toBe(1);
  });

  it("a recovery fence during step-up closes the whole app and clears pending work", async () => {
    let closed = true;
    serve(stepUpServer((m, p) => (p === "auth/step-up/options" && closed ? fail(503, "authorization_recovery_required") : undefined)));
    await startRelationshipChange();
    await press("Use passkey");
    expect(text()).toContain("The admin is not open");
    expect(text()).toContain("unsaved edits from before were cleared");
    expect(text()).not.toContain("Harbor Cafe");
    expect(document.querySelector("dialog")).toBeNull();
    // Even once the backend answers again, nothing old is offered for retry.
    closed = false;
    await press("Check again");
    expect(text()).toContain("Harbor Cafe");
    expect(text()).not.toContain("has no answer yet");
    expect(document.querySelector("form")).toBeNull();
  });

  it("an expired session during step-up shows sign-in, not the old screen", async () => {
    serve(stepUpServer((m, p) => (p === "auth/step-up/verify" ? fail(401, "authentication_required") : undefined)));
    await startRelationshipChange();
    await press("Use passkey");
    expect(text()).toContain("Sign in to Velani admin");
    expect(text()).not.toContain("Harbor Cafe");
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("an unavailable step-up stays on the form with the edit and the same operation", async () => {
    let down = true;
    serve(stepUpServer((m, p) => (p === "auth/step-up/options" && down ? fail(503, "service_unavailable") : undefined)));
    await startRelationshipChange();
    await press("Use passkey");
    expect(text()).toContain("The admin could not answer");
    down = false;
    await press("Use passkey");
    const tries = commands("clients/" + CLIENT);
    expect(tries.length).toBe(2);
    expect(tries[1].body).toEqual(tries[0].body);
    expect(text()).toContain("Saved.");
  });
});

describe("admin UI form lifecycle: a definitive 404 clears the record", () => {
  it("after a save, a reread that returns 404 removes the old details and every edit control", async () => {
    let gone = false;
    serve((m, p) => {
      if (m === "POST" && p === "notes") {
        gone = true;
        return { status: 201, body: { schemaVersion: 1, state: "saved", receipt: { operationId: "o", entityType: "note", entityId: "n", version: "7", replayed: false } } };
      }
      if (m === "GET" && p === "clients/" + CLIENT && gone) return fail(404, "not_found");
    });
    await open("/clients/" + CLIENT);
    expect(text()).toContain("Harbor Cafe (fictional)");
    await press("Add note");
    await type("Note", "Fictional note.");
    await press("Save note");
    expect(text()).toContain("Not found");
    expect(text()).not.toContain("Harbor Cafe (fictional)");
    expect(has("Rename")).toBe(false);
    expect(has("Add note")).toBe(false);
    expect(document.querySelector("form")).toBeNull();
  });

  it("a transient failure on reread keeps the record and says it may be out of date", async () => {
    let down = false;
    serve((m, p) => {
      if (m === "POST" && p === "notes") {
        down = true;
        return { status: 201, body: { schemaVersion: 1, state: "saved", receipt: { operationId: "o", entityType: "note", entityId: "n", version: "7", replayed: false } } };
      }
      if (m === "GET" && p === "clients/" + CLIENT && down) return fail(503, "service_unavailable");
    });
    await open("/clients/" + CLIENT);
    await press("Add note");
    await type("Note", "Fictional note.");
    await press("Save note");
    expect(text()).toContain("Harbor Cafe (fictional)");
    expect(text()).toContain("could not be reread");
  });
});
