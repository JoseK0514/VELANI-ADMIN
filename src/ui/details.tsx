"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  canonicalHttpsOrigin,
  CASE_STATES,
  PROJECT_STAGES,
  REASONS,
  TERMINAL_CASE_STATES,
  TERMINAL_STAGES,
  type ReadEnvelope,
} from "./contract";
import { label, PROVENANCE, stateText, when } from "./copy";
import { CommandForm, options, type Built, type FieldSpec, type Picked, type Receipt, type Values } from "./forms";
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
  Tag,
  useRead,
  type Row,
} from "./parts";
import { useAdmin } from "./shared";

const LANGS: [string, string][] = [
  ["en", "English"],
  ["es", "Spanish"],
];
const text = (v: unknown, none = "Not given") => (typeof v === "string" && v ? v : none);

function Back({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="back" href={href}>
      <ArrowLeft size={16} aria-hidden />
      {children}
    </Link>
  );
}

/** Shared detail behaviour: read states, one open form at a time, reread after saving. */
function useDetail<T>(path: string) {
  const admin = useAdmin();
  const read = useRead(path);
  const [open, setOpen] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const envelope = envelopeOf<T>(read.state);
  const onSaved = async (receipt: Receipt) => {
    setOpen(null);
    setSaved(
      receipt.replayed
        ? "This was already saved earlier. The record below is the current one."
        : "Saved. The record below is the current one.",
    );
    await read.reload();
  };
  /** Props for the form the page opens under this name. One command slot each. */
  const form = (formKey: string) => ({
    opKey: `${path}#${formKey}`,
    scope: path,
    formKey,
    onSaved,
    onCancel: () => setOpen(null),
    onReload: read.reload,
  });
  const actions = (items: [string, string][]) => (
    <div className="actions" role="group" aria-label="Changes">
      {items.map(([key, name]) => (
        <button
          key={key}
          className="btn outline"
          disabled={!admin.canWrite || open !== null}
          aria-describedby={admin.canWrite ? undefined : "write-note"}
          onClick={() => {
            setSaved(null);
            setOpen(key);
          }}
        >
          {name}
        </button>
      ))}
      {admin.canWrite ? null : (
        <p className="muted small" id="write-note">
          {admin.fixtures ? "Development fixtures cannot save." : "Saving is turned off in this environment."}
        </p>
      )}
    </div>
  );
  const frame = (what: string, back: ReactNode, body: (e: ReadEnvelope<T>) => ReactNode) => (
    <>
      {back}
      {read.state.status === "loading" ? (
        <>
          <PageHead title={what} />
          <Loading what={what} />
        </>
      ) : null}
      {read.state.status === "done" && !envelope ? (
        <>
          <PageHead title={what} />
          <Problem state={read.state.result} onRetry={read.retry} />
        </>
      ) : null}
      {envelope ? (
        <>
          {body(envelope)}
          <p className="sr" role="status" aria-live="polite">
            {saved}
          </p>
        </>
      ) : null}
    </>
  );
  const banners = (
    <>
      {saved ? <Notice tone="ok">{saved}</Notice> : null}
      {open === null ? <PendingOps scope={path} onOpen={setOpen} /> : null}
      {read.state.status === "done" && read.state.refreshError ? (
        <Notice
          tone="warn"
          action={
            <button className="btn outline small" onClick={() => void read.reload()}>
              Try again
            </button>
          }
        >
          The record could not be reread. What you see may be out of date.{" "}
          {stateText(read.state.refreshError)}
        </Notice>
      ) : null}
    </>
  );
  return { admin, read, open, setOpen, envelope, form, actions, frame, banners };
}

