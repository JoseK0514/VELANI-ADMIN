# Finite worker heartbeat and closed production preparation

Development remains Jose's canonical working and acceptance line. Codex owns
backend/hosting and Claude owns UI. The production web project remains paused,
with app and writes disabled. No main replacement, live enrollment, customer
write or paid activation follows from this change.

## Worker-only finite authorization

The optional independent heartbeat now requires an explicit start, expiry and
approval UUID beside its existing dedicated Healthchecks ping URL. All fields
belong only in the matching worker's approved store. The adapter validates
canonical timestamps, a positive interval of at most31days and the UUID. It
checks authority before each network attempt and retry. Missing/malformed
authority with a configured URL refuses network delivery; absent URL preserves
ordinary maintenance without external monitoring. Expiry stops heartbeat
requests without stopping retention work.

This is an application sender boundary. An expired sender does not by itself
retire a recurring receiver's missing-run expectation. The actual receiver must
therefore use an independently verified explicit-year finite OnCalendar
schedule whose final expectation plus grace precedes expiry. Reports and ongoing
reminders must be off. An asynchronous provider can dispatch an event queued
before cutoff afterward; event/request timing and inbox delivery timing are
different evidence. See [the monitoring contract](../admin-maintenance-monitoring.md).

Meaningful RED: three new cases failed against the earlier implementation.
GREEN: targeted heartbeat/trigger suite14/14. Fresh owned-loopback PostgreSQL
qualification161/161, zero pending/skipped/failed; typecheck, lint and build
passed without external credentials. Independent review approved disabled
source delivery with no blockers. Hosted receiver configuration and actual
failure/recovery/missed-run acceptance remain unperformed.

## Exact hosted preparation, before this worker change

The prior qualified development source was
`b18e8c1db4573b64dd1727f72a77b87e99ce1676`. A production-target build of that
exact source reached READY as `dpl_CUvrtbhnY17Q5sBygvN3qnVUXfvG`. App/writes
stayedfalse; custom alias stayed on the earlier deployment; the provider project
pause was restored after44seconds. The initial blocked build and rejected
redeploy attempt are retained in the evidence. READY staging of code does not
constitute production activation.

Production native `adminretention` version1 is installed from qualified,
runtime-equivalentc528949, with only the restricted maintenance and independent
journal writer in its matching function store. Injected privileged defaults are
inert. Its minute17 hourly trigger is disabled with no next run. Actual anonymous
and forged-platform-header requests both returned401. No heartbeat URL is
installed; this older bundle does not implement the new finite grant. Rebuild
from the newly qualified source before installing grant fields.

Independent live role metadata matched b18 source: four runtime roles have no
elevated flags/membership, database create/temp or schema create; exact table and
column grants, SELECT-only authority state, append-only journal boundaries and
no PUBLIC private-object grants were verified. Both production bindings and
recovery epochs matched, journal recovery_pending=false, five admin/two journal
migrations present. This did not read customer rows or prove each external
source-reader connection. The authorization/restore code review approved its
bounded procedure; hosted restore and arbitrary privileged SQL protection remain
outside that claim.

## Approved test scope and remaining operations

Jose approved at most12 operational test-alert emails to support@thevelani.com
over48hours, conservatively ending November15,2026 at20:21:28UTC, approval UUID
`4108495f-8577-4915-9be2-694fb452256c`. The envelope is shared with Rondo; reserve
before each effect, count ambiguous results and do not reuse closed allowances.
The planned eight admin emails are two outage/recovery pairs per environment.
They are not an actual delivery receipt or enforced provider-wide global cap.

Before arming: independently qualify exact candidate and development artifacts,
rebuild the matching worker, verify each finite receiver/calendar and destination,
install the dedicated URL/grant only in its worker store, then execute bounded
failure/recovery and missed-run checks. Preserve ordinary retention and all
audit/journal history. Record automatic native invocation separately from test
receiver probes. No test-owned synthetic control may become a production auth
bypass.

Jose's production Google proof and two independent passkeys remain personal
steps. Commercial hosting, regular alert operating authority, remaining hosted
permissions/restore evidence and explicit activation approval remain open. Tax
and real charges remain off. Production pause and disabled writes persist.

Evidence root:
`/Users/josek0514/.codex/visualizations/2026/11/13/01a1d5d4-5741-7e93-ab62-b7705c0e403b/release-completion-next/`.
Independent review:
`/Users/josek0514/.codex/visualizations/2026/11/13/01a1d5d4-5741-7e93-ab62-b7705c0e403b/.omo/evidence/admin-finite-heartbeat-code-review.md`.
