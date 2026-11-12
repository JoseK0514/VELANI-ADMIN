"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowClockwise, Info, Warning } from "@phosphor-icons/react";
import { readView, type ReadEnvelope, type UiState } from "./contract";
import { label, stateText, when } from "./copy";
import { useAdmin, useCountdown, usePendingOps } from "./shared";

export type Row = Record<string, unknown>;

const SYSTEMS: Record<string, string> = {
  control: "NEVORA control",
  catalog: "NEVORA enrollment catalog",
  velani: "Velani",
  admin: "Admin records",
  combined: "All sources",
};
export const systemName = (s: unknown) => SYSTEMS[String(s)] ?? label(s);

export function PageHead({
  title,
  lede,
  action,
  tag,
}: {
  title: string;
  lede?: ReactNode;
  action?: ReactNode;
  tag?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} · Velani admin`;
    heading.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <header className="page-head">
      <div>
        <h1 ref={heading} tabIndex={-1}>
          {title}
          {tag}
        </h1>
        {lede ? <p className="lede">{lede}</p> : null}
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}

export function Notice({
  tone = "info",
  children,
  action,
}: {
  tone?: "info" | "warn" | "ok";
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="notice" data-tone={tone}>
      {tone === "warn" ? (
        <Warning size={20} aria-hidden className="notice-icon" />
      ) : (
        <Info size={20} aria-hidden className="notice-icon" />
      )}
      <div className="notice-text">{children}</div>
      {action}
    </div>
  );
}

export function Tag({ children, tone }: { children: ReactNode; tone?: "accent" | "warn" }) {
  return (
    <span className="tag" data-tone={tone}>
      {children}
    </span>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function RetryIn({ ms, onRetry }: { ms: number; onRetry: () => void }) {
  const left = useCountdown(ms);
  return (
    <button className="btn outline" disabled={left > 0} onClick={onRetry}>
      {left > 0 ? `Try again in ${left} seconds` : "Try again"}
    </button>
  );
}

/** Any read that did not return data. One message, one next step. */
export function Problem({ state, onRetry }: { state: UiState; onRetry: () => void }) {
  if (state.kind === "ok" || state.kind === "signed_out" || state.kind === "closed") return null;
  const id = "requestId" in state && state.requestId ? state.requestId : null;
  const title =
    state.kind === "not_found"
      ? "Not found"
      : state.kind === "rate_limited"
        ? "Too many requests"
        : state.kind === "forbidden"
          ? "Not allowed"
          : "This could not be loaded";
  return (
    <div className="panel problem" role="alert">
      <h2>{title}</h2>
      <p>{stateText(state)}</p>
      {state.kind === "not_found" ? null : (
        <p className="muted">Nothing is shown rather than guessing. No records were changed.</p>
      )}
      {id ? <p className="muted small">Reference {id}</p> : null}
      {state.kind === "rate_limited" ? (
        <RetryIn ms={state.retryAfterMs} onRetry={onRetry} />
      ) : state.kind === "not_found" || state.kind === "forbidden" ? null : (
        <button className="btn outline" onClick={onRetry}>
          <ArrowClockwise size={18} aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="panel loading" role="status" aria-live="polite">
      <span className="sr">Loading {what}</span>
      <span className="skeleton" aria-hidden />
      <span className="skeleton short" aria-hidden />
      <span className="skeleton" aria-hidden />
    </div>
  );
}

/** Where the data came from, and a plain warning when it is partial or stale. */
export function SourceNote({ envelope }: { envelope: ReadEnvelope }) {
  const view = readView(envelope);
  const s = envelope.source;
  return (
    <>
      {view === "partial" ? (
        <Notice tone="warn">
          Some of this could not be read. Missing values are shown as Unknown, not as empty or 0.
        </Notice>
      ) : null}
      {view === "stale" ? (
        <Notice tone="warn">This may be out of date. The source did not confirm it is current.</Notice>
      ) : null}
      {view === "unavailable" ? (
        <Notice tone="warn">The source is unavailable, so nothing is shown for it.</Notice>
      ) : null}
      {s ? (
        <p className="source-line">
          {systemName(s.system)} · {label(s.environment)} · read {when(s.observedAt, "at an unknown time")}
        </p>
      ) : null}
    </>
  );
}

export type ReadState =
  | { status: "loading" }
  | { status: "done"; result: UiState; refreshError?: UiState };

/** Loads one read. reload() refreshes in place and keeps what is on screen. */
export function useRead(path: string | null) {
  const { api } = useAdmin();
  const [state, setState] = useState<ReadState>({ status: "loading" });
  const load = useCallback(
    async (soft: boolean) => {
      if (!path) return;
      if (!soft) setState({ status: "loading" });
      const result = await api({ method: "GET", path });
      // What is on screen is kept only through a transient failure. A
      // definitive answer (404 expired or removed, 403, 400) replaces it, so
      // an expired record is never left displayed or editable.
      const transient =
        result.kind === "uncertain" ||
        result.kind === "unavailable" ||
        result.kind === "rate_limited";
      setState((prev) =>
        soft && transient && prev.status === "done" && prev.result.kind === "ok"
          ? { ...prev, refreshError: result }
          : { status: "done", result },
      );
    },
    [api, path],
  );
  useEffect(() => {
    void load(false);
  }, [load]);
  return {
    state,
    reload: useCallback(() => load(true), [load]),
    retry: useCallback(() => load(false), [load]),
  };
}

/** Commands on this page that still have no definitive answer. */
export function PendingOps({ scope, onOpen }: { scope: string; onOpen: (form: string) => void }) {
  const { ops } = useAdmin();
  const pending = usePendingOps(ops, scope);
  return (
    <>
      {pending.map((op) => (
        <Notice
          key={op.key}
          tone="warn"
          action={
            <button className="btn outline small" onClick={() => onOpen(op.form)}>
              Review<span className="sr"> {op.title}</span>
            </button>
          }
        >
          <strong>{op.title}</strong> has no answer yet. It may or may not have been saved. Review it to
          send the same save again and find out. It cannot be applied twice.
        </Notice>
      ))}
    </>
  );
}

export function envelopeOf<T>(state: ReadState): ReadEnvelope<T> | null {
  return state.status === "done" && state.result.kind === "ok"
    ? (state.result.body as unknown as ReadEnvelope<T>)
    : null;
}
