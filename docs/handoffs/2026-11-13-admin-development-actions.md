# Private admin development and Actions continuation

Jose requested completion and development integration of SCRUM-174/155/186 on
November 13, 2026. This packet owns SCRUM-186 only. NEVORA's existing finisher
retains Stripe and its finite hosted acceptance window; Rondo is a separate
website repository. No Desktop Commander or Git Diff Patcher is used.

## Source and scope

Start from accepted local development
`b52a9b2fcc27085f17e3e9d5c7ed09b627716d69`, preserving its history and existing
UI/backend. The isolated worktree is
`/Users/josek0514/.codex/worktrees/velani-admin-development-ci-20261113`.
The original checkout and Claude's UI worktree are preserved. The original
repository had no remote; establish private `JoseK0514/VELANI-ADMIN` under the
already authenticated account, with development as the default branch.
Do not connect GitHub to an automatic hosting deployment as a side effect.

This change adds CI and evidence controls only. It does not change the admin
application, migrations, Google enrollment, passkeys, hosted flags or worker.
The production configuration and rollback are already executable in
[the accepted rollout packet](2026-11-12-admin-staging-acceptance-and-production-rollout.md).

## Qualification

The workflow builds with Node 24.19.0, no app credentials, no lifecycle install
scripts and no migration step. Its existing owned-test runner starts and stops
a disposable loopback PostgreSQL cluster. PostgreSQL binaries are explicitly
selected from the runner; production credentials are never installed in Actions.
The real Next transport check runs the compiled application closed.

All 20 existing test files must execute exactly once with no skipped, pending,
todo or failed assertions. The verifier compares assertion totals, requires
clean tracked source, hashes every tracked file before and after the checks,
and records exact SHA/tree/run/attempt/ref/event plus the raw report digest.
Twelve evidence-control tests exercise incomplete/duplicate/foreign results,
skips concealed by green totals, changed source, stale SHA and empty inventories.
The workflow actions are pinned to full official upstream commit SHAs.
Artifacts retain raw logs/report/source hashes for 14 days. Candidate-tag and
actual development runs are distinct evidence; neither is hosted acceptance.

Local fresh checks: 157/157 actual owned tests, zero failed/skipped/todo;
all 12 evidence-control tests; build, types and lint passed. Complete existing
Git history was scanned before private upload: three generic-key findings were
reviewed as one guest request UUID and two document SHA-256 hashes. No credential
finding was accepted or source history rewritten. Generated build credentials
remain in ignored local build files and are not uploaded as source/artifacts.
Final source/run identities and independent review are recorded in the adjacent
delivery receipt after execution, not inferred from this preparation.

Initial remote bootstrap: the candidate tag made before the workflow existed
on the default branch registered no run. Installing the already locally qualified
CI-only increment on the new development default enabled actual development
run 43436240871 and candidate run 43436242871. Both preserved reports showing
157 passed assertions but a nonzero test-process exit. They are failed runs,
not qualification. The next candidate retains both default and JSON reporter
output to diagnose that Linux-only exit without weakening any assertion.

## Directors, controls and remaining gates

Engineering: preserve the accepted source and add reproducible isolated CI.
Security: private history, read-only workflow token, no hosted secrets, no
automatic deployment or authentication bypass. Delivery: separately verify
candidate and actual development Actions. Governance: development is Jose's
primary operating/acceptance release at production standards; real main and
production still require explicit approval. No independent audit is self-closed.

Production remains a separate, closed gate: commercial hosting and aggregate
budget headroom, an owner-controlled independent alert receiver with genuine
approved delivery receipts, exact closed web/worker deployment, and Jose's real
Google plus two-factor enrollment at `admin.thevelani.com`. Staging passkeys
cannot be copied into production. The existing monitoring adapter/runbook is
prepared; no external Healthchecks account or delivered alerts are claimed.

Rollback for this source increment: keep the hosted accepted runtime and
configuration unchanged; do not promote a failed candidate. Git history and
the accepted b52a9b2 source remain recoverable. No database rollback is needed.
Codex owns backend/hosting; Claude owns any further UI change. SCRUM-186 remains
open until its actual environment-specific activation criteria are satisfied.
