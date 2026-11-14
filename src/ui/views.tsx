"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { MagnifyingGlass, Plus } from "@phosphor-icons/react";
import {
  CASE_STATES,
  CLIENT_STATES,
  listPath,
  metric,
  PROJECT_STAGES,
  REASONS,
  type ReadEnvelope,
  type UiState,
} from "./contract";
import { label, stateText, when } from "./copy";
import { CaseDetail, ClientDetail, ProjectDetail, RequestDetail, WorkplaceDetail } from "./details";
import { CommandForm } from "./forms";
import {
  envelopeOf,
  Facts,
  Loading,
  Notice,
  PageHead,
  PendingOps,
  Problem,
  Section,
  SourceNote,
  systemName,
  Tag,
  useRead,
  type Row,
} from "./parts";
import { useAdmin } from "./shared";
import { BusinessView, TodayPreview } from "./business";

const LANG: Record<string, string> = { en: "English", es: "Spanish" };
const lang = (v: unknown) => LANG[String(v)] ?? label(v);
const short = (id: unknown) => String(id ?? "").slice(0, 8);

type Column = { head: string; cell: (row: Row) => ReactNode };
type ListConfig = {
  route: string;
  title: string;
  lede: string;
  empty: string;
  columns: Column[];
  href?: (row: Row) => string;
  states?: string[];
  stateName?: string;
  search?: { entity: "client" | "project" | "request" | "workplace"; hint: string };
  internal?: boolean;
  create?: boolean;
};

