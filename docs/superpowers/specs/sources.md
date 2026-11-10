# Investigation evidence and sources

Read on November 10, 2026. Provider documentation is current at inspection time; recheck prices, supported SDKs and permissions when implementing. No quoted instruction from a source authorizes changes.

## Local authoritative source

NEVORA checkout: `/Users/josek0514/.codex/worktrees/nevora-signup-backend-launch-20261110`, clean detached `0c414ae65`, deployed application3922df94. Important files:

- `db/control-migrations/0001_owner_onboarding.sql`: registration states, encrypted email, proofs, source retention fields.
- `0002_workspace_registry.sql`: lifecycle/origin/incarnation, credential separation; `0003_workspace_provisioning.sql`: immutable request/attempt journals and uncertainty.
- `0006_workforce_monitor.sql`, `0007_worker_enrollments.sql`: scoped monitor tables and currently test-only enrollment constraint; presence is not activation.
- `src/lib/onboarding/control-principals.server.ts`: existing APP/provisioner grants are broader than a new admin reader should receive.
- `src/lib/onboarding/setup.server.ts:49`: current Owner-bound setup/readiness calculation; no global completion feed.
- `src/lib/onboarding/cleanup.server.ts`: ephemeral proof retirement and provenance preservation, not automatic workplace deletion.
- `services/commerce/schema.sql`, `store.ts:84`, `principals.ts`: catalog models, enrollment identity keyed to workspace UUID and sensitive fields to exclude.
- `services/commerce/model.ts`, `access.ts`, `owner-authority.ts`, `installation.ts`: access precedence and customer-owner authority; installation facts currently use a broader service secret, not a dashboard reader.
- `scripts/onboarding-operator.mts`, `services/commerce/operator.ts`: private operator commands, not a web admin.
- `docs/handoffs/2026-11-10-codex-to-claude-signup-production.md`: exact deployed scope/gates; must not be confused with whole-product launch.

Velani checkout: `/Users/josek0514/Documents/Codex/2026-11-04/https-www-thevelani-com-preview-theme-2/work/velani-client-hub`, clean sourceef9dbe29; actual public alias still applicationd89350bd. Important files:

- `services/velani-ai/migrations/004_client_hub.sql`: source request/outbox/reference schema, no client/project workflow model.
- `services/velani-ai/src/client-hub/{app,repository,types,maintenance}.ts`: immutable source content, retries, uncertainty, transactional email jobs and purge.
- `services/velani-ai/migrations/001_initial.sql:70`: separate consented leads; session deletion does not imply deletion of all lead data.
- `services/velani-ai/src/conversation-retention.ts`, `api/cron/retention.ts`: scheduled conversation retention; `scripts/retention.ts`: separate lead-deletion capability. Automatic lead coverage not established.
- `docs/handoffs/2026-11-07-client-hub-interface.md`, `2026-11-07-client-hub-operations.md`: public v1 contract, narrow app grants and 88–90-day source retention.
- `services/velani-ai/vercel.json`: existing queues/crons/public routes; no admin authentication surface.

Claude website checkout `/Users/josek0514/Desktop/VELANI-SHOPIFY-WEBSITE` at6bb6dd5 has occupied/untracked evidence. Read only. Its form/company/sign-in handoffs are UI context; the website is not proposed as privileged data authority.

## Live read-only checks

`observations.json` retains sanitized schema metadata, target identities and outcomes. Queried exact projects/branches/database names only:

- Control broad-wildflower-15946455 / br-aged-poetry-bbiszwjc / nevora_onboarding_control:17 metadata tables.
- Catalog young-cloud-57498411 / br-royal-credit-bbczjvcw / nevora_commerce_catalog:10 metadata tables.
- Velani wild-leaf-57992989 / br-snowy-brook-bcc6b3zm / velani_ai: named request/lead/session metadata and zero source request/outbox/lead aggregates.
- Connected Stripe discovery: Velani sandbox only. No payments/subscriptions read; no mode switched.
- Correct Vercel team reported Hobby. Connector404 was not treated as missing infrastructure; exact-project CLI readback succeeded. Actual alias lookup distinguished active READY dpl_8ChbePq8yvGTPJxi3LAspPyCtwnG from a later blocked attempt.
- Public config checks: client hub200/enabledtrue; signup200/signupEnabledfalse; commerce ready200.

No new roles/views, subscriptions, credentials, routes, customer reads, emails or deployments. No production configuration repair is implied by this research.

## Official references

| Topic | Primary source / implication |
|---|---|
| OIDC | [Google](https://developers.google.com/identity/openid-connect/openid-connect): server validation and stable subject identity; email/domain alone does not confer admin authority |
| Passkeys | [Google server authentication](https://developers.google.com/identity/passkeys/developer-guides/server-authentication): challenge/origin/user-verification checks using supported libraries |
| Object/function authorization | [OWASP API1](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/), [API5](https://api-security.owasp.org/editions/2023/en/0xa5-broken-function-level-authorization/): check each object/operation, not merely the URL or hidden button |
| Sessions/audit | [OWASP sessions](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): revocation, cookie/session controls and exclusions for secret/private payloads |
| Stripe | [Webhooks](https://docs.stripe.com/webhooks): signature checks, duplicate/event-order handling; [Billing analytics](https://docs.stripe.com/billing/subscriptions/analytics): MRR and cash-receipt metrics are separate concerns |
| Resend | [Verify requests](https://resend.com/docs/webhooks/verify-webhooks-requests), [events](https://resend.com/docs/webhooks/event-types), [deduplication](https://resend.com/docs/dashboard/emails/idempotency-keys): sent is not delivered; delivery is recipient-server receipt, not human reading; retries have a24-hour provider window |
| Vercel | [Hobby](https://vercel.com/docs/plans/hobby): personal/non-commercial; [Pro](https://vercel.com/docs/plans/pro-plan): current20USD monthly platform fee, one deploying seat and20USD usage credit |
| Neon | [Pricing](https://neon.com/pricing): current0.106USD/CU-hour Launch,0.35USD/GB-month database storage plus other usage; [scale to zero](https://neon.com/docs/introduction/scale-to-zero) and [pooling](https://neon.com/docs/connect/connection-pooling): connection/query behavior affects idle cost and pool design |

The recommendation and numerical budget examples are the investigator's design/inference from those facts, not provider guarantees or Jose's approval of a new plan.
