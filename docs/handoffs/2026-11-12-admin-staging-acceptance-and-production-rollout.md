# Admin staging acceptance and production rollout packet

November 12, 2026. Codex backend/hosting; Claude UI. Development is Jose's primary working/acceptance release for now; real main/production promotion remains a later approved action. See `2026-11-12-development-as-primary-release-policy.md` and AGENTS.md.

## Result and exact source

**Remaining hosted staging acceptance passed. Production preparation is recorded here; production is not launched.** No application/API/migration changes were made in this pass. Qualified source `986bf0d8ada0bad2aebafad020782b91348734f4` passed the fresh local checks; deployed source `9ec75c6c4c843a16eb9f35ffe3ed896d6304d032` differs only in AGENTS.md and the release-policy document. `git diff 986bf0d..9ec75c6 -- src scripts db package.json package-lock.json next.config.mjs` was empty.

Worktree `/Users/josek0514/.codex/worktrees/velani-admin-activation-20261112`, branch `codex/admin-activation-20261112`. Claude's UI worktree was preserved. The local `development` branch remains at its original investigation base; this isolated combined candidate is the tested source, not that older branch tip. No Git remote is configured, and no shared push or main merge occurred. Integrate the reviewed candidate into development explicitly before another agent starts from that older tip.

Staging Vercel project `prj_98nylk5UDAg2bEvrBydfjxlKIKJd`, team `team_Lzbw410WwXGWHTuUXuamRI1N`, origin `https://admin-staging.thevelani.com`. Write-enabled acceptance deployment `dpl_7xa4ptMGdtkxSq8BJ23X4NPaQMzi`; final **READY, saves-closed** deployment `dpl_53WDu4LT51VXQc96bD9Dd78F93Aw`. Both are from source9ec75c6. Vercel's slot name Production belongs to this separate staging project. Real production stayed paused.

## Checks actually run

Fresh source checks: `npm test` **150/150**,19 files, owned loopback PostgreSQL/no external database credentials; `npm run typecheck`, `npm run lint`, `npm run build` all exit0. Logs are retained in `admin-staging-acceptance-20261112/`. The prior local Next desktop/mobile4/4 fixture acceptance remains separate historical evidence and was not rerun or relabeled as hosted/mobile acceptance here.

Real Safari against staging, with real Google/passkey/session and only synthetic data:

| Scenario | Observed result and independent proof |
| --- | --- |
| Closed-write baseline | New client disabled and explicit Saving is turned off. Only the staging flag was opened for acceptance, then restored to its exact original false and Production/Preview targets. |
| Client validation/create | Blank name showed This is required. Valid fictional client double-click created exactly1 row/1 command receipt; UI displayed saved detail/version1 and original90-day expiry. |
| Project/note/contact | Project double-click created1 project/1 receipt. Note persisted visibly; project stageCompleted persisted. Asserted fictional contact saved and appeared in UI, incrementing its client version. No email was sent. |
| Uncertain tool outcome | CUA timed out while filling contact, before submit. Reopened observation showed existing form values; DB showed0 contacts. Submitted that original form once; exactly1 contact persisted. No lost HTTP response is claimed from this tool failure. |
| Protected relationship | Missing confirmation showed Tick this to continue. Stale factor opened Confirm it is you and kept the pending edit. Real existing Bitwarden assertion advanced factor_at to14:15:48.332Z; the pending operation resumed toActive/version3. |
| Two-tab conflict | Two forms opened on version3. First tab saved new name/version4. Second stale tab was rejected, retained its text and offered Reload record. DB stayed at the newer name/version4. Reload showed current record while preserving draft; QA draft was canceled. |
| Retention policy | Active→Inactive/version5 set delete_after exactly closed_at+12 calendar months. Confirmed new work→Active/version6 cleared current closed_at/delete_after. Original90-day prospect expiry was never extended. |
| Request/case/search/link | Synthetic request detail was audited; message stayed in its source. Case double-click created1 case/1 receipt. Client/project search selected the correct pair. Real Apple Passwords proof (Jose approved Mac unlock) resumed case linking/version2, with1client_link_verified audit and factor_at14:24:32.544Z. |
| Source refusal/recovery | Only the synthetic control projection's branch binding was temporarily mismatched. Overview showed partial/Unknown Source unavailable rather than0; healthy Requests1/Clients1 stayed visible. Exact original binding was restored and UI again showed Workplaces0/Registrations1. No credential/grant/customer-source change. |
| Client search | Nonmatching search displayed Nothing matched; exact fictional contact-email search returned the saved client. Search text did not become a URL query. |
| Final closed-write/read | Final deployment refreshed with New client disabled and explicit Saving is turned off. Safari console had no runtime error entries on that refreshed page; this is not a retrospective console trace for every earlier action. |
| Logout/guest/direct route | Sign out displayed server-ended session. DB showed0 active business sessions,1 signed_out audit at14:31:19.174Z,2 active factors retained. Same Safari browser (still holding its legitimate Vercel SSO) requested `/api/admin/v1/clients`: Web Inspector showed HTTP401 and backend authentication_required JSON. Refreshing the other protected client tab showed sign-in without client data. Safari was left signed out. |
| Retention worker | Existing hourly trigger enabled at17 * * * *UTC. Last success read14:21:24.333Z, removed0/0, journal watermark2. Direct public anonymous and forged x-neon-header probes both returned401. Earlier actual expiry deletion/restore evidence is in the activation handoff. |

