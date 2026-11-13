# Private admin retention monitoring

Prepared November 12, 2026. This is a disabled-by-default backend integration and activation contract. No Healthchecks.io account, check, email route or live ping has been created by this work. It is not proof of delivered alerts. Keep real business saves closed until the operating environment has a configured, delivery-tested check. Calling development the primary release does not remove this gate.

## Runtime and permission boundary

The existing Neon `adminretention` function calls the dedicated Healthchecks.io Pinging API after an authenticated scheduled invocation. A completed, fully drained cleanup sends success; a failed or ten-batch-saturated cleanup sends failure. Rejected caller/path/method/trigger requests send nothing. The health input is committed cleanup completion, not merely a web HTTP response. Missing function execution produces no heartbeat, which the independent Healthchecks.io service detects without accessing Neon or Vercel.

Only the function's approved per-environment secret store receives `ADMIN_MAINTENANCE_HEARTBEAT_URL`. It is optional; absent or empty means no network activity. A configured URL also requires all three worker-only grant fields: `ADMIN_MAINTENANCE_HEARTBEAT_FROM`, `ADMIN_MAINTENANCE_HEARTBEAT_UNTIL` and `ADMIN_MAINTENANCE_HEARTBEAT_APPROVAL_ID`. Times must be canonical UTC ISO timestamps with milliseconds; the positive interval is at most31days, with the actual approved UUID reference. Missing/malformed authority sends nothing. Before start and at/after expiry, reporting stops while cleanup continues; reload/retry cannot renew the interval. Never invent an end date or extend it beyond Jose's actual approval.

URL format is exactly `https://hc-ping.com/<lowercase UUID>`, without credentials, port, query, fragment or path suffix. This is a secret granting ping authority for one check, not a project management credential. Never place it in the web app, repository, screenshots, logs or a public status badge. Do not provide a Healthchecks management API key or any database/read/workforce access. Keep separate checks and URLs for staging and production.

Success is an empty POST to that URL; failure is an empty POST to its `/fail` suffix. The transport rejects redirects, omits credentials and sends no counts, records, error messages or identifiers. The receiver necessarily sees the worker's network address and ping timing. The callback uses Neon `waitUntil` and never changes or delays the cleanup response. An unavailable receiver does not undo a committed cleanup or cause a deletion to be repeated merely for telemetry.

There are at most two attempts, each with a two-second abort deadline and one 250ms backoff. Network errors, 408, 425, 429 and 5xx may retry once; other failures stop. Private logs contain only `admin_maintenance_heartbeat_failed`, never the URL or response/error details. A 2xx transport response alone is not delivery acceptance: Healthchecks may return 200 for ignored/not-found checks. Actual check state and inbox receipt must be verified during activation. Duplicate pings from bounded retries or Neon redelivery are harmless state updates; use one check's down/up transitions for incident deduplication. Do not configure per-ping notification rules.

## Owner-controlled receiver setup — still pending