const LISTS: Record<string, ListConfig> = {
  "/nevora/workplaces": {
    route: "nevora/workplaces",
    title: "Workplaces",
    lede: "NEVORA workplaces as the control source reports them. Enrollment details are sync records, not a verified current owner.",
    empty: "No workplaces to show.",
    href: (r) => `/nevora/workplaces/${r.id}`,
    search: { entity: "workplace", hint: "Search by workplace address" },
    internal: true,
    columns: [
      { head: "Address", cell: (r) => String(r.origin ?? "Unknown") },
      { head: "Lifecycle", cell: (r) => label(r.lifecycle) },
      { head: "Access", cell: (r) => label((r.catalog as Row | undefined)?.access ?? "unknown") },
      { head: "Created", cell: (r) => when(r.createdAt, "Unknown") },
    ],
  },
  "/nevora/registrations": {
    route: "nevora/registrations",
    title: "Registrations",
    lede: "Pending NEVORA registrations. Names and emails are not shown here.",
    empty: "No pending registrations.",
    columns: [
      { head: "Stage", cell: (r) => label(r.stage) },
      { head: "Language", cell: (r) => lang(r.language) },
      { head: "Version", cell: (r) => String(r.version ?? "Unknown") },
      { head: "Verified", cell: (r) => when(r.verifiedAt, "Not yet") },
      { head: "Expires", cell: (r) => when(r.expiresAt, "Unknown") },
      { head: "Created", cell: (r) => when(r.createdAt, "Unknown") },
    ],
  },
  "/velani/requests": {
    route: "velani/requests",
    title: "Requests",
    lede: "Requests sent through the Velani site. Company and project are as the sender wrote them.",
    empty: "No requests to show.",
    href: (r) => `/velani/requests/${r.id}`,
    search: { entity: "request", hint: "Search by reference, company, project or exact email" },
    columns: [
      { head: "Reference", cell: (r) => String(r.reference ?? short(r.id)) },
      { head: "Type", cell: (r) => label(r.type) },
      { head: "Company", cell: (r) => String(r.company ?? "Not given") },
      { head: "Urgency", cell: (r) => label(r.urgency) },
      { head: "Received", cell: (r) => when(r.createdAt, "Unknown") },
      { head: "Expires", cell: (r) => when(r.expiresAt, "Unknown") },
    ],
  },
  "/clients": {
    route: "clients",
    title: "Clients",
    lede: "Internal client records. A client record does not give anyone a login.",
    empty: "No clients yet.",
    href: (r) => `/clients/${r.id}`,
    states: CLIENT_STATES,
    stateName: "Relationship",
    search: { entity: "client", hint: "Search by name or exact contact email" },
    create: true,
    columns: [
      { head: "Name", cell: (r) => String(r.displayName ?? "Unnamed") },
      { head: "Relationship", cell: (r) => label(r.relationshipState) },
      { head: "Created", cell: (r) => when(r.createdAt, "Unknown") },
      {
        head: "Kept until",
        cell: (r) => (r.engagedAt ? when(r.deleteAfter, "No end date") : when(r.prospectExpiresAt, "Unknown")),
      },
    ],
  },
  "/projects": {
    route: "projects",
    title: "Projects",
    lede: "Work for clients. New projects are added from the client record.",
    empty: "No projects yet.",
    href: (r) => `/projects/${r.id}`,
    states: PROJECT_STAGES,
    stateName: "Stage",
    search: { entity: "project", hint: "Search by project name" },
    columns: [
      { head: "Name", cell: (r) => String(r.name ?? "Unnamed") },
      { head: "Stage", cell: (r) => label(r.stage) },
      { head: "Target date", cell: (r) => when(r.targetDate) },
      { head: "Created", cell: (r) => when(r.createdAt, "Unknown") },
    ],
  },
  "/cases": {
    route: "cases",
    title: "Cases",
    lede: "Follow-up on Velani requests. A case stops showing when its source request expires.",
    empty: "No cases yet. Open a case from a request.",
    href: (r) => `/cases/${r.id}`,
    states: CASE_STATES,
    stateName: "State",
    columns: [
      { head: "Reference", cell: (r) => String(r.reference ?? short(r.id)) },
      { head: "State", cell: (r) => label(r.state) },
      { head: "Follow up", cell: (r) => when(r.followUpAt) },
      { head: "Source expires", cell: (r) => when(r.sourceExpiresAt, "Unknown") },
      { head: "Created", cell: (r) => when(r.createdAt, "Unknown") },
    ],
  },
  "/activity": {
    route: "activity",
    title: "Activity",
    lede: "The audit record of what was viewed and changed in this admin.",
    empty: "No activity recorded yet.",
    columns: [
      { head: "When", cell: (r) => when(r.createdAt, "Unknown") },
      { head: "Action", cell: (r) => label(r.action) },
      { head: "Record", cell: (r) => `${label(r.entityType)} ${short(r.entityId)}` },
      { head: "Reason", cell: (r) => (r.reasonCode ? (REASONS[String(r.reasonCode)] ?? label(r.reasonCode)) : "None") },
      { head: "Result", cell: (r) => label(r.result) },
    ],
  },
};

type Page = { items: Row[]; next: string | null; envelope: ReadEnvelope };

