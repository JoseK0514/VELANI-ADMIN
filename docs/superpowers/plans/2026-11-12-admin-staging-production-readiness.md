# Admin staging acceptance and production preparation

Authorized by Jose on November 12, 2026: finish remaining admin staging tests and prepare production; report when Codex's side is done. Production activation, subscription checkout and production credential enrollment remain separate final actions.

Spec: `docs/api-v1.md`; operational authority: `docs/operations.md`, superseded environment facts in `docs/handoffs/2026-11-12-admin-activation-inventory.json`, and the November 12 activation/passkey handoffs.

## Global constraints

Use this clean isolated activation worktree; preserve Claude's UI checkout. No main merge/shared push, production activation, customer-data test, real email, subscription or metered AI call. Secrets stay in approved stores; no browser-cookie extraction or test-auth bypass. Hosted tests use only the three synthetic staging source databases and staging admin/journal. Respect shared rate limits. Native credential-save/biometric confirmations stay with Jose. Production worker/configuration can be prepared closed; no production schedule or collection is activated.

Ruling: This is acceptance and deployment preparation of an existing reviewed implementation, not new feature construction. Run existing meaningful suites and real hosted scenarios; RED/GREEN applies to any defect discovered, not to documentation or unchanged runtime. Cost if wrong: any newly changed runtime must be identified and independently qualified before deployment.

### Task 1: Reconfirm candidate and isolated qualification

Interfaces: current clean commit, fixed v1 contract, approved stores and restricted source bindings. Re-run owned PostgreSQL tests, types, lint and build; review the actual scripts first. Re-run existing real Next navigation acceptance if runtime changes or qualification freshness requires it.

Expected: all named checks green, no external test database credentials, unchanged API boundary; record exact source and commands/output. Any failure is recorded and fixed with a reproducing regression before proceeding.

### Task 2: Complete hosted staging acceptance

Interfaces: same source plus staging-only write flag, existing real owner/passkeys and synthetic records; Task 1 produces candidate identity consumed here. Open staging writes for the bounded acceptance, preserving auth roots and all production flags.

Exercise rendered UI: list/detail/search, create/edit client and project, notes/contact/case as exposed, persisted readback, duplicate/lost-response protections where observable, two-tab stale conflict, relationship transitions with real step-up, source unavailable/unknown handling, both passkey providers where possible, sign-out and guest denial. Do not manufacture missing browser evidence with SQL-only claims. Verify persistence/audit/receipts with explicit staging queries. Source-fault simulation must be reversible and confined to synthetic feeds. Close staging writes and restore fault injection afterward.

Expected: scenario ledger with observed outcomes and database proof; successful guest/session/logout and real factor verification. Any unavailable external user action remains explicitly pending rather than marked passed.

### Task 3: Prepare the production release packet

Interfaces: qualified candidate and staging evidence from Tasks 1/2; existing production stores/role bindings, OAuth/DNS and paused Vercel project. Reconcile provider state, commercial hosting/headroom, worker deployment package, alert routing/spend controls and exact flags without activating production or purchasing services.

Write an executable rollout/rollback checklist with exact environment identities, compatible migrations, source authority, retention/backup promises, owner production registration, worker schedule and health/alert acceptance. Separate prepared settings from verified activation and identify each remaining action's owner. Obtain one fresh-context review of the whole change/evidence packet as required by executing-plans; address material findings with evidence.

Expected: reviewed packet, final source/branch/commit state and clearly named launch gates; production paused and collection disabled; no unsupported completion claim.