Times in the table are UTC; local Puerto Rico time is UTC−04:00. This was hosted desktop Safari acceptance. Cross-device recovery, hosted mobile, adversarial load testing and deliberately dropping a committed HTTP response were not separately exercised. Existing owned tests and prior local fixture tests cover additional protocol/retry cases; they do not substitute for those unobserved hosted scenarios.

Synthetic records retained for review under their normal retention rules: client `b92b0274-1998-405c-942b-1ed458bb1ae5`, project `211f9bbb-b52f-48b4-853a-892905f1e17b`, case `216de20d-2e8f-47e6-8ced-644e5f286e89`, request `00000000-2026-4112-8000-000000000201`. No production data copied or changed, no permanent test-data deletion, no real emails/charges/AI calls. Do not copy this dataset during promotion.

Minor UI follow-up for Claude: an empty filtered client search also displays No clients yet, although the specific Nothing matched message is correct. Data/search behavior passed; improve that empty-result label separately.

## Prepared artifacts

Artifacts are in `/Users/josek0514/Documents/Codex/2026-11-04/https-www-thevelani-com-preview-theme-2/outputs/admin-production-ready-20261112/`:

- `velani-admin-source-9ec75c6.tar.gz`: exact committed source, SHA256 `9ae44e791e002885bac9b6664c714157986e2a0fe11f75134e6b44bdbf2c84c1`.
- `adminretention-node24-9ec75c6.zip`: bundled `src/worker/entry.ts` as root index.mjs, SHA256 `8425826b21731edce72725f2cb57978a7795dd4c2172a0e314d82fcca6bfffdd`.
- `artifact-check.json`, `checksums.json`: Node24.19.0 bundle import passed and anonymous POST401 with no database credentials loaded. This is bundle qualification, not a production scheduled run.

There are no runtime secrets in these artifacts. The worker is only safe behind Neon's proxy, which strips caller-supplied x-neon headers. Do not expose the bundle on an arbitrary Node host and assume local header parsing authenticates a platform delivery.

## Production preflight — prepared, kept closed

| Item | Verified/prepared state |
| --- | --- |
| Vercel project | `velani-admin`, `prj_c6aunTwnTZVBglfKUGTtPXhvmrJu`, same team above; paused=true. Build settings prepared: Next.js, Node24.x, npm ci --ignore-scripts, npm run build. This configuration update did not deploy/unpause. |
| Domain | `admin.thevelani.com` attached to that exact project and verified=true. App origin is https://admin.thevelani.com. A public credential-free HTTPS check validated TLS and returned503 DEPLOYMENT_PAUSED; application acceptance after activation remains separate. |
| Web flags | Production target only; ADMIN_ENVIRONMENT=production, ADMIN_ENABLED=false, ADMIN_WRITES_ENABLED=false, sole owner support@furbrandpr.com. |
| Secrets | Required web root/OIDC/database/source-reader keys exist as sensitive Production-only variables. Values were not decrypted/exported. Maintenance/journal-write/schema-owner/provider keys must never enter web configuration. |
| Admin store | frosty-rain-97705509 / br-jolly-pine-bbhpie8b / velani_admin; binding production;5 migrations; epoch1;0 clients/credentials/sessions at preflight. |
| Independent journal | gentle-lab-30905964 / br-snowy-rice-bb09nuyv / velani_admin_journal. Restore separately from admin; never restore both together. |
| Backup/compute | All4 admin/journal projects re-read with604800-second history,0.25CU min/max and300-second idle suspension. Actual isolated snapshot restore proofs were completed earlier; no repeat restore was performed here. |
| Worker | Real production function/trigger inventories are empty. Bundle and restricted-role/environment contract are prepared below; no production deployment or schedule was created. |
| Hosting/cost | Team remains Hobby. Commercial hosting must be resolved before business operation; calling a branch development does not alter provider terms. Aggregate additional cap remains100USD/month across infrastructure, not a new allowance. Full cross-provider billing headroom must be reconciled before paid activation. |

Provider metadata was checked through the already authenticated Vercel connection; the separately installed native connector returned project-not-found in its own account scope. No resource was recreated or permission broadened to work around that mismatch.

## Activation procedure — execute only after the reviewed release is approved

