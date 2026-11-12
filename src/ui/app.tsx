"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Briefcase,
  Buildings,
  ClipboardText,
  ClockCounterClockwise,
  Fingerprint,
  Kanban,
  List as ListIcon,
  PlugsConnected,
  SignOut,
  SquaresFour,
  Tray,
  UsersThree,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { startAuthentication } from "@simplewebauthn/browser";
import { call, httpTransport, type Transport } from "./client";
import { CLEAR_LOCAL_STATE_CODES, type UiState } from "./contract";
import { codeText, label, stateText } from "./copy";
import { fixturesAllowed } from "./fixtures-flag";
import { Login } from "./login";
import {
  AdminContext,
  Screen,
  StartLink,
  useCountdown,
  Wordmark,
  type Admin,
  type Request,
  type Session,
} from "./shared";
import { View } from "./views";

type Gate =
  | { k: "loading" }
  | { k: "in"; session: Session }
  | { k: "fixtures" }
  | { k: "out"; state: UiState | null; reason?: "logout" };

function readSession(body: Record<string, unknown>): Session | null {
  const b = body as Partial<Session> & { state?: string };
  if (
    b.state !== "authenticated" ||
    typeof b.csrfToken !== "string" ||
    !b.csrfToken ||
    typeof b.actor?.email !== "string" ||
    typeof b.capabilities !== "object" ||
    b.capabilities === null
  )
    return null;
  return b as Session;
}

function WaitButton({ ms, onDone }: { ms: number; onDone: () => void }) {
  const left = useCountdown(ms);
  return (
    <button className="btn primary" disabled={left > 0} onClick={onDone}>
      {left > 0 ? `Try again in ${left} seconds` : "Try again"}
    </button>
  );
}

function GateScreen({
  state,
  reason,
  recheck,
}: {
  state: UiState | null;
  reason?: "logout";
  recheck: () => void;
}) {
  const id = state && "requestId" in state && state.requestId ? state.requestId : null;
  const ref = id ? <p className="muted small">Reference {id}</p> : null;
  if (!state || state.kind === "signed_out")
    return (
      <Screen
        title={reason === "logout" ? "You are signed out" : "Sign in to Velani admin"}
        action={<StartLink>Continue with Google</StartLink>}
      >
        <p>
          {reason === "logout"
            ? "Your session has ended on the server. Sign in again when you need the admin."
            : "Sign in with the owner Google account, then confirm with your passkey."}
        </p>
      </Screen>
    );
  if (state.kind === "closed")
    return (
      <Screen
        title="The admin is not open"
        action={
          <button className="btn primary" onClick={recheck}>
            Check again
          </button>
        }
      >
        <p>{codeText(state.code)}</p>
        {(CLEAR_LOCAL_STATE_CODES as readonly string[]).includes(state.code) ? (
          <p>Lists and unsaved edits from before were cleared from this page.</p>
        ) : null}
        {ref}
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
        {ref}
      </Screen>
    );
  if (state.kind === "rate_limited")
    return (
      <Screen
        title="Too many requests"
        action={<WaitButton ms={state.retryAfterMs} onDone={recheck} />}
      >
        <p>The admin limits how often it can be asked. Nothing was lost.</p>
        {ref}
      </Screen>
    );
  return (
    <Screen
      title="The admin is unavailable"
      tone="warn"
      action={
        <button className="btn primary" onClick={recheck}>
          Try again
        </button>
      }
    >
      <p>{stateText(state)}</p>
      <p>This is not a sign-in problem. Nothing was changed.</p>
      {ref}
    </Screen>
  );
}

type NavItem = { href: string; text: string; icon: Icon };
const NAV: { heading: string | null; items: NavItem[] }[] = [
  { heading: null, items: [{ href: "/overview", text: "Overview", icon: SquaresFour }] },
  {
    heading: "NEVORA",
    items: [
      { href: "/nevora/workplaces", text: "Workplaces", icon: Buildings },
      { href: "/nevora/registrations", text: "Registrations", icon: ClipboardText },
    ],
  },
  {
    heading: "Velani",
    items: [{ href: "/velani/requests", text: "Requests", icon: Tray }],
  },
  {
    heading: "Clients and work",
    items: [
      { href: "/clients", text: "Clients", icon: UsersThree },
      { href: "/projects", text: "Projects", icon: Kanban },
      { href: "/cases", text: "Cases", icon: Briefcase },
    ],
  },
  {
    heading: "Records",
    items: [
      { href: "/activity", text: "Activity", icon: ClockCounterClockwise },
      { href: "/integrations", text: "Integrations", icon: PlugsConnected },
    ],
  },
];

