# Private admin: proposed delivery plan and acceptance gates

November 10, 2026. Investigation-stage sequencing for the [design](README.md). **Not an instruction to implement now.** A detailed task-by-task execution plan should be written from the approved design, with exact repository paths and test commands verified at that time. No new repository/project/package or application code was created here.

## Ownership and source custody

Codex: admin backend, auth/permissions, data model, source projections, integration/retention/operational tests and backend runbooks. Claude: unified admin UI and connected desktop/mobile/keyboard/error-state implementation against the approved API. Jose: personal identity/factor enrollment, business/retention decisions, infrastructure allocation and production authorization. Independent reviewers: design challenge and later security/QA/release evidence; a planner does not certify their future work.

Proposed application/repository name `VELANI-ADMIN`, proposed host `admin.thevelani.com`. Neither exists as a result of this investigation. At implementation, first confirm no parallel owner already created it. Start from current development for source adapters, preserve held Claude source and all occupied worktrees, use detached worktrees as NEVORA requires, and rerun the source inventory. Do not merge the whole new admin app into customer NEVORA or the Shopify theme. Shared source changes need their own exact-source release checks; earlier3922/6091 results do not certify new code.

## Proposed file responsibilities

In the new admin repository (future files):

| Area | Suggested files/responsibility |
|---|---|
| Auth | `src/server/auth/{oidc,passkeys,session,authorize,recovery}.ts`; `src/app/api/admin/v1/session/route.ts` |
| Database | `db/migrations/0001_admin_core.sql`, `src/server/db.ts`, `scripts/migrate.ts`; explicit environment/identity and separate setup/runtime roles |
| Audit/commands | `src/server/audit.ts`, `src/server/commands/{execute,idempotency}.ts`; expected versions, transactional receipts and append-only runtime audit |
| Business domains | `src/server/{clients,projects,cases}/` with contracts, repository/service and tests colocated per domain |
| Source readers | `src/server/sources/{control,catalog,velani}.ts`; safe allowlists, timeouts, freshness and source identity |
| Read model | `src/server/overview.ts`, `src/server/search.ts`, `src/contracts/admin-v1.ts`; bounded lists, distinct metrics and partial failures |
| Routes | `src/app/api/admin/v1/` route handlers only; no SQL or policy inside UI components |
| Retention | `src/server/retention.ts`, private scheduled handler and explicit restore/deletion replay procedure |
| Tests/docs | `test/{unit,integration,security,acceptance}/`, OpenAPI/schema, seeded synthetic fixture setup, deployment/rollback runbook |

Existing source-owned adapter work (future changes, not applied): NEVORA additive operator-only control projection SQL alongside `db/control-migrations`, commerce projection migration beside `services/commerce/migrations`, and Velani additive view/grant migration beside `services/velani-ai/migrations`. Do not modify old migration bytes. Pin safe view ownership/grants and source schema versions. No new customer-company bootstrap migration is necessary for the v1 metadata-only dashboard.

## Phase 0 — approve the design and settle activation inputs

Deliverable: reviewed scope, stable v1 contract and source/environment inventory.

- Confirm the dedicated unified app recommendation and v1 safe-workflow boundary; preserve both sections/Jose-only decisions.
- Verify Jose's individually controlled admin identity, primary/backup-factor and recovery procedure. Do not put credential values in the plan.
- Approve the new admin retention schedule/purpose and consent/privacy update; keep existing request/chat/workplace policies unchanged.
- Allocate hosting/admin spending inside the existing $100 aggregate ceiling; verify actual account headroom and commercial hosting eligibility. Do not start a second overlapping Pro subscription if another release upgrades the same team.
- Inventory known real clients and legacy workplaces without scanning/assuming every Neon project is a client. Decide which records are internal fixtures. Record coverage gaps.
- Freeze the business API/schema and sample response set after review; Claude can then design against an agreed contract. No production connection is needed for UI mocks/synthetic fixtures.

Gate: reviewable design approved, not merely a dashboard idea. Unknown exact production identity/DNS/provider permissions are activation gates, not guesses to bake into code.

## Phase 1 — protected admin foundation and own database

Deliverable: synthetic staging environment with no unauthorized business access.