1. Jose selects/authorizes the monitoring account and alert inbox. Check the applicable account terms and existing aggregate infrastructure headroom before any paid activation. Do not create an account, accept new terms or send test mail implicitly. Use an owner-controlled account with its own MFA/recovery; avoid making the application its login authority.
2. Create a dedicated check named `velani-admin-staging-retention` for the current acceptance environment. For later production, create a separate `velani-admin-production-retention` check. Use a finite, explicit-year **OnCalendar** schedule matching the hourly worker, with **Grace Time 3600 seconds**. An hourly expected ping plus one-hour grace gives the existing approximately two-hour missing-completion threshold; an explicit `/fail` marks failure immediately. This concrete threshold replaces the earlier unimplemented warn2h/critical3h proposal. For a finite approval, do not arm the old unbounded Simple schedule: sender expiry alone would create a late missing-run alert. Require the last expected ping plus grace to finish strictly before the approved end, with delivery margin; independently verify no later or annual expected date. Keep reports and repeating reminders off.
3. Require POST-only pings. Configure paused checks to ignore pings until explicitly resumed. Connect the approved inbox, turn on down/recovery notifications, and disable repeating reminders initially. Use only service/environment/time in check names/descriptions and notifications; no client, session or employee information. Verify the inbox/account integration privately; record its identity but never its secret.
4. Save that check's UUID ping URL and the three exact finite grant fields in the matching Neon function store. Preserve the restricted maintenance/journal roles, both overridden injected Postgres URLs, and all four target bindings. Use the newly qualified exact-source Node24 bundle; the older c528949 worker lacks the finite sender gate. No schema migration or public API change is needed. Resume the external check only after receiver boundary proof and correct worker readiness; do not leave an unrelated empty check armed.
5. After explicit approval for synthetic notifications to that inbox: observe one automatic hourly success in both the check dashboard and the database maintenance receipt. In a disposable monitoring check, verify `/fail` produces exactly one incident notification, repeated failure does not create a second incident, success produces recovery, and deliberate missing pings exceed period+grace and produce the down notification. Never stop real retention to test silence. A disposable check may be removed only with any required deletion approval.
6. Record check identity, environment, exact worker/source/version, period/grace, approved recipient, notification timestamps/message IDs and restoration to healthy state. Close/rollback real saves if delivery fails. No external monitoring delivery is qualified until this record exists.

For Jose's November13 twelve-email test approval, the conservative sender cutoff
is November15,2026 at20:21:28UTC. A receiver example ends its explicit2026 hourly
minute17 expectations on November15 at18:17UTC, with its final one-hour grace
deadline19:17UTC. The first expected time must follow actual setup readiness;
do not reuse already missed initial slots. This leaves over one hour before the
approved cutoff and no next-year recurrence. Actual accepted calendar syntax,
parser boundary assertions, last expected/deadline values and UI readback must be
retained before activation. No sender success/failure/retry may start after its
cutoff. This bounds event generation, not the receiver's internal queue: a
pre-cutoff event can be processed and first dispatched later by the provider,
in addition to SMTP delivery latency. Reserve/count that event before triggering
it; do not claim a strict provider-dispatch or inbox-arrival deadline. Close
temporary test receivers after their actual receipts and retain this limit.
Routine monitoring after this test envelope needs separate applicable authority
and renewed finite receiver/sender settings. Expired coverage is not healthy
operating acceptance; keep business saves closed until that gate is resolved.

## Offline qualification and rollback

`test/maintenance-heartbeat.test.ts` covers no configuration, exact destinations/empty payloads, rejected URLs, retry limits, nonretryable status, secret-safe errors and both hung-attempt deadlines using injected transports. `test/maintenance-trigger.test.ts` covers authenticated completion/failure/saturation, no anonymous ping and a failing/hung reporter leaving the cleanup response unchanged. These tests make no external calls. RED/GREEN logs and the full owned-suite results are in `docs/handoffs/admin-staging-acceptance-20261112/`.

Rollback: remove only `ADMIN_MAINTENANCE_HEARTBEAT_URL` from that worker's store and redeploy the same qualified bundle, or redeploy the preceding compatible worker bundle. Keep retention scheduled and preserve its journal. Explicitly pause the corresponding external check to avoid intentionally generating false missed-run alerts; do not silence a genuine failure just to pass readiness. If the ping URL is exposed, replace the check/credential through its supported owner workflow and update the worker store; never publish the replacement. No database restore, root rotation, permission expansion or production activation is required for this adapter.

Protocol references: [Pinging API](https://healthchecks.io/docs/http_api/), [check schedules and filtering](https://healthchecks.io/docs/configuring_checks/), [notification setup](https://healthchecks.io/docs/configuring_notifications/), [reliability guidance](https://healthchecks.io/docs/reliability_tips/). Provider behavior and account limits must be rechecked at activation.