function Notes({ notes }: { notes: unknown }) {
  const list = Array.isArray(notes) ? (notes as Row[]) : [];
  return (
    <Section title="Notes">
      {list.length === 0 ? (
        <p className="muted">No notes yet.</p>
      ) : (
        <ul className="notes">
          {list.map((n) => (
            <li key={String(n.id)}>
              <p className="pre">{String(n.text ?? "")}</p>
              <p className="muted small">{when(n.createdAt, "Unknown time")}</p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function NoteForm({
  targetType,
  targetId,
  version,
  props,
}: {
  targetType: "client" | "project" | "case";
  targetId: string;
  version: string;
  props: {
    opKey: string;
    scope: string;
    formKey: string;
    onSaved: (r: Receipt) => void;
    onCancel: () => void;
    onReload: () => Promise<void>;
  };
}) {
  return (
    <CommandForm
      {...props}
      title="Add note"
      submit="Save note"
      intro={
        <p className="muted">
          Plain text only. Do not paste the customer message, passwords or employee details.
        </p>
      }
      fields={[{ name: "text", label: "Note", type: "textarea", required: true, max: 2000 }]}
      initial={{ text: "" }}
      build={(v) => ({
        method: "POST",
        path: "notes",
        expectedVersion: version,
        payload: { targetType, targetId, text: String(v.text).trim() },
      })}
    />
  );
}

/* ---------------------------------------------------------------- NEVORA */

export function WorkplaceDetail({ id }: { id: string }) {
  const d = useDetail<Row>(`nevora/workplaces/${id}`);
  return d.frame("Workplace", <Back href="/nevora/workplaces">Workplaces</Back>, (envelope) => {
    const w = envelope.data;
    const catalog = (w.catalog ?? {}) as Row;
    const origin = canonicalHttpsOrigin(w.origin);
    const provisioning = Array.isArray(w.provisioning) ? (w.provisioning as Row[]) : [];
    return (
      <>
        <PageHead
          title={origin ? new URL(origin).host : text(w.origin, "Workplace")}
          tag={w.classification === "internal" ? <Tag tone="warn">Internal fixture</Tag> : null}
        />
        {d.banners}
        <SourceNote envelope={envelope} />
        {d.actions([["link", "Link to a client"]])}
        {d.open === "link" ? (
          <CommandForm
            {...d.form("link")}
            title="Link this workplace to a client"
            submit="Link workplace"
            intro={
              <p className="muted">
                A workplace can be linked to one client. The link is checked against the workplace
                exactly as shown here and recorded as Client link verified. It needs a passkey check.
              </p>
            }
            fields={[{ name: "client", label: "Client", type: "pick", entity: "client", required: true }]}
            initial={{ client: null }}
            build={(v): Built => {
              const c = v.client as Picked;
              if (!c.version) return { errors: { client: "Choose the client again." } };
              return {
                method: "POST",
                path: `clients/${c.id}/source-links`,
                expectedVersion: c.version,
                payload: {
                  sourceSystem: "nevora",
                  sourceId: id,
                  expectedSourceRevision: String(w.revision),
                  expectedIncarnation: String(w.incarnation),
                  reasonCode: "client_link_verified",
                },
              };
            }}
          />
        ) : null}
        <Section title="Workplace">
          <Facts
            items={[
              [
                "Address",
                origin ? (
                  <a href={origin} target="_blank" rel="noopener noreferrer">
                    {origin}
                  </a>
                ) : (
                  text(w.origin, "Unknown")
                ),
              ],
              ["Lifecycle", label(w.lifecycle)],
              ["Environment", label(w.environment)],
              ["Created", when(w.createdAt, "Unknown")],
              ["Revision", text(w.revision, "Unknown")],
              ["Incarnation", text(w.incarnation, "Unknown")],
              ["Classification", label(w.classification)],
            ]}
          />
        </Section>
        <Section title="Enrollment record">
          <p className="muted">
            Recorded when the workplace enrolled and synced since. It is not a verified current owner.
          </p>
          <Facts
            items={[
              ["Enrollment name", text(catalog.enrollmentName, "Unknown")],
              ["Access", label(catalog.access ?? "unknown")],
              ["Trial ends", when(catalog.trialEndsAt, "Unknown")],
              ["Plan", text(catalog.planKey, "Unknown")],
              ["Last synced", when(catalog.observedAt, "Unknown")],
            ]}
          />
          {catalog.reason === "source_identity_mismatch" ? (
            <Notice tone="warn">
              The enrollment record does not match this workplace, so access is Unknown.
            </Notice>
          ) : null}
        </Section>
        <Section title="Provisioning">
          {provisioning.length === 0 ? (
            <p className="muted">No provisioning steps recorded.</p>
          ) : (
            <ul className="rows">
              {provisioning.map((p, i) => (
                <li key={i}>
                  <span>{label(p.state)}</span>
                  <span className="muted small">{when(p.observedAt, "Unknown time")}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Not part of this version">
          <ul className="rows">
            {["Current headcount", "Company setup readiness", "Worker health"].map((n) => (
              <li key={n}>
                <span>{n}</span>
                <Tag>Not supported</Tag>
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  });
}

/* ---------------------------------------------------------------- Velani */

export function RequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const d = useDetail<Row>(`velani/requests/${id}`);
  return d.frame("Request", <Back href="/velani/requests">Requests</Back>, (envelope) => {
    const r = envelope.data;
    const emails = Array.isArray(r.emailSubmissions) ? (r.emailSubmissions as Row[]) : [];
    return (
      <>
        <PageHead
          title={`Request ${text(r.reference, id.slice(0, 8))}`}
          action={
            <button
              className="btn primary"
              disabled={!d.admin.canWrite || d.open !== null}
              aria-describedby={d.admin.canWrite ? undefined : "case-note"}
              onClick={() => d.setOpen("case")}
            >
              Open a case
            </button>
          }
        />
        {d.admin.canWrite ? null : (
          <p className="muted small" id="case-note">
            {d.admin.fixtures ? "Development fixtures cannot save." : "Saving is turned off in this environment."}
          </p>
        )}
        {d.banners}
        <SourceNote envelope={envelope} />
        <Notice>
          Opening this request was recorded in Activity. The message stays in the Velani source and is
          not copied into the admin.
        </Notice>
        {d.open === "case" ? (
          <CommandForm
            {...d.form("case")}
            title="Open a case for this request"
            submit="Open case"
            intro={
              <p className="muted">
                One case per request. The case is kept until the request expires on{" "}
                {when(r.expiresAt, "an unknown date")}.
              </p>
            }
            fields={[]}
            initial={{}}
            build={() => ({
              method: "POST",
              path: "cases",
              expectedVersion: "0",
              payload: { sourceRequestId: id },
            })}
            onSaved={(receipt) => router.push(`/cases/${receipt.entityId}`)}
          />
        ) : null}
        <Section title="Request">
          <Facts
            items={[
              ["Type", label(r.type)],
              ["Company", text(r.company)],
              ["Project", text(r.project)],
              ["Urgency", label(r.urgency)],
              ["Language", r.language === "es" ? "Spanish" : r.language === "en" ? "English" : label(r.language)],
              ["Received", when(r.createdAt, "Unknown")],
              ["Expires", when(r.expiresAt, "Unknown")],
            ]}
          />
        </Section>
        <Section title="Sender">
          <p className="muted">As the sender wrote it. Not verified, and not a login.</p>
          <Facts
            items={[
              ["Name", text(r.name)],
              ["Email", text(r.email)],
            ]}
          />
          <h3>Message</h3>
          <p className="pre message">{text(r.description, "No message.")}</p>
        </Section>
        <Section title="Emails">
          <p className="muted">Submitted means handed to the email provider. It does not mean delivered.</p>
          {emails.length === 0 ? (
            <p className="muted">No email submissions recorded.</p>
          ) : (
            <ul className="rows">
              {emails.map((e, i) => (
                <li key={i}>
                  <span>{label(e.kind)}</span>
                  <span>
                    <Tag>{label(e.state)}</Tag>
                    <span className="muted small"> Attempts {typeof e.attempts === "number" ? e.attempts : "unknown"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </>
    );
  });
}

/* --------------------------------------------------------------- Clients */

type Contact = Row & { id: string };

function contactFields(links: Row[], editing: boolean): (v: Values) => FieldSpec[] {
  return (v) => [
    { name: "name", label: "Name", type: "text", required: true, max: 120 },
    { name: "email", label: "Email", type: "email", required: true, max: 254 },
    { name: "phone", label: "Phone", type: "tel", max: 32 },
    { name: "language", label: "Language", type: "select", required: true, options: LANGS },
    {
      name: "provenance",
      label: "Where this contact comes from",
      type: "select",
      required: true,
      options: [
        ["asserted", "Asserted, not verified"],
        ["operator_verified", "Verified by operator"],
        ...(links.length ? ([["source_enrollment", "From workplace enrollment"]] as [string, string][]) : []),
      ],
      hint: "This is a record of where the contact came from. It never gives anyone a login.",
    },
    ...(v.provenance === "source_enrollment"
      ? ([
          {
            name: "sourceId",
            label: "Linked workplace",
            type: "select",
            required: true,
            options: links.map((l) => [String(l.sourceId), `Workplace ${String(l.sourceId).slice(0, 8)}`]),
            hint: "The email must match the enrollment email of this linked workplace.",
          },
        ] as FieldSpec[])
      : []),
    ...(editing
      ? ([
          { name: "active", label: "Contact is active", type: "checkbox" },
          {
            name: "reasonCode",
            label: "Reason for this change",
            type: "select",
            required: true,
            options: (["contact_correction", "client_requested_change", "confirmed_contact"] as const).map(
              (r) => [r, REASONS[r]],
            ),
            hint: "Verified by operator needs Contact confirmed. Changing the email without a new check resets it to Asserted.",
          },
        ] as FieldSpec[])
      : []),
  ];
}

function contactPayload(v: Values, editing: boolean): Record<string, unknown> {
  const provenance = String(v.provenance);
  const phone = String(v.phone ?? "").trim();
  return {
    name: String(v.name).trim(),
    email: String(v.email).trim(),
    phone: phone || null,
    language: String(v.language),
    provenance,
    ...(provenance === "source_enrollment" ? { sourceId: String(v.sourceId) } : {}),
    ...(editing
      ? { active: v.active === true, reasonCode: String(v.reasonCode) }
      : provenance === "operator_verified"
        ? { reasonCode: "confirmed_contact" }
        : {}),
  };
}

export function ClientDetail({ id }: { id: string }) {
  const router = useRouter();
  const d = useDetail<Row>(`clients/${id}`);
  return d.frame("Client", <Back href="/clients">Clients</Back>, (envelope) => {
    const c = envelope.data;
    const version = String(c.version);
    const state = String(c.relationshipState);
    const engaged = Boolean(c.engagedAt);
    const contacts = Array.isArray(c.contacts) ? (c.contacts as Contact[]) : [];
    const links = Array.isArray(c.sourceLinks) ? (c.sourceLinks as Row[]) : [];
    const editing = d.open?.startsWith("contact:") ? contacts.find((x) => "contact:" + x.id === d.open) : null;
    const next: [string, string][] =
      state === "prospect"
        ? [
            ["active", "Active: service relationship confirmed"],
            ["inactive", "Inactive: close this prospect"],
          ]
        : state === "active"
          ? [["inactive", "Inactive: relationship closed"]]
          : engaged
            ? [["active", "Active: relationship reconfirmed with new work"]]
            : [["prospect", "Prospect: reopen"]];
    return (
      <>
        <PageHead
          title={text(c.displayName, "Client")}
          tag={<Tag tone={state === "active" ? "accent" : undefined}>{label(state)}</Tag>}
        />
        {d.banners}
        <SourceNote envelope={envelope} />
        {d.actions([
          ["project", "New project"],
          ["contact", "Add contact"],
          ["note", "Add note"],
          ["rename", "Rename"],
          ["relationship", "Change relationship"],
        ])}
        {d.open === "project" ? (
          <CommandForm
            {...d.form("project")}
            title="New project"
            submit="Create project"
            fields={[
              { name: "name", label: "Project name", type: "text", required: true, max: 200 },
              { name: "stage", label: "Stage", type: "select", required: true, options: options(PROJECT_STAGES) },
              { name: "targetDate", label: "Target date", type: "date" },
            ]}
            initial={{ name: "", stage: "planned", targetDate: "" }}
            build={(v) => ({
              method: "POST",
              path: "projects",
              expectedVersion: "0",
              payload: {
                clientId: id,
                name: String(v.name).trim(),
                stage: String(v.stage),
                targetDate: v.targetDate ? String(v.targetDate) : null,
              },
            })}
            onSaved={(receipt) => router.push(`/projects/${receipt.entityId}`)}
          />
        ) : null}
        {d.open === "contact" ? (
          <CommandForm
            {...d.form("contact")}
            title="Add contact"
            submit="Save contact"
            fields={contactFields(links, false)}
            initial={{ name: "", email: "", phone: "", language: "en", provenance: "asserted", sourceId: String(links[0]?.sourceId ?? "") }}
            build={(v) => ({
              method: "POST",
              path: `clients/${id}/contacts`,
              expectedVersion: version,
              payload: contactPayload(v, false),
            })}
          />
        ) : null}
        {editing ? (
          <CommandForm
            {...d.form("contact:" + editing.id)}
            key={editing.id}
            title={`Correct contact ${text(editing.name, "")}`}
            submit="Save correction"
            intro={<p className="muted">Contact corrections need a passkey check and a reason.</p>}
            fields={contactFields(links, true)}
            initial={{
              name: text(editing.name, ""),
              email: text(editing.email, ""),
              phone: text(editing.phone, ""),
              language: text(editing.language, "en"),
              provenance: text(editing.provenance, "asserted"),
              sourceId: text(editing.sourceId, String(links[0]?.sourceId ?? "")),
              active: editing.active !== false,
              reasonCode: "contact_correction",
            }}
            build={(v) => ({
              method: "PATCH",
              path: `clients/${id}/contacts/${editing.id}`,
              expectedVersion: version,
              payload: contactPayload(v, true),
            })}
          />
        ) : null}
        {d.open === "note" ? <NoteForm targetType="client" targetId={id} version={version} props={d.form("note")} /> : null}
        {d.open === "rename" ? (
          <CommandForm
            {...d.form("rename")}
            title="Rename client"
            submit="Save name"
            fields={[{ name: "displayName", label: "Client name", type: "text", required: true, max: 160 }]}
            initial={{ displayName: text(c.displayName, "") }}
            build={(v) => ({
              method: "PATCH",
              path: `clients/${id}`,
              expectedVersion: version,
              payload: { displayName: String(v.displayName).trim() },
            })}
          />
        ) : null}
        {d.open === "relationship" ? (
          <CommandForm
            {...d.form("relationship")}
            title="Change relationship"
            submit="Save relationship"
            intro={
              <p className="muted">
                Relationship changes need a passkey check. Closing keeps an engaged client&apos;s records
                for 12 months. A prospect keeps its original 90 day date.
              </p>
            }
            fields={(v) => [
              { name: "relationshipState", label: "New relationship", type: "select", required: true, options: next },
              ...(v.relationshipState === "active"
                ? ([
                    {
                      name: "confirm",
                      label: engaged
                        ? "I confirm there is new work for this client"
                        : "I confirm a service relationship with this client",
                      type: "checkbox",
                      required: true,
                    },
                  ] as FieldSpec[])
                : []),
            ]}
            initial={{ relationshipState: next[0][0], confirm: false }}
            build={(v) => {
              const to = String(v.relationshipState);
              return {
                method: "PATCH",
                path: `clients/${id}`,
                expectedVersion: version,
                payload:
                  to === "active"
                    ? {
                        relationshipState: "active",
                        confirmServiceRelationship: true,
                        reasonCode: engaged ? "engagement_reconfirmed" : "engagement_confirmed",
                      }
                    : to === "inactive"
                      ? { relationshipState: "inactive", reasonCode: "relationship_closed" }
                      : { relationshipState: "prospect", reasonCode: "reopened_work" },
              };
            }}
          />
        ) : null}
        <Section title="Client">
          <Facts
            items={[
              ["Relationship", label(state)],
              ["Created", when(c.createdAt, "Unknown")],
              ["Engaged", when(c.engagedAt, "Not engaged")],
              ["Closed", when(c.closedAt, "Not closed")],
              engaged
                ? ["Records kept until", when(c.deleteAfter, "No end date while active")]
                : ["Prospect record kept until", when(c.prospectExpiresAt, "Unknown")],
            ]}
          />
        </Section>
        <Section title="Contacts">
          <p className="muted">Contacts are records only. None of them is a login.</p>
          {contacts.length === 0 ? (
            <p className="muted">No contacts yet.</p>
          ) : (
            <ul className="cards">
              {contacts.map((k) => (
                <li key={k.id}>
                  <div>
                    <p className="strong">
                      {text(k.name, text(k.contact, "Contact"))}
                      {k.active === false ? <Tag>Inactive</Tag> : null}
                    </p>
                    {k.email ? <p>{String(k.email)}</p> : null}
                    {k.phone ? <p>{String(k.phone)}</p> : null}
                    <p className="muted small">
                      {PROVENANCE[String(k.provenance)] ?? label(k.provenance)}
                      {k.language ? ` · ${k.language === "es" ? "Spanish" : "English"}` : ""}
                      {k.verifiedAt ? ` · checked ${when(k.verifiedAt)}` : ""}
                    </p>
                  </div>
                  <button
                    className="btn outline small"
                    disabled={!d.admin.canWrite || d.open !== null}
                    onClick={() => d.setOpen("contact:" + k.id)}
                  >
                    Correct<span className="sr"> {text(k.name, "contact")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Linked workplaces">
          {links.length === 0 ? (
            <p className="muted">No NEVORA workplace is linked. Link one from the workplace record.</p>
          ) : (
            <ul className="rows">
              {links.map((l) => (
                <li key={String(l.sourceId)}>
                  <Link href={`/nevora/workplaces/${l.sourceId}`}>Workplace {String(l.sourceId).slice(0, 8)}</Link>
                  <span className="muted small">
                    {label(l.environment)} · revision {text(l.sourceRevision, "unknown")} · incarnation{" "}
                    {text(l.incarnation, "unknown")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Notes notes={c.notes} />
      </>
    );
  });
}

/* -------------------------------------------------------------- Projects */

export function ProjectDetail({ id }: { id: string }) {
  const d = useDetail<Row>(`projects/${id}`);
  return d.frame("Project", <Back href="/projects">Projects</Back>, (envelope) => {
    const p = envelope.data;
    const version = String(p.version);
    const wasTerminal = TERMINAL_STAGES.includes(String(p.stage));
    return (
      <>
        <PageHead title={text(p.name, "Project")} tag={<Tag>{label(p.stage)}</Tag>} />
        {d.banners}
        <SourceNote envelope={envelope} />
        {d.actions([
          ["edit", "Edit project"],
          ["note", "Add note"],
        ])}
        {d.open === "edit" ? (
          <CommandForm
            {...d.form("edit")}
            title="Edit project"
            submit="Save project"
            intro={
              wasTerminal ? (
                <p className="muted">
                  This project is finished. Moving it to an open stage is recorded as Work reopened.
                </p>
              ) : undefined
            }
            fields={[
              { name: "name", label: "Project name", type: "text", required: true, max: 200 },
              { name: "stage", label: "Stage", type: "select", required: true, options: options(PROJECT_STAGES) },
              { name: "targetDate", label: "Target date", type: "date" },
            ]}
            initial={{ name: text(p.name, ""), stage: text(p.stage, "planned"), targetDate: text(p.targetDate, "").slice(0, 10) }}
            build={(v) => ({
              method: "PATCH",
              path: `projects/${id}`,
              expectedVersion: version,
              payload: {
                name: String(v.name).trim(),
                stage: String(v.stage),
                targetDate: v.targetDate ? String(v.targetDate) : null,
                ...(wasTerminal && !TERMINAL_STAGES.includes(String(v.stage)) ? { reasonCode: "reopened_work" } : {}),
              },
            })}
          />
        ) : null}
        {d.open === "note" ? <NoteForm targetType="project" targetId={id} version={version} props={d.form("note")} /> : null}
        <Section title="Project">
          <Facts
            items={[
              ["Stage", label(p.stage)],
              ["Client", <Link key="c" href={`/clients/${p.clientId}`}>Open client record</Link>],
              ["Target date", when(p.targetDate)],
              ["Created", when(p.createdAt, "Unknown")],
            ]}
          />
        </Section>
        <Notes notes={p.notes} />
      </>
    );
  });
}

/* ----------------------------------------------------------------- Cases */

const toLocalInput = (iso: unknown) => {
  if (typeof iso !== "string" || !Number.isFinite(Date.parse(iso))) return "";
  const t = new Date(iso);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function CaseDetail({ id }: { id: string }) {
  const d = useDetail<Row>(`cases/${id}`);
  return d.frame("Case", <Back href="/cases">Cases</Back>, (envelope) => {
    const c = envelope.data;
    const version = String(c.version);
    const wasTerminal = TERMINAL_CASE_STATES.includes(String(c.state));
    return (
      <>
        <PageHead title={`Case ${text(c.reference, id.slice(0, 8))}`} tag={<Tag>{label(c.state)}</Tag>} />
        {d.banners}
        <SourceNote envelope={envelope} />
        {d.actions([
          ["update", "Update case"],
          ["link", "Link client and project"],
          ["note", "Add note"],
        ])}
        {d.open === "update" ? (
          <CommandForm
            {...d.form("update")}
            title="Update case"
            submit="Save case"
            intro={
              wasTerminal ? (
                <p className="muted">This case is finished. Moving it to an open state is recorded as Work reopened.</p>
              ) : undefined
            }
            fields={[
              { name: "state", label: "State", type: "select", required: true, options: options(CASE_STATES) },
              { name: "followUpAt", label: "Follow up on", type: "datetime", hint: "Your local time. Leave empty for no follow-up." },
            ]}
            initial={{ state: text(c.state, "new"), followUpAt: toLocalInput(c.followUpAt) }}
            build={(v) => ({
              method: "PATCH",
              path: `cases/${id}`,
              expectedVersion: version,
              payload: {
                state: String(v.state),
                followUpAt: v.followUpAt ? new Date(String(v.followUpAt)).toISOString() : null,
                ...(wasTerminal && !TERMINAL_CASE_STATES.includes(String(v.state)) ? { reasonCode: "reopened_work" } : {}),
              },
            })}
          />
        ) : null}
        {d.open === "link" ? (
          <CommandForm
            {...d.form("link")}
            title="Link client and project"
            submit="Save links"
            intro={
              <p className="muted">
                Changing a case link needs a passkey check and is recorded as Client link verified. The
                project must belong to the client. Leave both empty to remove the links.
              </p>
            }
            fields={[
              { name: "client", label: "Client", type: "pick", entity: "client" },
              { name: "project", label: "Project", type: "pick", entity: "project" },
            ]}
            initial={{ client: null, project: null }}
            build={(v): Built => {
              const client = v.client as Picked | null;
              const project = v.project as Picked | null;
              if (project && !client) return { errors: { client: "Choose the client this project belongs to." } };
              if (project && client && project.clientId && project.clientId !== client.id)
                return { errors: { project: "That project belongs to a different client." } };
              return {
                method: "PATCH",
                path: `cases/${id}`,
                expectedVersion: version,
                payload: {
                  state: String(c.state),
                  clientId: client?.id ?? null,
                  projectId: project?.id ?? null,
                  reasonCode: "client_link_verified",
                },
              };
            }}
          />
        ) : null}
        {d.open === "note" ? <NoteForm targetType="case" targetId={id} version={version} props={d.form("note")} /> : null}
        <Section title="Case">
          <Facts
            items={[
              ["State", label(c.state)],
              ["Request", <Link key="r" href={`/velani/requests/${c.sourceRequestId}`}>Open source request</Link>],
              ["Client", c.clientId ? <Link key="c" href={`/clients/${c.clientId}`}>Open client record</Link> : "Not linked"],
              ["Project", c.projectId ? <Link key="p" href={`/projects/${c.projectId}`}>Open project record</Link> : "Not linked"],
              ["Follow up", when(c.followUpAt)],
              ["Source request expires", when(c.sourceExpiresAt, "Unknown")],
              ["Created", when(c.createdAt, "Unknown")],
            ]}
          />
        </Section>
        <Notes notes={c.notes} />
      </>
    );
  });
}
