"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { newCommand, type Command, type UiState } from "./contract";
import { codeText, fieldIssue, label, stateText } from "./copy";
import { useAdmin, useCountdown } from "./shared";

export type Picked = { id: string; text: string; version?: string; clientId?: string };
export type Value = string | boolean | Picked | null;
export type Values = Record<string, Value>;
export type FieldSpec = {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "date" | "datetime" | "textarea" | "select" | "checkbox" | "pick";
  required?: boolean;
  max?: number;
  hint?: string;
  options?: [string, string][];
  entity?: "client" | "project";
};
export type Receipt = {
  operationId: string;
  entityType: string;
  entityId: string;
  version: string;
  replayed: boolean;
};
export type Built =
  | {
      method: "POST" | "PATCH";
      path: string;
      expectedVersion: string;
      payload: Record<string, unknown>;
    }
  | { errors: Record<string, string> };

type Pending = { method: "POST" | "PATCH"; path: string; command: Command };

function Picker({
  spec,
  value,
  disabled,
  onChange,
  describedBy,
}: {
  spec: FieldSpec;
  value: Picked | null;
  disabled: boolean;
  onChange: (v: Picked | null) => void;
  describedBy?: string;
}) {
  const { api } = useAdmin();
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Picked[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const search = async () => {
    const q = query.trim();
    if (!q) return setNote("Type a name to search.");
    setBusy(true);
    setNote("Searching");
    const state = await api({
      method: "POST",
      path: "search",
      body: { entity: spec.entity, query: q.slice(0, 120) },
    });
    setBusy(false);
    if (state.kind !== "ok") {
      setResults(null);
      return setNote(stateText(state));
    }
    const items = ((state.body.data as { items?: Record<string, unknown>[] })?.items ?? []).map(
      (r) => ({
        id: String(r.id),
        text: String(r.displayName ?? r.name ?? r.id),
        version: typeof r.version === "string" ? r.version : undefined,
        clientId: typeof r.clientId === "string" ? r.clientId : undefined,
      }),
    );
    setResults(items);
    setNote(items.length ? `${items.length} found. Choose one.` : "Nothing matched.");
  };
  return (
    <fieldset className="picker" disabled={disabled} aria-describedby={describedBy}>
      <legend>
        {spec.label}
        {spec.required ? "" : " (optional)"}
      </legend>
      {value ? (
        <p className="picked">
          <span>{value.text}</span>
          <button type="button" className="btn ghost small" onClick={() => onChange(null)}>
            Remove
          </button>
        </p>
      ) : (
        <>
          <div className="row">
            <label className="sr" htmlFor={id}>
              Search {spec.entity}s by name
            </label>
            <input
              id={id}
              type="search"
              value={query}
              maxLength={120}
              placeholder={`Search ${spec.entity}s by name`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
            />
            <button type="button" className="btn outline" onClick={search} disabled={busy}>
              <MagnifyingGlass size={18} aria-hidden />
              Search
            </button>
          </div>
          <p className="muted small" role="status" aria-live="polite">
            {note}
          </p>
          {results?.length ? (
            <ul className="pick-list">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" className="btn outline small" onClick={() => onChange(r)}>
                    Choose {r.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </fieldset>
  );
}

function RetryButton({
  ms,
  onRetry,
  busy,
  text,
}: {
  ms: number;
  onRetry: () => void;
  busy: boolean;
  text: string;
}) {
  const left = useCountdown(ms);
  return (
    <button type="button" className="btn primary" onClick={onRetry} disabled={busy || left > 0}>
      {left > 0 ? `Retry in ${left} seconds` : text}
    </button>
  );
}

/**
 * One command, following the fixed operationId and expectedVersion rules:
 * the operation and its body are kept and resent exactly after a lost
 * response, 503, 429 or a passkey check, and only replaced after the server
 * clearly rejected the command.
 */
export function CommandForm({
  title,
  submit,
  fields,
  initial,
  build,
  onSaved,
  onCancel,
  onReload,
  intro,
}: {
  title: string;
  submit: string;
  fields: FieldSpec[] | ((values: Values) => FieldSpec[]);
  initial: Values;
  build: (values: Values) => Built;
  onSaved: (receipt: Receipt) => void;
  onCancel: () => void;
  /** Rereads the parent record. Edits in this form are kept. */
  onReload?: () => Promise<void> | void;
  intro?: ReactNode;
}) {
  const { api, stepUp } = useAdmin();
  const formId = useId();
  const form = useRef<HTMLFormElement>(null);
  const pending = useRef<Pending | null>(null);
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<UiState | null>(null);
  const [status, setStatus] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [stale, setStale] = useState(false);
  const specs = typeof fields === "function" ? fields(values) : fields;
  // Opening a form moves keyboard focus into it.
  useEffect(() => {
    form.current
      ?.querySelector<HTMLElement>("input:not([disabled]), select, textarea, button")
      ?.focus();
  }, []);
  const set = (name: string, value: Value) => setValues((v) => ({ ...v, [name]: value }));

  const focusFirstError = (errs: Record<string, string>) => {
    const first = specs.find((s) => errs[s.name]);
    if (first)
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>(`[data-field="${first.name}"]`)?.focus(),
      );
  };

  const send = async (op: Pending) => {
    setBusy(true);
    setStatus({ tone: "info", text: "Saving" });
    const state = await api({ method: op.method, path: op.path, body: op.command });
    setBusy(false);
    if (state.kind === "ok") {
      pending.current = null;
      setLocked(null);
      return onSaved(state.body.receipt as Receipt);
    }
    if (state.kind === "reauth") {
      setLocked(state);
      setStatus({ tone: "info", text: stateText(state) });
      if (await stepUp()) return send(op);
      return setStatus({
        tone: "info",
        text: "Not saved yet. This change needs a passkey check. Your edits are kept.",
      });
    }
    if (state.kind === "rate_limited") {
      setLocked(state);
      return setStatus({ tone: "error", text: stateText(state) });
    }
    if (
      state.kind === "uncertain" ||
      (state.kind === "unavailable" && state.code !== "writes_disabled")
    ) {
      setLocked(state);
      return setStatus({
        tone: "error",
        text:
          stateText(state) +
          " The save may or may not have gone through. Retry sends the exact same save, so it cannot be applied twice.",
      });
    }
    if (state.kind === "signed_out" || state.kind === "closed") return;
    // A clear rejection: nothing was committed, so the next save is a new operation.
    pending.current = null;
    setLocked(null);
    if (state.kind === "invalid") {
      const errs: Record<string, string> = {};
      const loose: string[] = [];
      for (const [path, codes] of Object.entries(state.fields)) {
        const name = path.split(".")[0];
        if (specs.some((s) => s.name === name)) errs[name] = fieldIssue(codes) ?? "Check this field.";
        else loose.push(path);
      }
      setErrors(errs);
      focusFirstError(errs);
      return setStatus({ tone: "error", text: codeText(state.code) });
    }
    if (state.kind === "conflict" && state.code === "version_changed") setStale(true);
    setStatus({ tone: "error", text: stateText(state) });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (locked && pending.current) return void send(pending.current);
    const errs: Record<string, string> = {};
    for (const s of specs) {
      const v = values[s.name];
      const text = typeof v === "string" ? v.trim() : "";
      if (s.required && (v === null || v === undefined || v === false || (typeof v === "string" && !text)))
        errs[s.name] = s.type === "checkbox" ? "Tick this to continue." : "This is required.";
      else if (s.max && text.length > s.max) errs[s.name] = `Keep this to ${s.max} characters.`;
    }
    const built = Object.keys(errs).length ? { errors: errs } : build(values);
    if ("errors" in built) {
      setErrors(built.errors);
      setStatus({ tone: "error", text: "Check the marked fields." });
      return focusFirstError(built.errors);
    }
    setErrors({});
    pending.current = {
      method: built.method,
      path: built.path,
      command: newCommand(built.expectedVersion, built.payload),
    };
    void send(pending.current);
  };

  const canEditAgain = locked?.kind === "reauth" || locked?.kind === "rate_limited";
  const disabled = busy || locked !== null;

  return (
    <form ref={form} className="panel form" onSubmit={onSubmit} noValidate aria-labelledby={formId}>
      <h3 id={formId}>{title}</h3>
      {intro}
      {specs.map((s) => {
        const id = `${formId}-${s.name}`;
        const err = errors[s.name];
        const described = [s.hint ? id + "-h" : "", err ? id + "-e" : ""].filter(Boolean).join(" ") || undefined;
        const common = {
          id,
          "data-field": s.name,
          disabled,
          "aria-invalid": err ? true : undefined,
          "aria-describedby": described,
        } as const;
        const v = values[s.name];
        return (
          <div className="ff" key={s.name}>
            {s.type === "pick" ? (
              <Picker
                spec={s}
                value={(v as Picked) ?? null}
                disabled={disabled}
                onChange={(p) => set(s.name, p)}
                describedBy={described}
              />
            ) : s.type === "checkbox" ? (
              <label className="check" htmlFor={id}>
                <input
                  {...common}
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => set(s.name, e.target.checked)}
                />
                <span>{s.label}</span>
              </label>
            ) : (
              <>
                <label htmlFor={id}>
                  {s.label}
                  {s.required ? "" : " (optional)"}
                </label>
                {s.type === "textarea" ? (
                  <textarea
                    {...common}
                    rows={5}
                    maxLength={s.max}
                    value={String(v ?? "")}
                    onChange={(e) => set(s.name, e.target.value)}
                  />
                ) : s.type === "select" ? (
                  <select {...common} value={String(v ?? "")} onChange={(e) => set(s.name, e.target.value)}>
                    {s.required ? null : <option value="">Not set</option>}
                    {s.options?.map(([value, text]) => (
                      <option key={value} value={value}>
                        {text}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...common}
                    type={s.type === "datetime" ? "datetime-local" : s.type}
                    maxLength={s.max}
                    autoComplete="off"
                    value={String(v ?? "")}
                    onChange={(e) => set(s.name, e.target.value)}
                  />
                )}
              </>
            )}
            {s.hint ? (
              <p className="hint" id={id + "-h"}>
                {s.hint}
              </p>
            ) : null}
            {err ? (
              <p className="field-error" id={id + "-e"}>
                {err}
              </p>
            ) : null}
          </div>
        );
      })}
      <p
        className="form-status"
        data-tone={status?.tone}
        role={status?.tone === "error" ? "alert" : "status"}
        aria-live={status?.tone === "error" ? "assertive" : "polite"}
      >
        {status?.text}
      </p>
      <div className="row end">
        {locked ? (
          <>
            {canEditAgain ? (
              <button
                type="button"
                className="btn outline"
                disabled={busy}
                onClick={() => {
                  pending.current = null;
                  setLocked(null);
                  setStatus(null);
                }}
              >
                Edit again
              </button>
            ) : onReload ? (
              <button
                type="button"
                className="btn outline"
                disabled={busy}
                onClick={async () => {
                  await onReload();
                  onCancel();
                }}
              >
                Stop and reload the record
              </button>
            ) : null}
            {locked.kind === "rate_limited" ? (
              <RetryButton
                ms={locked.retryAfterMs}
                busy={busy}
                text="Retry the same save"
                onRetry={() => pending.current && void send(pending.current)}
              />
            ) : (
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Saving" : locked.kind === "reauth" ? "Confirm and save" : "Retry the same save"}
              </button>
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn outline" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            {stale && onReload ? (
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  setStatus({ tone: "info", text: "Reloading the record" });
                  await onReload();
                  setStale(false);
                  setStatus({ tone: "info", text: "Record reloaded. Your edits are still here. Save again." });
                }}
              >
                Reload record
              </button>
            ) : (
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Saving" : submit}
              </button>
            )}
          </>
        )}
      </div>
    </form>
  );
}

export const options = (values: string[]): [string, string][] => values.map((v) => [v, label(v)]);
