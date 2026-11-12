"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { GoogleLogo, Warning } from "@phosphor-icons/react";
import type { ApiRequest } from "./client";
import type { Command, UiState } from "./contract";

export type Session = {
  actor: { id: string; email: string; role: string };
  environment: string;
  session: { expiresAt: string; idleExpiresAt: string; factorAt: string };
  csrfToken: string;
  capabilities: {
    viewInternalFixtures: boolean;
    internalWrites: boolean;
    customerActions: boolean;
  };
};

export type Request = Omit<ApiRequest, "csrf">;
export type Admin = {
  /** Business call. A 401 or a closed backend moves the whole app to that state. */
  api: (request: Request) => Promise<UiState>;
  /** Pending-login call. Never changes the gate. */
  raw: (request: Request) => Promise<UiState>;
  session: Session | null;
  fixtures: boolean;
  canWrite: boolean;
  canViewInternal: boolean;
  /** Asks for a fresh passkey proof. Resolves true once the server verified it. */
  stepUp: () => Promise<boolean>;
  /** Bumps when local lists and pending edits must be dropped. */
  epoch: number;
  /**
   * Sends one command. The single place that handles a passkey check: on
   * reauth_required it asks for the proof and resends the same request.
   */
  command: (request: Request) => Promise<UiState>;
  /** Commands that have no definitive answer yet. They outlive their form. */
  ops: OpsStore;
};

export type PendingOp = {
  /** Identity of the command slot, for example "clients/<id>#project". */
  key: string;
  /** The page it belongs to. */
  scope: string;
  /** The form to reopen on that page. */
  form: string;
  title: string;
  method: "POST" | "PATCH";
  path: string;
  /** Operation ID, expected version and exact body. Never regenerated. */
  command: Command;
  /** What the user typed, so the form can be shown again as it was. */
  values: Record<string, unknown>;
  state: UiState;
};
export type OpsStore = {
  get: (key: string) => PendingOp | undefined;
  set: (op: PendingOp) => void;
  clear: (key: string) => void;
  clearAll: () => void;
  list: (scope: string) => PendingOp[];
  subscribe: (listener: () => void) => () => void;
  version: () => number;
  /** Changes every time everything was cleared (recovery, restore, sign-out). */
  generation: () => number;
};

export function createOpsStore(): OpsStore {
  const ops = new Map<string, PendingOp>();
  const listeners = new Set<() => void>();
  let version = 0;
  let generation = 0;
  const changed = () => {
    version += 1;
    listeners.forEach((l) => l());
  };
  return {
    get: (key) => ops.get(key),
    set: (op) => {
      ops.set(op.key, op);
      changed();
    },
    clear: (key) => {
      if (ops.delete(key)) changed();
    },
    clearAll: () => {
      generation += 1;
      ops.clear();
      changed();
    },
    list: (scope) => [...ops.values()].filter((o) => o.scope === scope),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
    generation: () => generation,
  };
}

/** Rerenders when pending operations change. */
export function usePendingOps(store: OpsStore, scope: string): PendingOp[] {
  useSyncExternalStore(store.subscribe, store.version, store.version);
  return store.list(scope);
}

/** Command sender with the one shared passkey step-up path. */
export function makeCommand(
  api: Admin["api"],
  stepUp: Admin["stepUp"],
): Admin["command"] {
  return async (request) => {
    let state = await api(request);
    for (let i = 0; i < 2 && state.kind === "reauth"; i++) {
      if (!(await stepUp())) return state;
      state = await api(request);
    }
    return state;
  };
}

export const AdminContext = createContext<Admin | null>(null);
export function useAdmin(): Admin {
  const value = useContext(AdminContext);
  if (!value) throw new Error("AdminContext missing");
  return value;
}

export function Wordmark() {
  return (
    <span className="wordmark" aria-label="Velani">
      VELANI
    </span>
  );
}

export function useCountdown(ms: number): number {
  const [left, setLeft] = useState(Math.ceil(ms / 1000));
  useEffect(() => {
    setLeft(Math.ceil(ms / 1000));
    const timer = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [ms]);
  return left;
}

export function StartLink({ children }: { children: ReactNode }) {
  // A full navigation: the server sets the flow cookie and redirects to Google.
  return (
    <a className="btn primary" href="/api/admin/v1/auth/start">
      <GoogleLogo size={20} weight="bold" aria-hidden />
      {children}
    </a>
  );
}

export function Screen({
  title,
  children,
  action,
  tone,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "warn";
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · Velani admin`;
    heading.current?.focus();
  }, [title]);
  return (
    <main className="screen" id="main">
      <div className="screen-card">
        <Wordmark />
        <h1 ref={heading} tabIndex={-1}>
          {tone === "warn" ? (
            <Warning size={24} weight="regular" aria-hidden className="h-icon" />
          ) : null}
          {title}
        </h1>
        <div className="screen-body" role="status" aria-live="polite">
          {children}
        </div>
        {action ? <div className="screen-action">{action}</div> : null}
      </div>
    </main>
  );
}