1. Choose current supported dependency versions and maintained OIDC/WebAuthn integration; use existing stack conventions. Inspect build/migration scripts so build/start never applies migrations implicitly.
2. Add schema for singleton enrolled admin, credentials/sessions, clients/contacts, projects, cases, source links, notes, command receipts, safe audit and retention tombstones. Exact constraints include unique external link `(system,environment,source_id)` and unique case source.
3. Establish migrations/backup/provenance in the isolated environment; runtime cannot CREATE schema/roles, read source secrets or UPDATE/DELETE audit. Separate administrative setup and retention principals.
4. Implement verified login plus passkey, server-side sessions/revocation, CSRF/Origin/headers/rate limits and current authorization on every handler. Owner enrollment is a private procedure; no first-user route.

Required failing-then-passing cases: unauthorized Google subject, forged audience/nonce, replayed/expired passkey challenge, wrong RP/origin, missing user verification, preauth business request, ordinary NEVORA Owner session, disabled admin, revoked/stolen prior session, cross-origin POST and identity recovery invalidating all sessions. Browser sign-in must show no business data until both factors succeed.

## Phase 2 — source projections and read-only management view

Deliverable: correct cross-product visibility using synthetic source databases; production readers remain unactivated.

1. Create additive field-limited source views and separate readers. Verify effective privileges against ciphertext, private provisioning, signup/billing tokens, email frozen payloads and Rondo conversations. Avoid `SELECT *` and JSON passthrough.
2. Bind exact project/branch/database/environment metadata at startup; use small pooled clients with3s statement/connect bounds and restricted search paths. Never accept a host/DSN/schema from a browser.
3. Implement source adapters and partial-result aggregation. Respect missing enrollment names, pending registrations without decryptable identity, stale billing contacts, internal fixtures and legacy coverage gaps.
4. Implement metric definitions, stable cursor pages, private search bodies and safe detail access audit. Use pure existing billing policy only where imports/versioning are intentional and tested; do not copy undocumented prices or fake Owner proofs.

Acceptance: swapping a tenant ID never escapes allowed source scope; all source schemas match the pinned contract; one source outage yields partial/unknown and total outage503; missing live Stripe never shows zero revenue; duplicate requests are not duplicate clients; a production fixture is excluded; equal/renamed emails do not merge companies; aborted signup can remain an anonymous ID; ACTIVE company does not imply paid/setup-complete/healthy. Simulate all failures locally, not by breaking production services.

## Phase 3 — internal client/project/request workflow

Deliverable: usable safe business management, independent of customer runtime or financial changes.

1. Implement business commands in the new operations DB with operation IDs, expected-version locks, constraints and atomic audit/receipts.
2. Support manual verified contacts, prospect/active/inactive relationships, the five project stages, five case stages, notes and reviewed source links. Source names/emails remain labeled by their actual provenance.
3. Match accepted request to a case without copying its message; preserve source expiry. Explicit minimal contact promotion to an engaged client uses the approved retention purpose, not a blanket exception to source deletion.
4. Complete a synthetic café scenario: enquiry→case→verified client→website project; manually link its separate NEVORA workspace; update project and resolve case; no source billing/access setting changes.

Acceptance: concurrent identical commands produce one record/audit mutation; changed replay409; stale expectedVersion409 with input preserved by UI; two clients cannot claim one workplace; unrelated project/client case link fails; source incarnation mismatch fails; full transaction rollback includes audit/receipt; retry after lost response replays rather than duplicates. A future expired/unauthorized replay cannot leak old PII. Contact correction cannot target another client; changed email loses prior verification unless explicitly reviewed; provenance must match actual source data; reopening terminal work requires its reason code. No action sends a client email.

## Phase 4 — retention, observability and Claude integration

Deliverable: a complete internal admin candidate, using exclusively synthetic data until production pilot approval.

1. Implement the approved admin retention job with a narrow credential, deletion of dependent notes/search data, source-expiry enforcement on reads, no private content in logs and restore deletion/tombstone replay. Test a restored preview branch with explicit `finalize:false`; no original compute/default switch.
2. Record aggregate job success/last-run evidence and source failures. Source API200, cron registration and migrated monitor tables must not generate a green worker-health claim.
3. Give Claude the frozen schemas and actual synthetic responses for ready/empty/partial/unavailable/expired/conflict/reauth states. Claude implements one login and separate navigation with shared client context.
4. Run browser acceptance at desktop and mobile sizes, keyboard/focus, table navigation, saved/pending/error states, logout, session expiry and browser back/cache behavior. Verify no page/API body/contact appears in public HTML, caches, analytics, logs or network calls to marketing scripts.

