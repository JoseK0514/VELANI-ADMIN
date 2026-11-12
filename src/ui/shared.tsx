"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GoogleLogo, Warning } from "@phosphor-icons/react";
import type { ApiRequest } from "./client";
import type { UiState } from "./contract";

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
};

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

