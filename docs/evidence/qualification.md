# Backend qualification — November10,2026

Implementation/owned qualification is separate from configuration, live identity enrollment, source grants and production activation. Claude may build the UI against API v1 now; live customer operation is not qualified.

## Coverage and actual checks

| Requirement | Evidence |
|---|---|
| Isolated schema/config/migrations/effective web restrictions | foundation/config tests; owned PostgreSQL, actual restricted roles; no source/customer tables |
| Google OIDC verification, pinned identity and private binding/recovery | real RSA-signed local issuer + official openid-client; wrong email/audience/nonce/expiry; private owner vs ordinary role |
| Two actual WebAuthn credentials, UV/origin/RP/counters/replay | actual P256 registrations/assertions verified by SimpleWebAuthn; negative controls; no runtime bypass |
| Sessions/revocation/CSRF/body/rate/audit/private disclosure | HTTP/auth-security/commands tests; current DB authority, shared counters, audit-failure rollback/disclosure denial |
| Restricted source views | real owned control/catalog/Velani source tables/reader logins; field schemas; denied base reads/writes; wrong binding and broadened JSON negative controls |
| Partial/outage/unknown metrics/cursors | reads/sources tests; no false zero, no revenue proxy, freshness and cursor-scope tests |
| Commands/versions/idempotency/retention business rules | six concurrent duplicate requests →one mutation/audit; changed replay/stale/cross-parent/source revision/expiry/close/reopen/recent factor tests |
| Retention/independent journal/restore barrier | separate owned DB; actual purge/holds/cascades; crash after journal commit; restored stale watermark blocks then reconciles |
| Request budget | deadline regression proves late transaction rolls back before commit; outer runtime/handler budgets; DB/source timeouts |
| Compiled transport | actual Next server from production build; missing config stays closed503/no-store/correlation ID; no fallback authentication |
| Workflow fixture | qualification.test real crypto login + real source readers + HTTP client/contact/project/note/case/closure; redacted actual receipts in qualification-sample.json |

Latest full suite/typecheck/lint/build/audit receipts are retained alongside this report after final review. Tests run on an owned loopback PostgreSQL cluster, with no live source/production credentials. The first Task3 activity run exposed a volatile default timestamp constraint; immutable migration0003 fixes its cause and a100-row exact-expiry regression passes. Early module-load failures before dependency installation are not counted as behavioral RED. Development dependency minimatch was pinned to11.0.5, lockfile freshly resolved, lint rerun and full dependency audit reports zero; no EOL eslint downgrade was accepted.

## Hosting evidence and limits

Local Node24.19.0, Next16.4.6, PostgreSQL owned runtime. Source/package lock pins Node24.x. Vercel project velani-admin exists in team_Lzbw410WwXGWHTuUXuamRI1N, project prj_c6aunTwnTZVBglfKUGTtPXhvmrJu. No application env keys, new database, custom DNS, paid plan, source grants, Google OAuth client or live passkeys were activated.

Unexpected first-deploy behavior: without --prod, CLI65.14 assigned the first upload to Production, deployment dpl_9mGg67DdBPcpbL58TW4drFaopSkr. It finished before cancellation could succeed. The authenticated application request returned503 admin_not_configured; unauthenticated public request redirects302 to Vercel authentication. Project pause required Jose's direct confirmation and an async request was sent; do not call it paused without verifying. The CLI-generated one-off automation bypass was identified and revoked without printing its value; current bypass count0. No existing customer deployment or domain changed. Node26 was the provider's initial default; project/source now pin24.x. Explicit subsequent Preview dpl_4a427zrsPnDkcFQYrwqyygXtLtaZ reached READY/protected. These uploads precede final qualification fixes and are closed hosting preparation only.

## Open activation gates

Google confidential client/consent and exact URI; private subject approval plus Jose's own primary/backup passkeys; two independent hosted stores/approved grants/bindings; real source role denial tests and fixture classification; eligible commercial hosting/full aggregate budget headroom; custom origin/DNS/TLS; retention/privacy disclosure; separate scheduled maintenance with observed automatic run; off-host backup restore qualification; Claude UI and actual authenticated browser acceptance; explicit production release action.

Existing $100/month is aggregate infrastructure approval. No new paid admin resource/subscription was started. The provider budget/account inventory is incomplete: Vercel team remains Hobby, one Render connection needs reauthentication, full live worker billing is not visible through the remaining connection. Code passing does not resolve those provider states.

## Independent review and corrective verification

Original independent review and detailed resolution are preserved as independent-review.md and review-resolution.md. The initial verdict blocked on pagination precision, incarnation matching, trial coverage and restored authorization. A single correction pass added behavioral RED/GREEN regressions; there was no second reviewer dispatch. The original report remains historical evidence, not a claim that the corrected source was independently re-reviewed. Internal reparsing/module-size cleanup is explicitly deferred as a minor maintainability concern. UI and live infrastructure were outside that review; they remain unqualified activation gates.

Final source implementation91289f2 is deployed only to explicit protected Preview dpl_y5Qt6HRutnhsMpTQrPy3X4jJmH1y (READY/Node24.x). No application env keys or automation bypass remains; public API request302 confirms the Vercel gate. Production pause is still false/pending direct user confirmation. Final local suite75/75 in14 files; build/typecheck/lint pass and audit0. This is still closed preparation, with no real source/identity/retention/backup activation evidence.
