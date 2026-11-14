"use client";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { CommandForm, type FieldSpec, type Picked, type Values } from "./forms";
import {
  envelopeOf,
  Loading,
  Notice,
  PageHead,
  PendingOps,
  Problem,
  Section,
  SourceNote,
  Tag,
  useRead,
  type Row,
} from "./parts";
import { label, when } from "./copy";
import { useAdmin } from "./shared";
type Kind = "inquiry" | "plan" | "milestone" | "expense" | "budget";
type RecordRow = Row & {
  id: string;
  kind: Kind;
  data: Row;
  clientId: string | null;
  projectId: string | null;
  version: string;
};
const rows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const value = (v: unknown) =>
  typeof v === "string" || typeof v === "number" ? String(v) : "Unknown";
const currency = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(v / 100)
    : "Unknown";
const dateInput = (v: unknown) => {
  if (!v || typeof v !== "string") return "";
  const d = new Date(v);
  return Number.isFinite(+d)
    ? new Date(+d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    : "";
};
const choices = (values: string[]): [string, string][] =>
  values.map((v) => [v, label(v)]);
const product: FieldSpec = {
  name: "product",
  label: "Business",
  type: "select",
  options: choices(["velani", "nevora", "shared"]),
  required: true,
};
const dollars = (name: string, text: string, required = false): FieldSpec => ({
  name,
  label: text,
  type: "text",
  required,
  hint: "USD, for example 125.50. Leave optional amounts empty when unknown.",
});
const time = (name: string, text: string, required = false): FieldSpec => ({
  name,
  label: text,
  type: "datetime",
  required,
  hint: "Your device's local time.",
});
const title: FieldSpec = {
  name: "title",
  label: "Title",
  type: "text",
  required: true,
  max: 200,
};
const fields: Record<Kind, FieldSpec[]> = {
  inquiry: [
    title,
    {
      name: "channel",
      label: "Source channel",
      type: "select",
      required: true,
      options: choices(["shopify", "email", "phone", "rondo", "other"]),
    },
    {
      name: "reference",
      label: "Source reference",
      type: "text",
      required: true,
      max: 160,
      hint: "A stable mailbox, Shopify or source reference. Do not paste the message.",
    },
    {
      name: "service",
      label: "Service interest",
      type: "select",
      required: true,
      options: choices(["velani", "nevora", "relay", "other"]),
    },
    {
      name: "stage",
      label: "Sales stage",
      type: "select",
      required: true,
      options: choices(["new", "qualified", "quoted", "won", "lost"]),
    },
    time("receivedAt", "Received", true),
    time("firstRespondedAt", "First human reply"),
    time("followUpAt", "Next follow-up"),
    dollars("estimatedMinor", "Expected value"),
    {
      name: "lostReason",
      label: "Lost reason",
      type: "text",
      max: 300,
      hint: "Required for a lost opportunity.",
    },
  ],
  plan: [
    title,
    { name: "scope", label: "Approved scope", type: "textarea", max: 2000 },
    dollars("approvedMinor", "Approved project value"),
    dollars("estimatedCostMinor", "Estimated delivery cost"),
    time("acceptedAt", "Client accepted on"),
    {
      name: "blocker",
      label: "Current blocker or client dependency",
      type: "text",
      max: 300,
    },
    {
      name: "invoiceReference",
      label: "Invoice reference",
      type: "text",
      max: 160,
    },
    time("renewalAt", "Support or maintenance renewal"),
  ],
  milestone: [
    title,
    time("dueAt", "Due", true),
    {
      name: "state",
      label: "Stage",
      type: "select",
      options: choices([
        "planned",
        "in_progress",
        "waiting_client",
        "completed",
        "canceled",
      ]),
    },
    time("completedAt", "Work completed on"),
    time("acceptedAt", "Client accepted on"),
    { name: "blocker", label: "Blocker or dependency", type: "text", max: 300 },
  ],
  expense: [
    title,
    product,
    {
      name: "category",
      label: "Cost category",
      type: "select",
      options: choices([
        "hosting",
        "ai",
        "email",
        "support",
        "delivery",
        "other",
      ]),
    },
    dollars("amountMinor", "Recorded cost", true),
    time("occurredAt", "Cost incurred", true),
    {
      name: "supportMinutes",
      label: "Support effort, minutes",
      type: "text",
      hint: "Whole minutes. Include the cost of that effort in Recorded cost; minutes are not charged automatically.",
    },
    {
      name: "evidenceReference",
      label: "Bill or internal calculation reference",
      type: "text",
      required: true,
      max: 160,
    },
  ],
  budget: [
    title,
    product,
    {
      name: "month",
      label: "Budget month",
      type: "text",
      required: true,
      hint: "YYYY-MM, for example 2026-11.",
    },
    dollars("amountMinor", "Monthly budget", true),
    {
      name: "costsReviewed",
      label: "I reviewed the recorded costs for this business and month",
      type: "checkbox",
    },
  ],
};
const names: Record<Kind, string> = {
  inquiry: "Inquiry",
  plan: "Delivery plan",
  milestone: "Milestone",
  expense: "Cost",
  budget: "Budget",
};
const kindFields = (kind: Kind, updating: boolean) =>
  fields[kind].filter(
    (f) =>
      !(
        updating &&
        ["channel", "reference", "sourceRequestId", "receivedAt"].includes(
          f.name,
        )
      ),
  );

function Table({
  columns,
  items,
}: {
  columns: { name: string; render: (row: Row) => ReactNode }[];
  items: Row[];
}) {
  return items.length ? (
    <div className="panel table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.name} scope="col">
                {c.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((r, i) => (
            <tr key={String(r.id ?? r.sourceId ?? i)}>
              {columns.map((c) => (
                <td key={c.name} data-label={c.name}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="panel empty">
      No records in this view. Check the source coverage before treating this as
      a complete result.
    </p>
  );
}
function Tiles({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className="tiles business-tiles">
      {items.map(([name, n]) => (
        <div className="tile" key={name}>
          <span className="tile-name">{name}</span>
          <span className="tile-value">{n}</span>
        </div>
      ))}
    </div>
  );
}
function FeedStatus({ data }: { data: Row }) {
  const feeds = data.feeds as Record<string, Row> | undefined;
  return (
    <div className="business-source">
      {Object.entries(feeds ?? {}).map(([system, feed]) => (
        <p key={system}>
          <strong>{label(system)}:</strong> {label(feed.state)} ·{" "}
          {label(feed.coverage)} coverage · {label(feed.provenance)}
          {feed.accountId ? <> · account {value(feed.accountId)}</> : null}
          {feed.historyFrom ? (
            <>
              {" "}
              · history {value(feed.historyFrom)} through{" "}
              {value(feed.historyThrough)}
            </>
          ) : null}
          {feed.observedAt ? (
            <> · observed {when(String(feed.observedAt))}</>
          ) : null}
          {feed.validUntil ? (
            <> · valid until {when(String(feed.validUntil))}</>
          ) : null}
        </p>
      ))}
    </div>
  );
}
function Editor({
  kind,
  record,
  sourceRequest,
  scope,
  onSaved,
  onClose,
  onReload,
}: {
  kind: Kind;
  record?: RecordRow;
  sourceRequest?: Row;
  scope: string;
  onSaved: () => void;
  onClose: () => void;
  onReload: () => Promise<void>;
}) {
  const data =
      record?.data ??
      (sourceRequest
        ? {
            channel: "client_hub",
            sourceRequestId: sourceRequest.id,
            reference: sourceRequest.reference,
            receivedAt: sourceRequest.createdAt,
            title: sourceRequest.reference,
          }
        : {}),
    initial: Values = {};
  for (const f of fields[kind]) {
    const v = data[f.name];
    initial[f.name] =
      f.type === "checkbox"
        ? v === true
        : f.type === "datetime"
          ? dateInput(v)
          : f.name.endsWith("Minor")
            ? typeof v === "number"
              ? (v / 100).toFixed(2)
              : ""
            : typeof v === "string" || typeof v === "number"
              ? String(v)
              : (f.options?.[0]?.[0] ?? "");
  }
  if (!record && kind === "inquiry") {
    initial.receivedAt = dateInput(data.receivedAt ?? new Date().toISOString());
    initial.service = "velani";
    initial.stage = "new";
  }
  if (!record && kind === "expense") {
    initial.occurredAt = dateInput(new Date().toISOString());
    initial.supportMinutes = "0";
  }
  if (!record && kind === "budget")
    initial.month = new Date().toISOString().slice(0, 7);
  initial.client = record?.clientId
    ? { id: record.clientId, text: record.clientId }
    : null;
  initial.project = record?.projectId
    ? {
        id: record.projectId,
        text: record.projectId,
        clientId: record.clientId ?? undefined,
      }
    : null;
  const parentFields: FieldSpec[] =
    kind === "budget"
      ? []
      : (
          [
            { name: "client", label: "Client", type: "pick", entity: "client" },
            {
              name: "project",
              label: "Project",
              type: "pick",
              entity: "project",
              required: ["plan", "milestone"].includes(kind),
              hint: "The project's client is used automatically.",
            },
          ] satisfies FieldSpec[]
        ).filter(
          (f) =>
            !record ||
            (kind === "inquiry" &&
              (f.name === "client" ? !record.clientId : !record.projectId)),
        );
  return (
    <CommandForm
      key={record?.id ?? kind}
      opKey={`${scope}#${record?.id ?? kind}`}
      scope={scope}
      formKey={record?.id ?? kind}
      title={`${record ? "Edit" : "New"} ${names[kind].toLowerCase()}`}
      submit="Save record"
      fields={[
        ...parentFields,
        ...kindFields(kind, !!record || !!sourceRequest),
      ]}
      initial={initial}
      intro={
        <p className="muted">
          Internal business record only. Logging a reply records your
          observation; it sends no email. Amounts are USD. Source references and
          receipt times cannot be changed. An unassigned inquiry can be linked
          once to its client and project.
          {sourceRequest ? (
            <>
              {" "}
              Source {value(sourceRequest.reference)}, received{" "}
              {value(sourceRequest.createdAt)}. The original source timestamp is
              preserved exactly.
            </>
          ) : null}
        </p>
      }
      onCancel={onClose}
      onSaved={onSaved}
      onReload={onReload}
      build={(values) => {
        const errors: Record<string, string> = {},
          next: Record<string, unknown> = { ...data };
        for (const f of kindFields(kind, !!record || !!sourceRequest)) {
          const v = values[f.name];
          if (f.name.endsWith("Minor")) {
            const s = String(v ?? "").trim();
            if (!s && !f.required) next[f.name] = null;
            else if (!/^\d{1,9}(\.\d{1,2})?$/.test(s))
              errors[f.name] =
                "Enter a non-negative USD amount with at most two decimal places.";
            else {
              const [a, b = ""] = s.split(".");
              next[f.name] = Number(a) * 100 + Number(b.padEnd(2, "0"));
            }
          } else if (f.type === "datetime") {
            const d = v ? new Date(String(v)) : null;
            if (d && !Number.isFinite(+d))
              errors[f.name] = "Enter a valid date and time.";
            else next[f.name] = d?.toISOString() ?? null;
          } else if (f.type === "checkbox") next[f.name] = v === true;
          else if (f.name === "supportMinutes") {
            if (!/^\d{1,6}$/.test(String(v || "0")))
              errors[f.name] = "Enter whole minutes.";
            next[f.name] = Number(v || 0);
          } else next[f.name] = String(v ?? "").trim();
        }
        if (kind === "inquiry" && !next.sourceRequestId)
          next.sourceRequestId = null;
        if (["inquiry", "plan", "expense", "budget"].includes(kind))
          next.currency = "USD";
        const project = values.project as Picked | null,
          client = values.client as Picked | null;
        if (project?.clientId && client?.id && project.clientId !== client.id)
          errors.project = "Choose a project belonging to this client.";
        if (Object.keys(errors).length) return { errors };
        return {
          method: record ? "PATCH" : "POST",
          path: "business/records" + (record ? "/" + record.id : ""),
          expectedVersion: record?.version ?? "0",
          payload: {
            kind,
            clientId:
              record?.clientId ?? project?.clientId ?? client?.id ?? null,
            projectId: record?.projectId ?? project?.id ?? null,
            data: next,
          },
        };
      }}
    />
  );
}

export function TodayPreview() {
  const read = useRead("business/today"),
    e = envelopeOf<Row>(read.state);
  if (!e)
    return (
      <Notice
        action={
          <Link className="btn outline small" href="/business/today">
            Today
          </Link>
        }
      >
        Daily priorities have their own source coverage. Open Today to review
        commitments and exceptions.
      </Notice>
    );
  return (
    <Section
      title="Needs attention"
      action={
        <Link className="btn outline small" href="/business/today">
          View Today
        </Link>
      }
    >
      <p className="muted">
        Seven days a week, 7 a.m.–10 p.m. U.S. Eastern.{" "}
        {e.state === "partial" ? "Some coverage is incomplete." : ""}
      </p>
      <Table
        items={rows(e.data.items).slice(0, 5)}
        columns={[
          {
            name: "Item",
            render: (r) => <Link href={String(r.href)}>{value(r.title)}</Link>,
          },
          {
            name: "Attention",
            render: (r) => (
              <>
                {value(r.reason)}{" "}
                {r.overdue ? <Tag tone="warn">Overdue</Tag> : null}
              </>
            ),
          },
          { name: "Due", render: (r) => when(r.dueAt) },
        ]}
      />
    </Section>
  );
}

export function BusinessView({ pathname }: { pathname: string }) {
  const admin = useAdmin(),
    route = pathname.replace(/^\/business\//, ""),
    page = route.split("/")[0];
  const isCustomer = page === "customers";
  const titles: Record<string, string> = {
    today: "Today",
    intake: "Inquiries and pipeline",
    delivery: "Delivery and milestones",
    finance: "Money",
    lifecycle: "NEVORA customer health",
    costs: "Costs and budgets",
    insights: "Business insights",
    coverage: "Source coverage",
    customers: "Customer business summary",
  };
  const [from, setFrom] = useState(
      () => new Date().toISOString().slice(0, 8) + "01",
    ),
    [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [period, setPeriod] = useState({ from, to }),
    [editing, setEditing] = useState<RecordRow | null>(null),
    [creating, setCreating] = useState<Kind | null>(null);
  const [sourceRequest, setSourceRequest] = useState<Row | undefined>(
    undefined,
  );
  const periodPage = ["finance", "costs", "insights"].includes(page);
  const apiPath = page === "delivery" ? "records" : route;
  const read = useRead(
    "business/" +
      apiPath +
      (periodPage ? "?from=" + period.from + "&to=" + period.to : ""),
  );
  const e = envelopeOf<Row>(read.state),
    data = e?.data;
  const allRecords = (
    page === "delivery"
      ? rows(data?.items).filter((r) =>
          ["plan", "milestone"].includes(String(r.kind)),
        )
      : page === "costs"
        ? [...rows(data?.expenses), ...rows(data?.budgets)]
        : rows(data?.records)
  ).map((r) => r as RecordRow);
  const openedQuery = useRef<string | null>(null);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("record"),
      current = allRecords.find((r) => r.id === id);
    if (current && id !== openedQuery.current) {
      openedQuery.current = id;
      setEditing(current);
    }
    if (editing) {
      const updated = allRecords.find((r) => r.id === editing.id);
      if (updated && updated.version !== editing.version) setEditing(updated);
    }
  }, [e?.source.observedAt]);
  const kinds: Kind[] =
    page === "intake"
      ? ["inquiry"]
      : page === "delivery"
        ? ["plan", "milestone"]
        : page === "costs"
          ? ["expense", "budget"]
          : [];
  const saved = () => {
    setEditing(null);
    setCreating(null);
    setSourceRequest(undefined);
    void read.reload();
  };
  const selectPending = (form: string) => {
    const r = allRecords.find((r) => r.id === form);
    if (r) setEditing(r);
    else if (kinds.includes(form as Kind)) setCreating(form as Kind);
  };
  const applyPeriod = (event: FormEvent) => {
    event.preventDefault();
    setPeriod({ from, to });
  };
  return (
    <>
      <PageHead
        title={titles[page] ?? "Business"}
        lede={
          page === "today"
            ? "Commitments, replies and exceptions across Velani and NEVORA."
            : "Business records and source-labelled observations. Missing coverage stays visible."
        }
      />
      {periodPage ? (
        <form className="toolbar" onSubmit={applyPeriod}>
          <label>
            From{" "}
            <input
              type="date"
              required
              value={from}
              onChange={(x) => setFrom(x.target.value)}
            />
          </label>
          <label>
            To{" "}
            <input
              type="date"
              required
              value={to}
              onChange={(x) => setTo(x.target.value)}
            />
          </label>
          <button className="btn outline">Apply dates</button>
          <span className="muted small">
            Report dates are UTC; maximum 90 days. Response deadlines use U.S.
            Eastern.
          </span>
        </form>
      ) : null}
      {read.state.status === "loading" ? (
        <Loading what={titles[page] ?? "business records"} />
      ) : null}
      {read.state.status === "done" && !e ? (
        <Problem state={read.state.result} onRetry={read.retry} />
      ) : null}
      {e && data ? (
        <>
          <SourceNote envelope={e} />
          {e.state === "partial" ? (
            <Notice tone="warn">
              This view has partial coverage. Missing records or an unconnected
              source do not mean zero business activity.
            </Notice>
          ) : null}
          <FeedStatus data={data} />
          {kinds.length && !admin.canWrite ? (
            <Notice>Saving is turned off in this environment.</Notice>
          ) : null}
          {kinds.length ? (
            <div className="actions">
              {kinds.map((k) => (
                <button
                  key={k}
                  className="btn primary"
                  disabled={!admin.canWrite || !!editing || !!creating}
                  onClick={() => setCreating(k)}
                >
                  New {names[k].toLowerCase()}
                </button>
              ))}
            </div>
          ) : null}
          {editing || creating ? (
            <Editor
              kind={editing?.kind ?? creating!}
              record={editing ?? undefined}
              sourceRequest={sourceRequest}
              scope={"business/" + page}
              onSaved={saved}
              onReload={async () => {
                await read.reload();
              }}
              onClose={() => {
                setEditing(null);
                setCreating(null);
                setSourceRequest(undefined);
              }}
            />
          ) : (
            <PendingOps scope={"business/" + page} onOpen={selectPending} />
          )}
          {page === "today" ? (
            <>
              <p className="muted">
                Seven days a week, 7 a.m.–10 p.m. U.S. Eastern. Two service
                dates after the effective receipt; after-hours receipt starts at
                the next opening.
              </p>
              <Table
                items={rows(data.items)}
                columns={[
                  {
                    name: "Item",
                    render: (r) => (
                      <Link href={String(r.href)}>{value(r.title)}</Link>
                    ),
                  },
                  {
                    name: "Next action",
                    render: (r) => (
                      <>
                        {value(r.reason)}{" "}
                        {r.overdue ? <Tag tone="warn">Overdue</Tag> : null}
                      </>
                    ),
                  },
                  { name: "Due", render: (r) => when(r.dueAt) },
                ]}
              />
              <p className="muted">{value(data.note)}</p>
              <Link href="/business/coverage">
                Review channel and source coverage
              </Link>
            </>
          ) : null}
          {page === "intake" ? (
            <>
              <Tiles
                items={["new", "qualified", "quoted", "won", "lost"].map(
                  (stage) => [
                    label(stage),
                    allRecords.filter((r) => r.data.stage === stage).length,
                  ],
                )}
              />
              <Notice>
                Shopify, direct email, phone and Rondo inquiries must be logged
                by the operator until a connector is qualified. An automated
                receipt is not a human reply.{" "}
                <Link href="/business/coverage">See coverage</Link>.
              </Notice>
              <Table
                items={allRecords}
                columns={[
                  {
                    name: "Inquiry",
                    render: (r) => (
                      <button
                        className="business-link"
                        onClick={() => setEditing(r as RecordRow)}
                      >
                        {value((r.data as Row).title)}
                      </button>
                    ),
                  },
                  {
                    name: "Source",
                    render: (r) => label((r.data as Row).channel),
                  },
                  {
                    name: "Stage",
                    render: (r) => label((r.data as Row).stage),
                  },
                  {
                    name: "Human reply",
                    render: (r) =>
                      when((r.data as Row).firstRespondedAt, "Not recorded"),
                  },
                  {
                    name: "Follow-up",
                    render: (r) => when((r.data as Row).followUpAt),
                  },
                  {
                    name: "Value",
                    render: (r) => currency((r.data as Row).estimatedMinor),
                  },
                ]}
              />
              <Section title="Client-hub source requests">
                <p className="muted">
                  Open a source request for its audited details. Log its
                  reference and request ID above to track a human reply or
                  opportunity; do not copy the original message.
                </p>
                <Table
                  items={rows(data.sourceRequests)}
                  columns={[
                    {
                      name: "Reference",
                      render: (r) => (
                        <Link href={"/velani/requests/" + r.id}>
                          {value(r.reference)}
                        </Link>
                      ),
                    },
                    {
                      name: "Request ID",
                      render: (r) => <code>{value(r.id)}</code>,
                    },
                    { name: "Received", render: (r) => when(r.createdAt) },
                    {
                      name: "Triage",
                      render: (r) => (
                        <button
                          className="btn outline small"
                          disabled={
                            !admin.canWrite ||
                            !!editing ||
                            !!creating ||
                            allRecords.some(
                              (record) => record.data.sourceRequestId === r.id,
                            )
                          }
                          onClick={() => {
                            setSourceRequest(r);
                            setCreating("inquiry");
                          }}
                        >
                          Track inquiry
                        </button>
                      ),
                    },
                  ]}
                />
              </Section>
            </>
          ) : null}
          {page === "delivery" ? (
            <>
              <Notice>
                Project completion, client acceptance and payment are separate
                facts. Record only the approved scope; keep customer messages
                and workforce data in their source.
              </Notice>
              <Table
                items={allRecords}
                columns={[
                  {
                    name: "Record",
                    render: (r) => (
                      <button
                        className="business-link"
                        onClick={() => setEditing(r as RecordRow)}
                      >
                        {value((r.data as Row).title)}
                      </button>
                    ),
                  },
                  { name: "Type", render: (r) => label(r.kind) },
                  {
                    name: "Project",
                    render: (r) => (
                      <Link href={"/projects/" + r.projectId}>
                        Open project
                      </Link>
                    ),
                  },
                  {
                    name: "Due / renewal",
                    render: (r) =>
                      when((r.data as Row).dueAt ?? (r.data as Row).renewalAt),
                  },
                  {
                    name: "Accepted",
                    render: (r) =>
                      when((r.data as Row).acceptedAt, "Not recorded"),
                  },
                  {
                    name: "Blocker",
                    render: (r) =>
                      value((r.data as Row).blocker) || "None recorded",
                  },
                ]}
              />
              <DeliveryPlans
                records={allRecords}
                expenses={rows(data.items).filter((r) => r.kind === "expense")}
              />
            </>
          ) : null}
          {page === "finance" ? <Money data={data} /> : null}
          {page === "costs" ? (
            <>
              <Tiles
                items={[
                  ["Recorded costs", currency(data.spendMinor)],
                  ["Recorded budget", currency(data.budgetMinor)],
                  ["Recorded headroom", currency(data.headroomMinor)],
                  ["Net receipts less costs", currency(data.contributionMinor)],
                  ["Support minutes", value(data.supportMinutes)],
                ]}
              />
              <p className="muted">{value(data.basis)}</p>
              <Notice>
                Contribution stays unknown until finance is current and complete
                and Velani, NEVORA and shared costs are reviewed for the
                selected single month.
              </Notice>
              <Table
                items={[...rows(data.expenses), ...rows(data.budgets)]}
                columns={[
                  {
                    name: "Record",
                    render: (r) => (
                      <button
                        className="business-link"
                        onClick={() => setEditing(r as RecordRow)}
                      >
                        {value((r.data as Row).title)}
                      </button>
                    ),
                  },
                  {
                    name: "Business",
                    render: (r) => label((r.data as Row).product),
                  },
                  { name: "Type", render: (r) => label(r.kind) },
                  {
                    name: "Amount",
                    render: (r) => currency((r.data as Row).amountMinor),
                  },
                  {
                    name: "Period",
                    render: (r) =>
                      (r.data as Row).month
                        ? value((r.data as Row).month)
                        : when((r.data as Row).occurredAt),
                  },
                ]}
              />
            </>
          ) : null}
          {page === "lifecycle" ? (
            <>
              <Notice>{value(data.definitions)}</Notice>
              <Table
                items={rows(data.observations)}
                columns={[
                  {
                    name: "Workplace",
                    render: (r) => (
                      <Link href={"/nevora/workplaces/" + r.sourceId}>
                        {value(r.origin)}
                      </Link>
                    ),
                  },
                  { name: "Stage", render: (r) => label(r.stage) },
                  {
                    name: "Stage age",
                    render: (r) =>
                      r.qualified
                        ? `${Math.max(0, Math.floor((Date.now() - Date.parse(String(r.stageSince))) / 86400000))} days`
                        : "Unknown",
                  },
                  {
                    name: "Setup",
                    render: (r) =>
                      r.setupComplete === null
                        ? "Unknown"
                        : r.setupComplete
                          ? "Complete"
                          : "Needs work",
                  },
                  {
                    name: "Trial ends",
                    render: (r) =>
                      r.qualified
                        ? when(r.trialEndsAt, "Not recorded")
                        : "Unknown",
                  },
                  {
                    name: "First use",
                    render: (r) => when(r.firstUsedAt, "Unknown"),
                  },
                  {
                    name: "Restriction",
                    render: (r) =>
                      r.qualified
                        ? value(r.restrictionReason) || "None recorded"
                        : "Unknown",
                  },
                  {
                    name: "Worker observation",
                    render: (r) => (
                      <>
                        {label(r.workerState)} ·{" "}
                        {when(r.workerObservedAt, "Unknown time")}
                      </>
                    ),
                  },
                ]}
              />
              <Section title="Control and catalog evidence">
                <p className="muted">
                  Aggregate company observations are published by the private
                  operator. Control records below do not establish adoption or
                  worker health.
                </p>
                <Table
                  items={rows(data.workplaces)}
                  columns={[
                    {
                      name: "Workplace",
                      render: (r) => (
                        <Link href={"/nevora/workplaces/" + r.id}>
                          {value(r.origin)}
                        </Link>
                      ),
                    },
                    {
                      name: "Control lifecycle",
                      render: (r) => label(r.lifecycle),
                    },
                  ]}
                />
                <p>
                  {rows(data.registrations).length} registrations in the
                  qualified source window; coverage {value(data.sourceCoverage)}
                  .
                </p>
              </Section>
            </>
          ) : null}
          {page === "insights" ? (
            <>
              <LifecycleInsights data={(data.lifecycle ?? {}) as Row} />
              <Notice>{value(data.population)}</Notice>
              <Tiles
                items={Object.entries((data.current ?? {}) as Row).map(
                  ([k, v]) => [label(k), value(v)],
                )}
              />
              <Section title="Comparable retained populations">
                <Table
                  items={[
                    {
                      id: "current",
                      label: "Selected period",
                      ...((data.current as Row) ?? {}),
                    },
                    {
                      id: "previous",
                      label: "Previous equal period",
                      ...((data.previous as Row) ?? {}),
                    },
                  ]}
                  columns={[
                    { name: "Period", render: (r) => value(r.label) },
                    ...[
                      "inquiries",
                      "qualified",
                      "won",
                      "lost",
                      "replied",
                      "repliedOnTime",
                    ].map((k) => ({
                      name: label(k),
                      render: (r: Row) => value(r[k]),
                    })),
                  ]}
                />
              </Section>
              <Section title="By channel">
                <Table
                  items={rows(data.byChannel)}
                  columns={[
                    { name: "Channel", render: (r) => label(r.channel) },
                    ...["inquiries", "won", "repliedOnTime"].map((k) => ({
                      name: label(k),
                      render: (r: Row) => value(r[k]),
                    })),
                  ]}
                />
              </Section>
              <Section title="Daily receipts">
                <Table
                  items={rows(data.daily)}
                  columns={[
                    { name: "Date (UTC)", render: (r) => value(r.day) },
                    { name: "Inquiries", render: (r) => value(r.inquiries) },
                    {
                      name: "Current won outcome",
                      render: (r) => value(r.won),
                    },
                  ]}
                />
              </Section>
            </>
          ) : null}
          {page === "coverage" ? (
            <>
              <Notice>{value(data.note)}</Notice>
              <Table
                items={rows(data.channels)}
                columns={[
                  { name: "Channel", render: (r) => label(r.channel) },
                  { name: "Intake method", render: (r) => label(r.mode) },
                  { name: "Coverage", render: (r) => label(r.state) },
                ]}
              />
            </>
          ) : null}
          {isCustomer ? <Customer data={data} /> : null}
        </>
      ) : null}
    </>
  );
}
function DeliveryPlans({
  records,
  expenses,
}: {
  records: RecordRow[];
  expenses: Row[];
}) {
  return (
    <Section title="Project commitments">
      {records
        .filter((r) => r.kind === "plan")
        .map((r) => {
          const actual = expenses
            .filter((e) => e.projectId === r.projectId)
            .reduce((n, e) => n + Number((e.data as Row).amountMinor), 0);
          return (
            <div className="panel business-plan" key={r.id}>
              <h3>{value(r.data.title)}</h3>
              <p>{value(r.data.scope) || "Scope not recorded"}</p>
              <dl>
                <dt>Approved value</dt>
                <dd>{currency(r.data.approvedMinor)}</dd>
                <dt>Estimated delivery cost</dt>
                <dd>{currency(r.data.estimatedCostMinor)}</dd>
                <dt>Recorded project costs</dt>
                <dd>{currency(actual)} (retained expense records)</dd>
                <dt>Invoice reference</dt>
                <dd>{value(r.data.invoiceReference) || "Not recorded"}</dd>
              </dl>
            </div>
          );
        })}
    </Section>
  );
}
function LifecycleInsights({ data }: { data: Row }) {
  const current = (data.current ?? {}) as Row,
    previous = (data.previous ?? {}) as Row;
  const keys = [
    "observedWorkplaces",
    "activated",
    "trialsStarted",
    "convertedTrials",
    "paidStarted",
    "cancellationsObserved",
    "activePaidNow",
    "medianHoursToActivation",
    "historicalRetentionRate",
  ];
  return (
    <Section title="NEVORA activation and retention">
      <p className="muted">{value(data.population)}</p>
      <Table
        items={keys.map((key) => ({
          id: key,
          metric: label(key),
          current: current[key],
          previous: previous[key],
        }))}
        columns={[
          { name: "Metric", render: (r) => value(r.metric) },
          { name: "Selected period", render: (r) => value(r.current) },
          { name: "Previous equal period", render: (r) => value(r.previous) },
        ]}
      />
    </Section>
  );
}
function Money({ data }: { data: Row }) {
  const m = (data.metrics ?? {}) as Row;
  return (
    <>
      <Tiles
        items={[
          ["NEVORA monthly recurring value", currency(m.mrrMinor)],
          ["Open invoice balance", currency(m.receivablesMinor)],
          ["Overdue balance", currency(m.overdueMinor)],
          ["Gross payments in period", currency(m.grossCashMinor)],
          ["Refunds in period", currency(m.refundsMinor)],
          ["Net payments in period", currency(m.netCashMinor)],
        ]}
      />
      <p className="muted">
        {data.from && data.to ? (
          <>
            Period: {value(data.from)} through {value(data.to)} UTC.{" "}
          </>
        ) : null}
        USD. MRR and invoice balances are current observations; payment totals
        use the selected UTC dates. Payments include collected tax and are
        grouped by provider record creation date. They are not accounting
        revenue or bank payouts.
      </p>
      <Table
        items={rows(data.byProduct).map((r) => ({
          product: r.product,
          ...((r.metrics ?? {}) as Row),
        }))}
        columns={[
          { name: "Business", render: (r) => label(r.product) },
          { name: "Net payments", render: (r) => currency(r.netCashMinor) },
          { name: "Open balance", render: (r) => currency(r.receivablesMinor) },
          { name: "Overdue", render: (r) => currency(r.overdueMinor) },
        ]}
      />
      <Table
        items={rows(data.items)}
        columns={[
          { name: "Reference", render: (r) => value(r.sourceId) },
          { name: "Business", render: (r) => label(r.product) },
          { name: "Type", render: (r) => label(r.kind) },
          { name: "Status", render: (r) => label(r.status) },
          {
            name: "Amount",
            render: (r) =>
              currency(r.monthlyMinor ?? r.totalMinor ?? r.amountMinor),
          },
          {
            name: "Remaining invoice balance",
            render: (r) =>
              r.kind === "invoice" ? currency(r.remainingMinor) : "—",
          },
          {
            name: "Client",
            render: (r) => (
              <Link href={"/business/customers/" + r.clientId}>
                Business summary
              </Link>
            ),
          },
          {
            name: "Due / renewal",
            render: (r) => when(r.dueAt ?? r.renewalAt),
          },
        ]}
      />
    </>
  );
}
function Customer({ data }: { data: Row }) {
  const c = (data.client ?? {}) as Row;
  return (
    <>
      <Section
        title={value(c.displayName)}
        action={
          <Link className="btn outline small" href={"/clients/" + c.id}>
            Contacts and relationship
          </Link>
        }
      >
        <p>
          {label(c.state)} · engaged {when(c.engagedAt, "Not recorded")}
        </p>
      </Section>
      <CustomerTimeline data={data} />
      <Section title="Projects">
        <Table
          items={rows(data.projects)}
          columns={[
            {
              name: "Project",
              render: (r) => (
                <Link href={"/projects/" + r.id}>{value(r.name)}</Link>
              ),
            },
            { name: "Stage", render: (r) => label(r.stage) },
            { name: "Target date", render: (r) => value(r.targetDate) },
          ]}
        />
      </Section>
      <Section title="Cases">
        <Table
          items={rows(data.cases)}
          columns={[
            {
              name: "Case",
              render: (r) => (
                <Link href={"/cases/" + r.id}>{value(r.reference)}</Link>
              ),
            },
            { name: "State", render: (r) => label(r.state) },
            { name: "Next follow-up", render: (r) => when(r.followUpAt) },
          ]}
        />
      </Section>
      <Section title="Commercial work and commitments">
        <Table
          items={rows(data.records)}
          columns={[
            {
              name: "Record",
              render: (r) => (
                <Link
                  href={
                    "/business/" +
                    (r.kind === "inquiry"
                      ? "intake"
                      : ["expense", "budget"].includes(String(r.kind))
                        ? "costs"
                        : "delivery") +
                    "?record=" +
                    r.id
                  }
                >
                  {value((r.data as Row).title)}
                </Link>
              ),
            },
            { name: "Type", render: (r) => label(r.kind) },
            {
              name: "Next action",
              render: (r) =>
                when(
                  (r.data as Row).followUpAt ??
                    (r.data as Row).dueAt ??
                    (r.data as Row).renewalAt,
                ),
            },
          ]}
        />
      </Section>
      <Section title="Financial observations">
        <Money
          data={{
            items: data.finance,
            metrics: data.financialMetrics,
            from: data.from,
            to: data.to,
          }}
        />
      </Section>
      <Section title="Workplace observations">
        <Table
          items={rows(data.health)}
          columns={[
            {
              name: "Workplace",
              render: (r) => (
                <Link href={"/nevora/workplaces/" + r.sourceId}>
                  {value(r.origin)}
                </Link>
              ),
            },
            { name: "Observed stage", render: (r) => label(r.stage) },
            {
              name: "Trial ends",
              render: (r) =>
                r.qualified ? when(r.trialEndsAt, "Not recorded") : "Unknown",
            },
            {
              name: "First use",
              render: (r) => when(r.firstUsedAt, "Unknown"),
            },
          ]}
        />
      </Section>
    </>
  );
}

function CustomerTimeline({ data }: { data: Row }) {
  const events: Row[] = [];
  const add = (id: unknown, title: unknown, event: string, at: unknown) => {
    if (at) events.push({ id: String(id) + event, title, event, at });
  };
  for (const r of rows(data.records)) {
    const d = r.data as Row;
    add(r.id, d.title, "Record created", r.createdAt);
    if (r.kind === "inquiry") {
      add(r.id, d.title, "Inquiry received", d.receivedAt);
      add(r.id, d.title, "First human reply", d.firstRespondedAt);
    }
    add(r.id, d.title, "Work completed", d.completedAt);
    add(r.id, d.title, "Client accepted", d.acceptedAt);
  }
  for (const r of rows(data.finance))
    add(r.sourceId, r.sourceId, label(r.kind), r.occurredAt);
  for (const r of rows(data.health))
    if (r.qualified)
      add(r.sourceId, r.origin, "First product use", r.firstUsedAt);
  events.sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at)));
  const lastReply = events.find((r) => r.event === "First human reply");
  return (
    <Section title="Business timeline">
      <p className="muted">
        Retained records only. Last recorded human reply:{" "}
        {when(lastReply?.at, "Not recorded")}. Follow-up and commitments are
        listed below.
      </p>
      <Table
        items={events.slice(0, 100)}
        columns={[
          { name: "When", render: (r) => when(r.at) },
          { name: "Event", render: (r) => value(r.event) },
          { name: "Record", render: (r) => value(r.title) },
        ]}
      />
    </Section>
  );
}