1. **Jose + Codex: commercial hosting and operating limits.** Resolve the existing Vercel commercial-plan gate; Jose completes any payment/recurring-terms step personally. Set the agreed spend thresholds and notifications against the existing aggregate cap, accounting for other services and fixed fees. Avoid Elastic/enhanced build or observability add-ons unless separately justified. Vercel Spend Management is Pro-only; it is not configured on today's Hobby team. See [Vercel Hobby](https://vercel.com/docs/plans/hobby), [Spend Management](https://vercel.com/docs/spend-management).
2. **Codex: source and closed web candidate.** Select the exact reviewed source (runtime9ec75c6; later docs-only commits may be included after confirming an empty runtime diff). Reconfirm the exact production project/store/source identities and immutable migration checksums. No new migration is introduced in this packet. Keep ADMIN_ENABLED/WRITES false. Deploy explicitly to prj_c6aunTwnTZVBglfKUGTtPXhvmrJu only after authorization; do not rely on a CLI default/link copied from staging. Read back readyState, source gitCommitSha, domain and flags while closed. Do not use vercel curl or create an automation bypass.
3. **Codex: retention worker, initially unscheduled.** On frosty-rain-97705509 / br-jolly-pine-bbhpie8b, deploy only the qualified adminretention bundle, runtime nodejs24. Approved worker store must supply ADMIN_ENVIRONMENT=production, ADMIN_OPERATOR_CONFIRM=reviewed-private-action, the four exact admin/journal project/branch IDs, ADMIN_MAINTENANCE_DATABASE_URL with only the restricted maintenance role and ADMIN_JOURNAL_WRITE_DATABASE_URL with only the independent restricted journal writer. Override both injected DATABASE_URL and DATABASE_URL_UNPOOLED with the same restricted maintenance URL. No owner/web/auth/source/provider key. Entry refuses wrong branch, role or binding. Create trigger velani-admin-production-retention, path /maintenance, cron17 * * * *UTC, **disabled initially**. Neither copying a staging env nor omitting the injected-URL overrides is permitted.
4. **Codex + Jose: real alerts and spending acceptance.** Connect an owner-controlled alert receiver and an independent missed-run monitor before collecting real internal contacts. Prepared thresholds: warn after2 hours without maintenance success, critical after3 hours; immediate reviewed maintenance-failure code, authorization/journal mismatch, or repeated critical app failure. Include only service/environment/code/time, no DSNs, messages, contacts, employee data or session/credential values. The monitor must be outside the worker's failure domain. Error logs, a schedule and a last-success row alone are not delivered alerts. **No external maintenance-failure/missed-run alert route is connected or delivery-qualified by this packet.** Finish that integration and an explicitly approved synthetic alert delivery test at the selected inbox before launch. Do not treat this step as a completed backend activation.
5. **Jose + Codex: owner production enrollment, saves still closed.** Verify provider-side owner access; run the supported private prepare-owner/identity-approval workflow against production bindings. Enable only the app sign-in in a new explicitly selected deployment and unpause only when approved. Jose completes Google proof and two independent passkey registrations for admin.thevelani.com. Staging credentials do not enroll this relying party. Confirm expected owner, guest401, both proof paths and no sensitive caching. Never copy/replay staging cookies or extend timestamps to bypass enrollment.
6. **Codex: schedules and live operating acceptance.** Enable the production retention trigger only after approved operator target checks and alert routing. Observe an automatic successful invocation and correct journal/watermark/last-success state without creating real customer test records or purging data as a test. Reconfirm source-reader denials using approved metadata/qualification procedures, exact real feed scope and internal classifications. Validate production UI/read routes with no customer modification. Enable internal business saves only after those gates; normal real record collection is distinct from synthetic acceptance. Run a separately authorized reversible acceptance if real writes are needed.
7. **Codex: observe and record.** Monitor first15 minutes of authorized web activation and at least one scheduled maintenance run; record errors/latency, source scope, notification receipt and current flags. Keep development as the accepted working release until main's environment-specific acceptance is complete. Claude receives exact source, verified facts and any UI follow-up; no claims of live revenue, workforce access or unsupported actions are added.

## Rollback and stop conditions

Stop admission/saves and keep or restore production paused on wrong owner/project/source binding, guest business access, missing second factor, unexpected privilege, journal/watermark mismatch, failed real alert delivery, or failed critical flow. An authenticated read/write failing twice outside a documented temporary source outage blocks promotion. No numerical latency baseline/SLO was established here; measure it at activation rather than invent one.

Close ADMIN_WRITES_ENABLED and ADMIN_ENABLED, redeploy/confirm the closed configuration as needed, and pause the project; disable only the new production trigger if it was enabled. Preserve both audit and independent journal. Roll code back only to a source compatible with the5 existing immutable migrations; do not run destructive down migrations or restore the journal to make readiness green. Any data restore uses the supported restore-begin/reconcile/root-rotation/restore-complete procedure and explicit restore approval. Code rollback does not itself revoke sessions; use the supported private recovery procedure if authorization integrity is in doubt. Do not remove working staging passkeys or alter unrelated services.

No new request to publish Shopify, activate NEVORA signup/billing, merge main, purchase hosting or change customer data is implied by this packet.