function Shell({
  pathname,
  session,
  fixtures,
  onSignOut,
  signingOut,
  children,
}: {
  pathname: string;
  session: Session | null;
  fixtures: boolean;
  onSignOut: () => void;
  signingOut: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      {fixtures ? (
        <div className="fixture-banner" role="note">
          <strong>Development fixtures.</strong> Recorded test responses from
          qualification-sample.json. No one is signed in and nothing can be saved.
        </div>
      ) : null}
      <header className="topbar">
        <Wordmark />
        <button
          className="btn ghost icon-btn"
          aria-expanded={open}
          aria-controls="rail"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} aria-hidden /> : <ListIcon size={20} aria-hidden />}
          <span>{open ? "Close menu" : "Menu"}</span>
        </button>
      </header>
      <div className="frame">
        <nav id="rail" className={open ? "rail open" : "rail"} aria-label="Admin sections">
          <div className="rail-brand">
            <Wordmark />
            <span className="rail-sub">Admin</span>
          </div>
          {NAV.map((group, i) => (
            <div className="rail-group" key={i}>
              {group.heading ? <h2>{group.heading}</h2> : null}
              <ul>
                {group.items.map((item) => {
                  const active =
                    pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link href={item.href} aria-current={active ? "page" : undefined}>
                        <item.icon size={20} weight={active ? "fill" : "regular"} aria-hidden />
                        {item.text}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <div className="rail-foot">
            {session ? (
              <>
                <p className="rail-who">
                  <span className="rail-email">{session.actor.email}</span>
                  <span className="muted small">
                    Platform owner · {label(session.environment)}
                  </span>
                </p>
                <button className="btn outline" onClick={onSignOut} disabled={signingOut}>
                  <SignOut size={18} aria-hidden />
                  {signingOut ? "Signing out" : "Sign out"}
                </button>
              </>
            ) : (
              <p className="rail-who">
                <span className="rail-email">Not signed in</span>
                <span className="muted small">Development fixtures only</span>
              </p>
            )}
          </div>
        </nav>
        <main className="content" id="main">
          {children}
        </main>
      </div>
    </div>
  );
}

function StepUpDialog({
  raw,
  onDone,
}: {
  raw: Admin["raw"];
  onDone: (ok: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  const confirm = async () => {
    setBusy(true);
    setProblem(null);
    const options = await raw({ method: "POST", path: "auth/step-up/options", body: {} });
    if (options.kind !== "ok") {
      setBusy(false);
      return setProblem(stateText(options));
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
      return setProblem("The passkey prompt was closed. Nothing was sent.");
    }
    const verified = await raw({
      method: "POST",
      path: "auth/step-up/verify",
      body: { challengeId: options.body.challengeId, response },
    });
    setBusy(false);
    if (verified.kind === "ok" && verified.body.state === "verified") return onDone(true);
    setProblem(verified.kind === "ok" ? codeText("unexpected_response") : stateText(verified));
  };
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="stepup-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onDone(false);
      }}
    >
      <h2 id="stepup-title">Confirm it is you</h2>
      <p>
        This change needs a fresh passkey check. Your edits are kept and the same
        save is sent again after you confirm.
      </p>
      <p className="form-status" role="alert">
        {problem}
      </p>
      <div className="row end">
        <button className="btn outline" onClick={() => onDone(false)} disabled={busy}>
          Not now
        </button>
        <button className="btn primary" onClick={confirm} disabled={busy}>
          <Fingerprint size={20} aria-hidden />
          {busy ? "Waiting for passkey" : "Use passkey"}
        </button>
      </div>
    </dialog>
  );
}

export function AdminApp() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [gate, setGate] = useState<Gate>({ k: "loading" });
  const [epoch, setEpoch] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const transport = useRef<Transport>(httpTransport);
  const csrf = useRef<string | undefined>(undefined);
  const stepUpResolve = useRef<((ok: boolean) => void) | null>(null);

  const raw = useCallback(
    (request: Request) =>
      call(transport.current, {
        ...request,
        csrf: request.method === "GET" ? undefined : csrf.current,
      }),
    [],
  );
  const api = useCallback(
    async (request: Request) => {
      const state = await raw(request);
      if (state.kind === "signed_out" && state.code === "authentication_required") {
        csrf.current = undefined;
        setGate({ k: "out", state });
      }
      if (state.kind === "closed") {
        csrf.current = undefined;
        setEpoch((e) => e + 1);
        setGate({ k: "out", state });
      }
      return state;
    },
    [raw],
  );

  const check = useCallback(async () => {
    setGate({ k: "loading" });
    if (
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_ADMIN_DEV_FIXTURES === "1"
    ) {
      // Development only. This branch and the module are removed from
      // production bundles; see src/ui/fixtures-flag.ts.
      const dev = await import("./dev-fixtures");
      if (
        fixturesAllowed(
          {
            NODE_ENV: process.env.NODE_ENV,
            NEXT_PUBLIC_ADMIN_DEV_FIXTURES: process.env.NEXT_PUBLIC_ADMIN_DEV_FIXTURES,
          },
          window.location.hostname,
        )
      ) {
        transport.current = dev.fixtureTransport;
        setGate({ k: "fixtures" });
        return;
      }
    }
    const state = await raw({ method: "GET", path: "session" });
    const session = state.kind === "ok" ? readSession(state.body) : null;
    if (session) {
      csrf.current = session.csrfToken;
      setGate({ k: "in", session });
    } else {
      csrf.current = undefined;
      if (state.kind === "closed") setEpoch((e) => e + 1);
      setGate({
        k: "out",
        state:
          state.kind === "ok" ? { kind: "unavailable", code: "unexpected_response" } : state,
      });
    }
  }, [raw]);

  useEffect(() => {
    void check();
  }, [check]);

  const inside = gate.k === "in" || gate.k === "fixtures";
  useEffect(() => {
    if (inside && (pathname === "/" || pathname === "/login")) router.replace("/overview");
  }, [inside, pathname, router]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    const state = await raw({ method: "POST", path: "logout", body: {} });
    setSigningOut(false);
    csrf.current = undefined;
    setEpoch((e) => e + 1);
    // The server revokes the session even if its audit write fails. Anything
    // other than a clear answer is shown as it is and rechecked on retry.
    setGate(
      state.kind === "ok" || state.kind === "signed_out"
        ? { k: "out", state: null, reason: "logout" }
        : { k: "out", state },
    );
  }, [raw]);

  const stepUp = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        stepUpResolve.current = resolve;
        setStepUpOpen(true);
      }),
    [],
  );

  const admin = useMemo<Admin>(
    () => ({
      api,
      raw,
      session: gate.k === "in" ? gate.session : null,
      fixtures: gate.k === "fixtures",
      canWrite: gate.k === "in" && gate.session.capabilities.internalWrites === true,
      canViewInternal:
        gate.k === "in" && gate.session.capabilities.viewInternalFixtures === true,
      stepUp,
      epoch,
    }),
    [api, raw, gate, stepUp, epoch],
  );

  if (gate.k === "loading")
    return (
      <main className="screen" id="main">
        <div className="screen-card">
          <Wordmark />
          <p role="status" aria-live="polite" className="muted">
            Checking your sign-in
          </p>
        </div>
      </main>
    );

  if (gate.k === "out") {
    const pendingLogin =
      pathname === "/login" && (!gate.state || gate.state.kind === "signed_out") && !gate.reason;
    return pendingLogin ? (
      <Login raw={raw} onAuthenticated={check} />
    ) : (
      <GateScreen state={gate.state} reason={gate.reason} recheck={check} />
    );
  }

  return (
    <AdminContext.Provider value={admin}>
      <Shell
        pathname={pathname}
        session={admin.session}
        fixtures={admin.fixtures}
        onSignOut={signOut}
        signingOut={signingOut}
      >
        <View key={pathname + ":" + epoch} pathname={pathname} />
      </Shell>
      {stepUpOpen ? (
        <StepUpDialog
          raw={raw}
          onDone={(ok) => {
            setStepUpOpen(false);
            stepUpResolve.current?.(ok);
            stepUpResolve.current = null;
          }}
        />
      ) : null}
    </AdminContext.Provider>
  );
}