function ListView({ config }: { config: ListConfig }) {
  const { api, canWrite, canViewInternal, fixtures } = useAdmin();
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [internal, setInternal] = useState(false);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<Page | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "more" | UiState>("loading");
  const [creating, setCreating] = useState(false);
  const [live, setLive] = useState("");
  const run = useRef(0);

  const load = useCallback(
    async (cursor: string | null, previous: Row[]) => {
      const mine = ++run.current;
      setStatus(cursor ? "more" : "loading");
      const state = query
        ? await api({
            method: "POST",
            path: "search",
            body: { entity: config.search?.entity, query, ...(cursor ? { cursor } : {}) },
          })
        : await api({
            method: "GET",
            path: listPath(config.route, {
              cursor: cursor ?? undefined,
              state: filter || undefined,
              classification: internal ? "include_internal" : undefined,
            }),
          });
      if (mine !== run.current) return;
      if (state.kind === "ok") {
        const envelope = state.body as unknown as ReadEnvelope<{ items?: Row[]; nextCursor?: string | null }>;
        const items = [...previous, ...(envelope.data?.items ?? [])];
        setPage({ items, next: envelope.data?.nextCursor ?? null, envelope });
        setStatus("idle");
        setLive(items.length ? `${items.length} shown` : config.empty);
      } else if (cursor && state.kind === "bad_request" && state.code === "invalid_cursor") {
        // The cursor no longer matches. Drop it and start the list again.
        setPage(null);
        void load(null, []);
      } else {
        setStatus(state);
        setLive(stateText(state));
      }
    },
    [api, config, filter, internal, query],
  );

  // Cursors are bound to scope, filter and search. Any change discards them.
  useEffect(() => {
    setPage(null);
    void load(null, []);
  }, [load]);

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setQuery(draft.trim().slice(0, 120));
  };

  const problem = typeof status === "object" ? status : null;
  const writeNote = fixtures
    ? "Development fixtures cannot save."
    : "Saving is turned off in this environment.";

  return (
    <>
      <PageHead
        title={config.title}
        lede={config.lede}
        action={
          config.create ? (
            <button
              className="btn primary"
              onClick={() => setCreating(true)}
              disabled={!canWrite || creating}
              aria-describedby={canWrite ? undefined : "write-note"}
            >
              <Plus size={18} weight="bold" aria-hidden />
              New client
            </button>
          ) : undefined
        }
      />
      {config.create && !canWrite ? (
        <p className="muted small" id="write-note">
          {writeNote}
        </p>
      ) : null}
      {creating ? (
        <CommandForm
          opKey="clients#create"
          scope="clients"
          formKey="create"
          title="New client"
          submit="Create client"
          intro={
            <p className="muted">
              A new client starts as a prospect. Prospect records are kept for 90 days unless the
              relationship is confirmed. Edits do not extend that date.
            </p>
          }
          fields={[{ name: "displayName", label: "Client name", type: "text", required: true, max: 160 }]}
          initial={{ displayName: "" }}
          build={(v) => ({
            method: "POST",
            path: "clients",
            expectedVersion: "0",
            payload: { displayName: String(v.displayName).trim(), relationshipState: "prospect" },
          })}
          onCancel={() => setCreating(false)}
          onSaved={(receipt) => router.push(`/clients/${receipt.entityId}`)}
        />
      ) : null}
      {config.create && !creating ? <PendingOps scope="clients" onOpen={() => setCreating(true)} /> : null}
      {config.search || config.states || (config.internal && canViewInternal) ? (
        <div className="toolbar">
          {config.search ? (
            <form className="row" role="search" onSubmit={onSearch}>
              <label className="sr" htmlFor="list-search">
                {config.search.hint}
              </label>
              <input
                id="list-search"
                type="search"
                value={draft}
                maxLength={120}
                placeholder={config.search.hint}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button className="btn outline" type="submit">
                <MagnifyingGlass size={18} aria-hidden />
                Search
              </button>
              {query ? (
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setDraft("");
                    setQuery("");
                  }}
                >
                  Clear search
                </button>
              ) : null}
            </form>
          ) : null}
          {config.states && !query ? (
            <div className="row">
              <label htmlFor="list-state">{config.stateName}</label>
              <select id="list-state" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All</option>
                {config.states.map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          {config.internal && canViewInternal && !query ? (
            <label className="check">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
              <span>Include internal fixtures</span>
            </label>
          ) : null}
        </div>
      ) : null}
      <p className="sr" role="status" aria-live="polite">
        {status === "loading" ? `Loading ${config.title}` : live}
      </p>
      {status === "loading" && !page ? <Loading what={config.title} /> : null}
      {problem && !page ? <Problem state={problem} onRetry={() => void load(null, [])} /> : null}
      {page ? (
        <>
          <SourceNote envelope={page.envelope} />
          {internal ? (
            <Notice>Internal fixtures are included and labelled. They are not customers.</Notice>
          ) : null}
          {page.items.length === 0 ? (
            <div className="panel empty">
              <p>{query ? `Nothing matched "${query}".` : filter ? "Nothing matches this filter." : config.empty}</p>
            </div>
          ) : (
            <div className="panel table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {config.columns.map((c) => (
                      <th key={c.head} scope="col">
                        {c.head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((row) => (
                    <tr key={String(row.id)}>
                      {config.columns.map((c, i) => (
                        <td key={c.head} data-label={c.head}>
                          {i === 0 && config.href ? (
                            <Link href={config.href(row)}>{c.cell(row)}</Link>
                          ) : (
                            c.cell(row)
                          )}
                          {i === 0 && row.classification === "internal" ? (
                            <Tag tone="warn">Internal fixture</Tag>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {problem ? (
            <Notice
              tone="warn"
              action={
                <button className="btn outline small" onClick={() => void load(page.next, page.items)}>
                  Try again
                </button>
              }
            >
              More could not be loaded. {stateText(problem)}
            </Notice>
          ) : page.next ? (
            <div className="more">
              <button
                className="btn outline"
                disabled={status === "more"}
                onClick={() => void load(page.next, page.items)}
              >
                {status === "more" ? "Loading more" : "Show more"}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </>
  );
}

type SubEnvelope = ReadEnvelope<{ count?: number } | null>;
type OverviewData = {
  trials?: { value: number | null; reason: string | null };
  workplaces?: SubEnvelope;
  registrations?: SubEnvelope;
  requests?: SubEnvelope;
  clients?: number;
  openProjects?: number;
  openCases?: number;
  revenue?: { value: number | null; unit: string; reason: string | null };
};
const REASON_TEXT: Record<string, string> = {
  live_billing_not_verified: "Live billing is not verified, so revenue is not shown.",
  catalog_coverage_or_freshness_unavailable: "Enrollment coverage or freshness could not be confirmed.",
};

function Tile({
  name,
  value,
  note,
  href,
}: {
  name: string;
  value: string;
  note?: string | null;
  href?: string;
}) {
  const body = (
    <>
      <span className="tile-name">{name}</span>
      <span className="tile-value" data-unknown={value === "Unknown" || undefined}>
        {value}
      </span>
      {note ? <span className="tile-note">{note}</span> : null}
    </>
  );
  return href ? (
    <Link className="tile" href={href}>
      {body}
    </Link>
  ) : (
    <div className="tile">{body}</div>
  );
}

function Overview() {
  const read = useRead("overview");
  const envelope = envelopeOf<OverviewData>(read.state);
  const d = envelope?.data;
  const sub = (s?: SubEnvelope) =>
    s && s.state !== "unavailable" && s.data ? metric(s.data.count) : "Unknown";
  const subNote = (s?: SubEnvelope) =>
    !s || s.state === "unavailable" || !s.data ? "Source unavailable" : null;
  return (
    <>
      <PageHead title="Overview" lede="Counts from NEVORA, Velani and the internal records. A value that could not be read is shown as Unknown." />
      <TodayPreview />
      {read.state.status === "loading" ? <Loading what="overview" /> : null}
      {read.state.status === "done" && !envelope ? (
        <Problem state={read.state.result} onRetry={read.retry} />
      ) : null}
      {envelope && d ? (
        <>
          <SourceNote envelope={envelope} />
          <section className="tile-group" aria-labelledby="ov-nevora">
            <h2 id="ov-nevora">NEVORA</h2>
            <div className="tiles">
              <Tile name="Workplaces" value={sub(d.workplaces)} note={subNote(d.workplaces)} href="/nevora/workplaces" />
              <Tile name="Pending registrations" value={sub(d.registrations)} note={subNote(d.registrations)} href="/nevora/registrations" />
              <Tile
                name="Workplaces on trial"
                value={metric(d.trials?.value)}
                note={d.trials?.value == null ? (REASON_TEXT[String(d.trials?.reason)] ?? "Not available.") : null}
              />
            </div>
          </section>
          <section className="tile-group" aria-labelledby="ov-velani">
            <h2 id="ov-velani">Velani</h2>
            <div className="tiles">
              <Tile name="Requests" value={sub(d.requests)} note={subNote(d.requests)} href="/velani/requests" />
              <Tile
                name="Revenue"
                value={metric(d.revenue?.value)}
                note={d.revenue?.value == null ? (REASON_TEXT[String(d.revenue?.reason)] ?? "Not available.") : null}
              />
            </div>
          </section>
          <section className="tile-group" aria-labelledby="ov-work">
            <h2 id="ov-work">Clients and work</h2>
            <div className="tiles">
              <Tile name="Clients" value={metric(d.clients)} href="/clients" />
              <Tile name="Open projects" value={metric(d.openProjects)} href="/projects" />
              <Tile name="Open cases" value={metric(d.openCases)} href="/cases" />
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}

type IntegrationsData = {
  sources?: { system: string; state: string; coverage: string }[];
  retention?: { lastSuccessAt: string | null; removedClients: number | null; removedCases: number | null };
  rondoLeads?: { state: string; reason?: string };
  liveBilling?: { state: string };
  companySummaries?: { state: string };
};

function Integrations() {
  const read = useRead("integrations");
  const envelope = envelopeOf<IntegrationsData>(read.state);
  const d = envelope?.data;
  return (
    <>
      <PageHead title="Integrations" lede="What this admin can read right now, and what is not part of this version." />
      {read.state.status === "loading" ? <Loading what="integrations" /> : null}
      {read.state.status === "done" && !envelope ? (
        <Problem state={read.state.result} onRetry={read.retry} />
      ) : null}
      {envelope && d ? (
        <>
          <SourceNote envelope={envelope} />
          <Section title="Sources">
            <ul className="rows">
              {(d.sources ?? []).map((s) => (
                <li key={s.system}>
                  <span>{systemName(s.system)}</span>
                  <span>
                    <Tag tone={s.state === "ready" ? "accent" : "warn"}>{label(s.state)}</Tag>
                    <span className="muted small"> Coverage {label(s.coverage).toLowerCase()}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Retention">
            <Facts
              items={[
                ["Last successful run", when(d.retention?.lastSuccessAt, "Unknown")],
                ["Clients removed", metric(d.retention?.removedClients)],
                ["Cases removed", metric(d.retention?.removedCases)],
              ]}
            />
          </Section>
          <Section title="Not part of this version">
            <ul className="rows">
              <li>
                <span>Rondo leads</span>
                <span>
                  <Tag>{label(d.rondoLeads?.state)}</Tag>
                  {d.rondoLeads?.reason === "retention_not_qualified" ? (
                    <span className="muted small"> Retention is not qualified</span>
                  ) : null}
                </span>
              </li>
              <li>
                <span>Live billing</span>
                <Tag>{label(d.liveBilling?.state)}</Tag>
              </li>
              <li>
                <span>Company summaries</span>
                <Tag>{label(d.companySummaries?.state)}</Tag>
              </li>
            </ul>
          </Section>
        </>
      ) : null}
    </>
  );
}

const ID = "([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})";
const DETAILS: [RegExp, (id: string) => ReactNode][] = [
  [new RegExp(`^/nevora/workplaces/${ID}$`, "i"), (id) => <WorkplaceDetail id={id} />],
  [new RegExp(`^/velani/requests/${ID}$`, "i"), (id) => <RequestDetail id={id} />],
  [new RegExp(`^/clients/${ID}$`, "i"), (id) => <ClientDetail id={id} />],
  [new RegExp(`^/projects/${ID}$`, "i"), (id) => <ProjectDetail id={id} />],
  [new RegExp(`^/cases/${ID}$`, "i"), (id) => <CaseDetail id={id} />],
];

export function View({ pathname }: { pathname: string }) {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (/^\/business\/(today|intake|delivery|finance|lifecycle|costs|insights|coverage|customers\/[0-9a-f-]{36})$/i.test(path)) return <BusinessView pathname={path} />;
  if (path === "/" || path === "/login" || path === "/overview") return <Overview />;
  if (path === "/integrations") return <Integrations />;
  if (LISTS[path]) return <ListView key={path} config={LISTS[path]} />;
  for (const [pattern, render] of DETAILS) {
    const m = path.match(pattern);
    if (m) return render(m[1].toLowerCase());
  }
  return (
    <>
      <PageHead title="Page not found" lede="There is nothing at this address." />
      <p>
        <Link className="btn outline" href="/overview">
          Go to Overview
        </Link>
      </p>
    </>
  );
}
