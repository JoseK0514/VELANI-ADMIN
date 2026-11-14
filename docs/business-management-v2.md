# Business management v2

Jose authorized implementing all eight gaps in the November13 business review.
He clarified the reply calendar: seven days a week,07:00–22:00. Use America/New_York,
the timezone in the question he answered; the webpage update remains his later task.
The existing promise remains two service days, with receipt outside service hours
starting at the next opening. Show the calendar and due timestamp explicitly.

Preserve the fixed v1 API and accepted authentication, restore fence, audits,
receipt replay and source minimization. Add `/api/admin/v2/business/*` behind the
same authority. No public signup, payment command, mail send, impersonation or
customer workforce credentials. New tables are internal, versioned and explicitly
migrated; build/start do not apply them. UI keeps the accepted teal system.

## Deliverables and acceptance

1. Today: actionable overdue replies/follow-ups, project/milestone deadlines,
   trial expiry and stale/failed health, with reasons, due dates and source links.
2. Intake: source-labelled manual intake for Shopify/email/phone/other plus the
   existing client-hub feed; explicit channel coverage, deduplication, opportunity
   stages, value, next contact, lost reason and separately recorded human reply.
3. Money: read-only published invoice/subscription/payment facts, qualified
   account/environment binding, source freshness, MRR separate from gross cash
   and refunds/receivables, currency buckets and drill-down records.
4. NEVORA: bounded lifecycle/health summaries via an operator-published aggregate
   feed, plus catalog/control fallback with partial coverage and trial attention.
   Never infer setup/use/worker health from ACTIVE or copy employee/payroll data.
5. Customer: join the existing client record with projects, cases, source links,
   opportunities, milestones, finance, health and next actions under one identity.
6. Delivery: scope, milestones, blockers, acceptance, approved value, estimated
   cost and invoice linkage; completed, accepted and paid remain separate.
7. Insights: period-filtered comparable conversions, first-response performance,
   activation/retention and monthly totals with definitions and population labels.
   Expired operational data cannot be presented as complete lifetime history.
8. Costs: product/project-attributed expenses, support effort, monthly budgets,
   headroom and contribution; unknown cost/finance coverage means unknown margin.

Source feeds are immutable, finite, validated observations published through a
private operator command. The normal web runtime cannot publish financial/health
observations or hold provider credentials. Read-only provider adapters and manual
intake/import procedures must remain clearly labelled; a disconnected channel
must never appear as complete automatic intake. Source identities and parent
retention are checked again at use. Private imports contain no raw messages,
employee data, account credentials or payment-card fields.

## Qualification and delivery

Meaningful RED/GREEN cases cover calendar boundaries/DST, due queues, missing
coverage, financial definitions, idempotency/version conflicts, auth/CSRF/recent
factor, source/environment mismatch, expiry/retention, customer isolation,
milestone ownership and period populations. Run owned PostgreSQL, types, lint,
build, actual browser workflows at desktop/phone sizes and the existing v1 suite.
Record all eight acceptance outcomes. Preserve independent review and distinct
hosted activation gates. No live bill, invoice, message or production enrollment
is authorized by this implementation request.
