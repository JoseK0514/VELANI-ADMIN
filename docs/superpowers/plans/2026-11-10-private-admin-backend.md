# Private Admin Backend Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task. Native execution selected from Jose's instruction that Codex implement the backend; one fresh whole-branch review at the end. No per-task implementer delegation.

**Goal:** Deliver the approved one-owner NEVORA/Velani admin backend and a tested fixed contract for Claude's UI.

**Architecture:** A separate Next.js API application, PostgreSQL operations database and narrowly scoped source readers. OIDC plus WebAuthn, revocable sessions, server-side authorization, transactional business commands/audit, bounded read models and independent retention. No product UI or customer-state/payment controls.

**Tech Stack:** Node24, TypeScript, Next16, PostgreSQL/pg, openid-client6, SimpleWebAuthn14, Zod and Vitest. Exact versions pinned in lockfile after registry verification.

**Spec:** ../specs/README.md and ../specs/api-contract-draft.md (Jose approved implementation November10,2026).

## Global Constraints

- One private admin, separate product sections; Jose only; Claude owns all UI.
- Same-origin private API, 30min idle/8h absolute session, fresh5min factor for sensitive internal commands.
- New roots start prospect/version0; child commands use parent version; idempotency+audit commit atomically.
- Original prospect/request expiry never resets; engaged closure12calendar months; retention/purge and holds are independent of NEVORA workplace policy.
- No production credentials in tests, plaintext secrets/logs, customer impersonation, billing writes or destructive public API.
- Source mode/environment/identity are pinned. Missing live billing/setup/health is unavailable, not zero/healthy.
- Local qualification precedes deployment; owner identity, private enrollment and scoped hosted grants remain actual activation requirements.

## Review Focus

1. Guest/customer/preauth/revoked identity cannot read or mutate admin records (Task2/5).
2. Source outage, source incarnation change or stale billing cannot close a live client or manufacture metrics (Task3/4).
3. Lost response/concurrent command/changed replay creates exactly one mutation and audit, with no PII receipt leak (Task4).
4. Closure/edit/reopen/source-link changes cannot silently extend source/prospect retention or resurrect erased data (Task4/5).
5. Malformed cursor/search/body/origin/provider proof cannot broaden scope, leak credentials or exhaust unbounded work (Task2/3/5).

## Tasks

### Task 1: Configuration, owned database and least-privilege foundation
**Files:** package/TS/Vitest/Next configuration; scripts/test-owned.mjs; test/helpers/db.ts; src/server/{config,db,errors}.ts; db/migrations/0001_admin.sql; test/foundation.test.ts.
**Interfaces:** readConfig(env):AdminConfig|null; migrate(pool):Promise<void>; transaction(pool,work); AdminError(status,code,fields?). All later tasks consume the pinned database/config types.
- [ ] Write failing configuration/schema/privilege behavior tests; run npm test -- test/foundation.test.ts and inspect RED.
- [ ] Implement safe configuration, explicit migration runner and schema with constrained business/auth/audit/retention storage; no build migrations.
- [ ] Run foundation tests/tsc, inspect GREEN, commit.

### Task 2: Google identity, passkeys and revocable sessions
**Files:** src/server/auth/{oidc,service,passkeys,cookies}.ts; scripts/operator.ts; test/auth.test.ts and test/auth-protocol.test.ts.
**Interfaces:** AuthService.start/callback/options/verify/enroll/stepUp/authenticate/logout; Actor includes server-derived ID, generation, factorAt and csrf. Bootstrap/recovery is private operator-only; no test bypass in runtime.
- [ ] Write RED cases for unsupported identity, preauth, expiry, challenge replay, origin/RP/UV, disabled generation and session logout.
- [ ] Implement maintained-library OIDC/PKCE/nonce and actual passkey verification; atomic challenge consumption and counters; session rotation and revocation.
- [ ] Verify real signed local OIDC/authenticator fixtures and negative controls, full task suite/tsc; commit.

### Task 3: Safe source projections and bounded read models
**Files:** db/source-views/{control,catalog,velani}.sql; src/server/sources/{types,postgres}.ts; src/server/reads.ts; src/server/cursor.ts; test/sources.test.ts.
**Interfaces:** Sources reads registration/workplace/catalog/request metadata and source-authorized details, guarded by pinned reader/environment; ReadService produces v1 list/detail/overview/search wrappers.
- [ ] Write RED isolation, excluded-secret, fixture, unknown/partial/coverage and cursor/search tests against owned source DB fixtures.
- [ ] Implement whitelisted views/readers and bounded pagination/metrics with no encrypted-secret read or customer HTTP session reuse.
- [ ] Verify effective grants, wrong DB/role/environment denial and one-source/all-source outage; full suite/tsc; commit.

### Task 4: Transactional clients, projects, cases, contacts, links and notes
**Files:** src/server/commands/{validation,execute,clients,projects,cases}.ts; test/commands.test.ts.
**Interfaces:** executeCommand(actor,kind,target,envelope):Receipt; all revisions are decimal strings, actor/command UUID receipts contain no PII.
- [ ] Write RED business scenarios, replay/concurrency/stale/cross-parent/provenance/expiry/close-reopen tests.
- [ ] Implement client-first locking and atomic receipt/audit/mutation. Apply exact engagement/closure/source-expiry rules; enforce recent-factor checks on sensitive actions.
- [ ] Run full suite with duplicate/lost response/race/rollback cases and typecheck; commit.

### Task 5: HTTP transport, retention, operator readiness and Next adapter
**Files:** src/server/{http,runtime,retention}.ts; src/app/api/admin/v1/[...path]/route.ts; health/ready routes; scripts/migrate.ts/operator.ts; test/http.test.ts/retention.test.ts.
**Interfaces:** handleRequest(Request):Promise<Response>; private maintenance handler separate from business routes; ready reports configured/schema/source identity without customer data.
- [ ] Write RED HTTP auth/CSRF/body/rate/error/deadline and retained/deleted/restore-barrier cases.
- [ ] Implement same-origin routes, rate controls, audit-before-private-disclosure, bounded retention with external deletion journal replay barrier, and explicit operator commands.
- [ ] Verify HTTP fixture against actual Next server, auth routes with real cryptographic fixtures, full suite/typecheck/build/lint/audit; commit.

### Task 6: Qualification, hosted preparation and Claude handoff
**Files:** docs/api-v1.md, docs/operations.md, docs/handoffs/2026-11-10-codex-to-claude-admin.md; evidence/qualification; deployment config and example env names only.
**Interfaces:** fixed contract, safe actual sample responses, source-view install/rollback checklist, exact source/receipt and environment activation flags.
- [ ] Re-read approved spec, complete coverage matrix; qualify own synthetic dataset end-to-end with private responses redacted.
- [ ] Prepare/deploy isolated closed backend as authorization/provider capability permits; never substitute a local pass for hosted identity verification. Complete all independent preparation while owner/provider actions are pending.
- [ ] Fresh whole-branch reviewer; one TDD fix pass for important findings and full rerun. Commit final source/docs and report concrete status/gates. Claude owns UI and actual personal enrollment/browser acceptance remains explicit.