Required privacy cases: expired request body disappears even during cleanup outage; minimal engaged-client record does not retain original description; audit includes IDs not copied payload; source privacy purge cannot be undone by restoring the admin DB; current delete/tombstone rules are reapplied before traffic; disabled admin cannot bypass via a saved client URL. Rondo lead inbox stays off if automatic lead deletion remains unqualified.

Retention transition cases must also prove: prospect edits/reopening do not extend original expiry; explicit engagement promotes only minimal business data; inactive creates one fixed closure deadline; active projects/known live NEVORA access or unknown linked evidence block closure; reactivation requires confirmed new work and recent factor; source cases keep their original88–90-day bounds; reviewed holds affect only their named business records; a purged record cannot be resurrected by a state change. Test client-close versus project-reopen concurrency under a consistent parent-first lock order.

## Phase 5 — production pilot, then internal workflow activation

Deliverable: Jose can use the accepted admin, with a dated exact-source release record.

1. Obtain independent source/security review and QA evidence on the exact admin + source-adapter candidates. Run required CI, build, types and dependency checks; no relaxed assertions/snapshots or transplanted test claims.
2. Verify actual production account/plan eligibility, budget headroom, source reader identity/grants, isolated Preview, backup/restore record, private domain/DNS/TLS and owner factors. Create/save credentials only in approved stores through the required user/provider confirmation flow at that later time.
3. Deploy with business writes disabled, use actual app authentication, deny public/customer contexts and verify actual source routing. Use the existing owned internal fixture for acceptance, clearly labeled and excluded from real metrics.
4. Prove actual one-owner visibility/freshness/partial states and audit without altering customer records. Then explicitly activate only admin-internal writes after its acceptance gate. Production tests must be synthetic and approved; no real messages/payments or customer-data tests are implied.
5. Record deployed SHA/source mappings, permissions, source coverage, retention schedule/actual tick, logout/recovery, cost observation and open conditions. Keep public signup and Shopify release gates separate.

Rollback: close admin ingress/writes, revoke admin sessions and source readers if needed, preserve source/customer service and operation/audit journals, and return the admin alias to the last schema-compatible release. Do not drop source tables, destroy customer databases, reset public DNS or restore a source database as an admin rollback. Additive source views can remain inaccessible while investigated.

## Later phase — richer operational information and controlled actions

Each item requires a separate bounded contract and evidence; none is smuggled into v1:

- Company-owned aggregate summaries for actual setup completion/headcount/current profile/heartbeat, with isolated one-purpose publishing credentials, current incarnation/revision, replay controls, expiry and durable delivery. No admin fan-out across company APP secrets.
- Verified Stripe live subscription/invoice/reconciliation adapter and agreed financial definitions; use official analytics for full MRR/cohort accounting until needed. No extra unqualified Stripe write surface.
- Verified Resend event ingestion to distinguish sent/delivered/bounced/complained, with exact job correlation and no body/token storage. UNKNOWN past the dedup window stays manual reconciliation.
- Rondo lead inbox after source-retention qualification; optional explicit legacy client import and erasure workflow.
- Assisted quote/eligibility/provisioning workflow above30, preserving approved trial start and contacts; no bypass of current self-service restrictions.
- Any email resend, lifecycle change, refund, subscription change, restore, deletion or support impersonation only after individual impact/authorization/idempotency/rollback designs. Destructive/financial operations remain deliberate and separately authorized.

## Estimates and success definition

This is a cross-system backend feature, not a single dashboard page. Suggested reviewable delivery units: foundation; source visibility; business workflow; retention/observability; production qualification. Avoid a calendar promise until identity setup, source grants, retention approval, hosting plan and Claude's UI schedule are known. Work estimates should be revised from the approved task plan, not from successful local signup tests.

First release succeeds when Jose can securely find a known company, distinguish its NEVORA activation/trial state from its Velani projects, triage a request with the correct reference/email state, track work without duplicating source content, and see exactly which information is missing or stale. It fails if it leaks customer secrets, makes unsupported payment/health claims, changes customer state through a vague button, or becomes a second ungoverned copy of private request data.
