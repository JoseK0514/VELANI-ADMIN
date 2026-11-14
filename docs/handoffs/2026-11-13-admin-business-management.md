# Admin business management delivery

Jose requested implementation of the eight gaps in the November 13 business
capability review. Base: development22d733666823279cbc8a384ba4a24fa97879c074.
Work is isolated in a separate clone/branch; existing checkouts and main remain
intact. The new business contract is additive v2; the fixed v1 is preserved.

## Acceptance scope

| Area | Implemented behavior | Evidence |
| --- | --- | --- |
| Today | Due/overdue replies, follow-ups, delivery, acceptance, blockers, renewals, trials and health exceptions with source links | Owned PostgreSQL queue tests; desktop/phone Next workflow |
| Intake | Source-labelled manual channels, deduplication, stages/value/lost reason, human reply and one-time client/project linking; exact client-hub Track action | Concurrent receipt replay, immutable expiry, real source binding tests; browser fractional-timestamp check |
| Money | Read-only source facts, separate MRR/payments/refunds/credit-adjusted receivables, USD and product views, freshness/account/history qualification | Financial definitions and private publisher tests; GET-only provider adapter fixtures; unknown/ready browser states |
| NEVORA | Qualified lifecycle, stage age, setup/first use, trial expiry and finite worker-health observations; control/catalog fallback | Revision/incarnation/origin/staleness tests; missing-catalog trial exception test; browser health screen |
| Customer | Existing identity joined with projects/cases/commitments, retained timeline, finance and health; audited detail reads | Parent isolation/filter-before-limit, shared v1/v2 detail-limit/audit tests; desktop/phone summary |
| Delivery | Approved scope/value/estimate, milestones, blockers, completion/acceptance, invoice references and recorded project cost | Parent ownership, fresh factor and queue tests; browser create with exact dollar-to-cent conversion |
| Insights | Equal-period retained inquiry/channel/day comparisons and source-dated NEVORA activation/trial/paid cohorts | UTC-offset regression, calendar/DST and cohort definitions tests; browser report screen |
| Costs | Product/project costs, support minutes, monthly budgets/headroom and conditional cash contribution | Partial-month budget regression, unknown-contribution tests; browser expense/budget creation |

The user clarified seven service days per week,07:00–22:00. The reply clock uses
America/New_York (the timezone in his answered question), including DST. The
existing two-service-day promise is retained. Website hours were left for his
later update. No customer mail, payment or invoice command was added.

## Review and verification

The initial immutable implementation0cb66ed55d637c9f00e7cd450d74cab4e43cfb7f
passed184 owned tests, build/types/lint and candidate Actions43551038514.
That evidence was superseded by review corrections; it is not the final delivery
qualification. The read-only code reviewer found five Important issues, no
Critical: UTC offset grouping, credit-adjusted invoice balance, detail audit/rate
parity, exact client-hub receipt preservation, and aggregate trial-expiry fallback.
All five received fixes and regression coverage. Additional focused regressions
protect monthly headroom from report-start truncation and reject unsupported
metered/discounted contracts as complete MRR coverage.

Focused final business checks:28 passed across4 files using owned loopback
PostgreSQL with real Google-signature/passkey fixture verification and the
independent journal. The full regression suite, exact final candidate/development
Actions identities and final review outcome are recorded in the delivery receipt
outside this source packet after execution. Do not infer hosted acceptance from
any green local or Actions run.

The browser runner starts an actual production Next build with explicit fictional
API fixtures. It exercises nine screens at1440px and390px, inquiry create/edit,
plan creation with project lookup, costs/budgets, source Track preserving seconds
and milliseconds, and an identical operation/body retry after a lost response
across real sidebar navigation. Each viewport sends seven command attempts
including the retry. Results: zero axe violations, document horizontal overflow
or browser runtime errors. The original v1 navigation and disabled-write browser
scenarios also passed (four scenarios across the same viewports). Backend
transaction/auth/source truth is proven separately against owned PostgreSQL;
browser fixtures are not live merchant or customer data.

## Operating boundaries and handoff

See ../business-operator-guide.md for the executable API, migration/grants,
private publisher and Stripe collector commands, source schemas and KPI dictionary.
Migration0006 and revised grants are explicit operator work; build/start do not
migrate. No hosted schema, deployment setting, provider credential, enrollment or
source classification was changed in this delivery. A prior binary checks its
exact migration ledger; rolling back source alone after schema application must
remain closed until compatible bindings are requalified. Keep records/receipts;
do not drop populated business tables or falsify migration checksums.

Manual Shopify/email/phone/consented-Rondo logging is supported and labelled.
It does not claim a mailbox or transcript connector. Live money requires a bound
merchant, restricted read-only credential and verified customer mapping in the
private operator environment. Live company health requires actual source-owned
aggregate observations with current identity; no customer APP/WORKER credential
or workforce record was added to this admin. Disconnected/stale/incomplete sources
remain unknown, including lifetime retention/churn. A separate aggregate history
store or retention extension was not introduced.

SCRUM-186's existing hosting/budget, independent monitoring, production-origin
Google/two-passkey enrollment, closed deployment and activation gates remain
separate. This code review is not independent hosted security certification.
No main merge or separate production activation is implied by development delivery.
