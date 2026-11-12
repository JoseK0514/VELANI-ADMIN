"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint } from "@phosphor-icons/react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { UiState } from "./contract";
import { codeText, stateText } from "./copy";
import { Screen, StartLink, useCountdown, type Admin } from "./shared";

type Step =
  | { k: "checking" }
  | { k: "approval"; requestId: string | null }
  | { k: "enroll"; registered: number }
  | { k: "passkey" }
  | { k: "problem"; state: UiState };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Wait({ ms, onDone }: { ms: number; onDone: () => void }) {
  const left = useCountdown(ms);
  return (
    <button className="btn primary" disabled={left > 0} onClick={onDone}>
      {left > 0 ? `Try again in ${left} seconds` : "Try again"}
    </button>
  );
}

/**
 * The pending part of sign-in, after Google returns to /login?state=...
 * The query only picks which message to show first. What happens next always
 * comes from GET /auth/status and the passkey endpoints. Nothing here grants
 * access: the app only opens after GET /session answers authenticated.
 */
export function Login({
  raw,
  onAuthenticated,
}: {
  raw: Admin["raw"];
  onAuthenticated: () => void;
}) {
  const [step, setStep] = useState<Step>({ k: "checking" });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setProblem(null);
    const params = new URLSearchParams(window.location.search);
    if (params.get("state") === "identity_approval_required") {
      const request = params.get("request") ?? "";
      return setStep({ k: "approval", requestId: UUID.test(request) ? request : null });
    }
    setStep({ k: "checking" });
    const status = await raw({ method: "GET", path: "auth/status" });
    if (status.kind !== "ok") return setStep({ k: "problem", state: status });
    const registered = Number(status.body.registeredFactors);
    if (status.body.state === "enrollment_required" && Number.isInteger(registered))
      return setStep({ k: "enroll", registered });
    if (status.body.state === "passkey_required") return setStep({ k: "passkey" });
    setStep({ k: "problem", state: { kind: "unavailable", code: "unexpected_response" } });
  }, [raw]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** A failed passkey step stays on this screen unless the pending login itself ended. */
  const fail = (state: UiState) => {
    if (
      (state.kind === "signed_out" && state.code === "authentication_required") ||
      state.kind === "closed" ||
      state.kind === "rate_limited"
    )
      return setStep({ k: "problem", state });
    if (state.kind === "forbidden" && state.code === "backup_factor_required")
      return void refresh();
    setProblem(stateText(state));
  };

  const enroll = async () => {
    setBusy(true);
    setProblem(null);
    const options = await raw({ method: "POST", path: "auth/enroll/options", body: {} });
    if (options.kind !== "ok") {
      setBusy(false);
      return fail(options);
    }
    let response: unknown;
    try {
      response = await startRegistration({
        optionsJSON: options.body.options as Parameters<
          typeof startRegistration
        >[0]["optionsJSON"],
      });
    } catch (e) {
      setBusy(false);
      return setProblem(
        e instanceof Error && e.name === "InvalidStateError"
          ? "That passkey is already saved. Use a different device or security key."
          : "The passkey prompt was closed. Nothing was saved.",
      );
    }
    const verified = await raw({
      method: "POST",
      path: "auth/enroll/verify",
      body: { challengeId: options.body.challengeId, response },
    });
    setBusy(false);
    if (verified.kind === "ok" && verified.body.state === "registered") return void refresh();
    fail(verified.kind === "ok" ? { kind: "unavailable", code: "unexpected_response" } : verified);
  };

  const signIn = async () => {
    setBusy(true);
    setProblem(null);
    const options = await raw({ method: "POST", path: "auth/passkey/options", body: {} });
    if (options.kind !== "ok") {
      setBusy(false);
      return fail(options);
    }
    let response: unknown;
    try {
      response = await startAuthentication({
        optionsJSON: options.body.options as Parameters<
          typeof startAuthentication
        >[0]["optionsJSON"],
      });
    } catch {
      setBusy(false);
      return setProblem("The passkey prompt was closed. You are not signed in.");
    }
    const verified = await raw({
      method: "POST",
      path: "auth/passkey/verify",
      body: { challengeId: options.body.challengeId, response },
    });
    setBusy(false);
    // The session cookie is HttpOnly. The app opens only if GET /session agrees.
    if (verified.kind === "ok" && verified.body.state === "authenticated")
      return onAuthenticated();
    fail(verified.kind === "ok" ? { kind: "unavailable", code: "unexpected_response" } : verified);
  };

  const status = (
    <p className="form-status" role="alert">
      {problem}
    </p>
  );

  if (step.k === "checking")
    return (
      <Screen title="Checking your sign-in">
        <p className="muted">One moment.</p>
      </Screen>
    );

  if (step.k === "approval")
    return (
      <Screen
        title="Waiting for approval"
        action={<StartLink>Sign in again after approval</StartLink>}
      >
        <p>
          Google confirmed your account. The first sign-in has to be approved privately
          by the operator before passkeys can be set up. You are not signed in yet.
        </p>
        {step.requestId ? (
          <p>
            Approval request <code>{step.requestId}</code>
          </p>
        ) : null}
        <p className="muted small">
          The request is valid for 10 minutes. After approval, sign in with Google again.
        </p>
      </Screen>
    );

  if (step.k === "enroll") {
    const backup = step.registered === 1;
    return (
      <Screen
        title={backup ? "Add your backup passkey" : "Set up your primary passkey"}
        action={
          <button className="btn primary" onClick={enroll} disabled={busy}>
            <Fingerprint size={20} aria-hidden />
            {busy
              ? "Waiting for passkey"
              : backup
                ? "Create backup passkey"
                : "Create primary passkey"}
          </button>
        }
      >
        <ol className="steps" aria-label="Passkey setup">
          <li data-done={step.registered >= 1}>
            Primary passkey {step.registered >= 1 ? "saved" : "needed"}
          </li>
          <li data-done={step.registered >= 2}>
            Backup passkey {step.registered >= 2 ? "saved" : "needed"}
          </li>
        </ol>
        <p>
          {backup
            ? "Your primary passkey is saved. Sign-in stays closed until a backup is saved too. Use a different device or security key, kept somewhere else."
            : "The admin uses two passkeys: a primary and a backup. Start with the device you will use most."}
        </p>
        <p className="muted small">
          Setup only works during the private 15 minute window the operator opens.
        </p>
        {status}
      </Screen>
    );
  }

  if (step.k === "passkey")
    return (
      <Screen
        title="Confirm with your passkey"
        action={
          <button className="btn primary" onClick={signIn} disabled={busy}>
            <Fingerprint size={20} aria-hidden />
            {busy ? "Waiting for passkey" : "Use passkey"}
          </button>
        }
      >
        <p>Google confirmed your account. Use your passkey to finish signing in.</p>
        {status}
      </Screen>
    );

  const state = step.state;
  if (state.kind === "signed_out")
    return (
      <Screen
        title="Sign-in expired"
        action={<StartLink>Continue with Google</StartLink>}
      >
        <p>The sign-in step lasts 10 minutes and this one has ended. Start again.</p>
      </Screen>
    );
  if (state.kind === "closed")
    return (
      <Screen
        title="The admin is not open"
        action={
          <button className="btn primary" onClick={refresh}>
            Check again
          </button>
        }
      >
        <p>{codeText(state.code)}</p>
      </Screen>
    );
  if (state.kind === "forbidden")
    return (
      <Screen
        title="This account cannot open the admin"
        tone="warn"
        action={<StartLink>Sign in with the owner account</StartLink>}
      >
        <p>{codeText(state.code)}</p>
      </Screen>
    );
  if (state.kind === "rate_limited")
    return (
      <Screen
        title="Too many attempts"
        action={<Wait ms={state.retryAfterMs} onDone={refresh} />}
      >
        <p>Sign-in attempts are limited. You are not signed in.</p>
      </Screen>
    );
  return (
    <Screen
      title="The admin is unavailable"
      tone="warn"
      action={
        <button className="btn primary" onClick={refresh}>
          Try again
        </button>
      }
    >
      <p>{stateText(state)}</p>
      <p>You are not signed in.</p>
    </Screen>
  );
}
