# Business dashboard operations

The business API extends v1 without changing its contract. All routes use the same
owner session, exact origin, CSRF, shared rate limits and restore/retention fence.
GET `/api/admin/v2/business/` with `today`, `intake`, `records`, `records/:id`,
`finance`, `lifecycle`, `costs`, `insights`, `coverage` or `customers/:id`.
`from`/`to` are inclusive UTC dates, at most 90 days; defaults are the last30days.
`records` additionally accepts `kind`. Unknown filters are rejected.
POST `records` and PATCH `records/:id` use the existing schemaVersion1 command
wrapper (`operationId`, `expectedVersion`, `payload`). Payload contains `kind`,
nullable `clientId`/`projectId`, and strict `data` from `business/model.ts`.
Business writes require fresh factor proof. A retry must keep the operation ID
and exact body. After a version conflict, reload before reviewing a new save.

## Intake and delivery

Log Shopify/direct email/phone inquiries using a stable channel reference and
original receipt time. Log only consented Rondo leads, never chat transcripts.
Do not paste message bodies, credentials or payment details. Client-hub intake
requires its actual request ID, reference and original timestamp. Duplicate
channel/reference pairs are refused. An automatic confirmation is not a human
reply; record the actual first-human-reply time separately. Link an unassigned
inquiry once to a verified client/project, including when marking it won.
References, receipt times, established links and expiry cannot be rewritten.
Lost opportunities need a reason; won opportunities need a client.

Each project can have one approved delivery plan and multiple milestones.
Approved value, estimated cost, completion, client acceptance and invoice
reference are separate facts. Costs can be attributed to its client/project.
Completed milestones need a completion time; acceptance cannot precede it.
Today flags deadlines, missing acceptance, blockers and recorded renewals.
The two-service-day reply deadline uses every day,07:00–22:00 America/New_York;
after-hours receipt starts at the next opening. Webpage hours are unchanged.

## Explicit migration and grants

Use the existing reviewed private migration procedure to apply0006, then reapply
`adminGrants` for the actual web/maintenance principals. Build/start never migrate.
The web principal gets business record SELECT/INSERT/UPDATE and feed SELECT only.
It cannot publish a feed, charge a customer, issue an invoice or read provider keys.
Maintenance purges expired standalone records and feed snapshots older than90days;
client-linked rows cascade with their parent. Inquiries always expire within90days
of original receipt and earlier when their source expires. Editing never resets it.
Rollback: disable writes, roll back the application source, keep tables and receipts,
and requalify exact grants/migration bindings before restarting the earlier binary.
Do not drop populated tables or change a migration checksum to make rollback pass.

## Private read-only feeds

No connector is activated by this commit. Keep all operator credentials and inputs
in the approved private environment, never the web deployment. Required existing
variables: ADMIN_OPERATOR_CONFIRM=reviewed-private-action, operator/admin journal
URLs and exact database/journal project+branch IDs. `verifyPrivateBindings` checks
both actual database identities; publication shares the independent retention fence.

`npm run business:publish -- --environment staging --input /private/feed.json --apply`
requires a current-user-owned0600 file <=2MiB. Both finance and health inputs have
`system`, `environment`, `accountId`, `observedAt`, `validUntil`, `coverage` and
`items`. Bind accounts with ADMIN_REPORTING_FINANCE_ACCOUNT_ID and/or
ADMIN_REPORTING_HEALTH_ACCOUNT_ID. Validity is at most24hours; production should
use short observation windows. Replays are exact; conflicting/older snapshots fail
atomically. The UI labels imported facts **operator recorded**.

Finance inputs require `historyFrom`/`historyThrough` (UTC dates) and USD-only
invoice/subscription/payment/refund facts. Money amounts are integer cents, not
floating dollars. Client/project IDs must already exist and be within retention.
Missing currency support, mapping, pagination or history means partial coverage;
summary money stays unknown. USD is the only qualified currency in this delivery;
other currencies are rejected instead of combined. No accounting revenue is inferred.

`npm run business:sync-stripe -- --environment staging --mapping /private/customers.json --apply`
uses a provider-issued restricted read-only ADMIN_REPORTING_STRIPE_KEY, bound
ADMIN_REPORTING_FINANCE_ACCOUNT_ID, and0600 JSON array of
`{customerId,clientId,product}` (`product` velani|nevora). This adapter only sends GET
to Stripe's fixed origin, verifies the merchant and test/live mode, and publishes
minimal source facts as **provider verified**. Its API version matches NEVORA's
2026-10-28.endive. Pages are bounded; unsupported monthly terms/unmapped customers
make coverage partial. Payments/refunds cover the last90days by provider record
creation date; MRR and invoice balances are current, not historical snapshots.
Live reads require production plus ADMIN_REPORTING_LIVE_READS_APPROVED=true;
this implementation did not enable them or perform any live provider call.

Health input items contain only workplace/client IDs, source revision/incarnation,
HTTPS origin, lifecycle stage/stageSince, setupComplete, firstUsedAt, workerState,
workerObservedAt, trialEndsAt and restrictionReason. Optional source-recorded
trialStartedAt, paidStartedAt and canceledAt support retained cohort comparisons.
Use `healthSchema` as the executable strict contract; extra fields are rejected.
Only a source-owned aggregate publisher may establish those company facts. This
commit supplies the bounded private publication path; it does not provision a
customer database connector or invent adoption observations. No employee/headcount,
payroll, APP/WORKER URLs, credentials, contact lists or message bodies belong here.
Publication checks the client's linked source revision/incarnation. Each read
rechecks current control identity and origin; stale/mismatched facts become unknown.
Worker evidence expires after15minutes even when its feed remains valid.

## KPI dictionary and coverage

Money names its account, environment, observation time, history dates and USD units.
NEVORA MRR sums current active monthly subscription contracts; excludes trials and
past-due. It is not collected cash or access proof. Receivables are remaining open
invoice balances including tax, excluding draft/void/uncollectible invoices.
Captured successful charges less successful refunds are payment totals, grouped by
provider record creation date, including tax; they are not bank payouts or revenue.
Velani and NEVORA have separate drill-downs. Missing finance never means zero.

Inquiries are grouped by original receipt in selected/equal preceding UTC periods.
Qualified includes qualified/quoted/won, using the current recorded stage. First
reply compliance compares the actual response against the approved calendar.
Daily/channel totals reconcile to retained logged inquiries, not every mailbox.
NEVORA activation uses observed first use; median activation hours use registration
to first use. Trial conversion uses source-dated trials and eventual observed paid
start in that retained cohort. Current paid is a snapshot. Recorded cancellations
are events, not a certified churn rate. Lifetime retention remains unknown: no
separate historical store or retention extension was approved/created.

Costs are recorded bills/calculations and support minutes, attributed by product and
optional project. Headroom is monthly recorded budgets minus selected-period costs,
not a provider spending limit. Net payments less costs stays unknown until finance
is qualified and all three cost centers (Velani/NEVORA/shared) are reviewed for the
selected single month. Shared costs are not silently allocated between businesses.
This is cash contribution, not profit. Source gaps and bounded populations remain
visible in every affected view. Browser fixtures and owned database proofs do not
establish hosted acceptance, a real merchant sync or production activation.
