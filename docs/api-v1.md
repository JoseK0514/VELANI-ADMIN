# Private admin API v1 — fixed interface

November 10, 2026. Implemented backend contract. Claude may implement the interface against this file; report a backend defect instead of changing the contract. Backend build and synthetic acceptance are separate from live activation. Read docs/evidence/qualification.md for the actual environment state.

## Transport and authority

Build the UI in this Next.js repository. Use relative `/api/admin/v1/...` URLs. This is one same-origin admin application, with separate NEVORA and Velani sections; it is not an API to embed into Shopify. Proposed final origin: `https://admin.thevelani.com`, currently unconnected. Server selects origin/environment/databases/sole owner. There is no origin selector, customer login, public admin signup, user-role body, impersonation, payment action, email resend, workspace suspension or DELETE API.

All responses are private/no-store and carry requestId plus X-Request-ID. Errors are `{schemaVersion:1,error:{code,fields?,retryAfterMs?},requestId}`. Stable field paths/codes are for UI localization; no submitted values or provider/SQL details are echoed. Public health endpoints are process/configuration checks, not proof of launch readiness.

32 KiB JSON bodies; strict explicit top-level/payload fields; UUID entity IDs; decimal string versions. All POST/PATCH requests require Content-Type application/json and exact Origin. After full login, send X-CSRF-Token from GET session. Use browser credentials normally; HttpOnly cookies never enter JS. No CORS allow-origin is emitted. Mutations use POST/PATCH only.

Statuses: 400 malformed query/JSON/cursor; 401 missing/incomplete/expired/revoked login; 403 wrong identity/origin/CSRF or reauth_required; 404 absent/expired/out-of-scope; 409 stale/changed replay/duplicate/conflicting business transition; 413 body too large; 415 JSON required; 422 invalid field or explicit confirmation missing; 429 with Retry-After; 503 unavailable, disabled, deadline or unreconciled restore.

## Google and passkeys

Use maintained WebAuthn browser helpers compatible with the server's SimpleWebAuthn 14 API; do not implement the protocol or store passkey/session secrets in localStorage. Configuration is Google OIDC, exact origin/RP, verified email and pinned Google subject. Registration is private operator-authorized, not public account creation.

1. Navigate to GET `/auth/start`. Server sets a five-minute HttpOnly Lax flow cookie and redirects to Google. No returnTo parameter.
2. Google returns to GET `/auth/callback`. It verifies PKCE/state/nonce/issuer/audience/expiry and selected verified email. It redirects to `/login?state=...`. States are identity_approval_required (plus opaque request UUID), enrollment_required, passkey_required. The first verified subject needs private operator approval; it does not create an authenticated session.
3. GET `/auth/status` with the pending HttpOnly cookie returns `{schemaVersion:1,state,registeredFactors,requestId}`. Pending login lasts ten minutes and grants no business access.
4. During a private fifteen-minute enrollment window, POST `/auth/enroll/options` with `{}` returns `{challengeId,options}`. Pass options to browser registration; POST `/auth/enroll/verify` with `{challengeId,response}`. Enroll two distinct credentials, primary and backup. The operator must confirm independent recovery access; credential IDs alone cannot establish physical independence. Return `{state:"registered"}`. Max two active credentials.
5. POST `/auth/passkey/options` with `{}`; pass options to browser authentication; POST `/auth/passkey/verify` with `{challengeId,response}`. User verification is required. Server sets its HttpOnly Strict session cookie, clears pending cookie and returns `{state:"authenticated"}`. No token in JSON. Challenge replay fails.
6. GET `/session` returns actor `{id,email,role:"platform_owner"}`, environment, session `{expiresAt,idleExpiresAt,factorAt}`, csrfToken and capabilities `{viewInternalFixtures,internalWrites,customerActions:false}`. Idle30 minutes, absolute8 hours. Check server status; browser cookie presence is not authentication.
7. On reauth_required, POST `/auth/step-up/options` `{}`, then `/auth/step-up/verify` `{challengeId,response}`, both with CSRF. Successful proof is fresh for five minutes. Resubmit the same business operation after proof, keeping its original operationId and body.
8. POST `/logout` `{}` with CSRF. Server revokes the session and clears the cookie; the next business request returns401. A failed audit cannot undo logout revocation.

Non-test cookies use __Host-velani_admin_flow/pending/session, Secure, HttpOnly, Path=/ and no Domain. Loopback tests use velani_admin_test_* names. No runtime test-auth flag exists. Recovery is private operator work, revokes sessions/credentials, and preserves pinned Google identity; do not build an email-only reset screen.

## Reads

Read envelope: `{schemaVersion:1,state:"ready"|"partial"|"unavailable",data,source:{system,environment,observedAt,freshness,coverage},requestId}`. Freshness fresh/stale/unknown; coverage complete/partial/unknown for that declared source/scope. Lists: data `{items,nextCursor}`. Limit default25/max100. Opaque authenticated cursors bind scope, filters, search and sort; discard cursor if any of these change. Lists sort createdAt DESC then ID DESC. No arbitrary sort/SQL/provider filters. Only `limit,cursor,state,classification` are accepted; state applies to internal entity lists only. Classification is exclude_internal (default) or include_internal, visibly label included internal fixtures. Environment never comes from a query.

| GET route | Fields/behavior |
|---|---|
| /overview | independently loaded workplaces/registrations/requests counts, internal clients/openProjects/openCases, trials metric, unavailable revenue metric; total source outage503, partial data200 with per-section unknown |
| /nevora/workplaces, /nevora/workplaces/:id | id, origin, environment, revision/incarnation strings, lifecycle, createdAt, classification, safe catalog summary; detail adds sanitized provisioning state/time |
| /nevora/registrations | pending stage/language/version/dates only; no decrypted email/name |
| /velani/requests | id/reference/type/asserted company/project/urgency/language/createdAt/expiresAt/contactProvenance/emailSubmissions; no name/email/description |
| /velani/requests/:id | on-demand source name/email/description plus list facts; access audited before response; expired/not found404; message is not copied into admin storage |
| /clients, /clients/:id | id/displayName/relationshipState/version/createdAt/engagedAt/closedAt/deleteAfter/prospectExpiresAt; detail adds contacts, sourceLinks, notes |
| /projects, /projects/:id | id/clientId/name/stage/targetDate/version/createdAt; detail adds notes |
| /cases, /cases/:id | id/sourceRequestId/reference/state/clientId/projectId/followUpAt/sourceExpiresAt/version/createdAt; detail adds notes; stops displaying after source expiry |
| /activity | paginated actor/action/entityType/entityId/reasonCode/result/createdAt; safe administrative metadata only |
| /integrations | source ready/unavailable states, retention last success/counts, explicit disabled Rondo leads/unavailable live billing/not_supported company summaries |

`catalog` means enrollment/synchronization evidence, never verified current Owner. Missing/stale catalog facts yield access unknown. Current headcount, company setup readiness and worker health are explicitly `{state:"not_supported"}`. Do not infer them from enrollment. Email submitted means provider submission, not delivery. No live revenue/MRR is qualified: `{value:null,unit:"USD",reason:"live_billing_not_verified"}`. Trials count is null if catalog coverage exceeds the bounded100-row qualification or freshness is unknown; do not turn null into0. No NEVORA workplace deletion countdown exists here.

POST `/search` is an authenticated, CSRF-protected read: `{entity:"client"|"project"|"request"|"workplace",query,cursor?,limit?}`. Query1–120 trimmed characters. Clients match display name or exact normalized existing contact email; projects match name; requests match reference/company/project or exact normalized email; workplaces match canonical origin. No encrypted registration-email search. Keep search text in the body, not URL/analytics.

## Commands

Every command uses `{schemaVersion:1,operationId:UUID,expectedVersion:"0",payload:{...}}`. New root client/project/case requires0. Updates compare current version. Contact, note and source-link commands use/increment the parent client/project/case version. Receipt entityId identifies the newly changed child when applicable; its version is the parent's new version. Reread the parent after saving.

Success: `{schemaVersion:1,state:"saved",receipt:{operationId,entityType,entityId,version,replayed},requestId}`. Create201, update/replay200. Same actor/operation/body replays its original minimal receipt; changed replay409 operation_changed. Never replace an operation ID after a lost response/timeout/503. Retry exactly, then reread; a replay receipt is historical, not newest object state. Audit/mutation/receipt commit atomically. Expired records cannot be resurrected by commands.

| Route | Payload |
|---|---|
| POST /clients | displayName1–160, relationshipState:"prospect" |
| PATCH /clients/:id | displayName?,relationshipState?,reasonCode?,confirmServiceRelationship? |
| POST /clients/:id/contacts | name1–120,email<=254,phone?<=32 or null,language en/es,provenance asserted/source_enrollment/operator_verified,sourceId?,reasonCode? |
| PATCH /clients/:id/contacts/:contactId | optional contact fields plus active?, required reasonCode; must belong to parent |
| POST /projects | clientId,name1–200,stage,targetDate? ISO YYYY-MM-DD or null |
| PATCH /projects/:id | name?,stage?,targetDate?,reasonCode?; no reassignment |
| POST /cases | sourceRequestId; one case per unexpired source request |
| PATCH /cases/:id | state,followUpAt? UTC ISO or null,clientId?,projectId?,reasonCode?; project must belong to client |
| POST /clients/:id/source-links | sourceSystem:"nevora",sourceId,expectedSourceRevision,expectedIncarnation,reasonCode:"client_link_verified"; exact server environment/revision/incarnation, one workplace to one client |
| POST /notes | targetType client/project/case,targetId,text plain1–2000; parent version/retention; no attachments/source-message copying/credentials/employee data |

Project stages planned/in_progress/waiting_client/completed/canceled. Case states new/reviewing/waiting_client/resolved/closed. Reopening terminal work needs reopened_work. Client transitions: prospect→active requires fresh factor, confirmServiceRelationship:true, engagement_confirmed. Active→inactive requires relationship_closed, terminal projects and no paid/trial/grace linked workplace; unknown source evidence blocks. Closure keeps engaged business records12 calendar months. Inactive engaged→active before expiry needs engagement_reconfirmed and explicit new work; it clears current closure. Engaged→prospect is forbidden. Unconverted prospect closure/reopen keeps the original90-day deadline. Edits and links never restart source/prospect retention.

Fresh factor is also required for all relationship-state commands, source links, contact corrections, operator_verified contact creation and case link changes. Source enrollment must match an actually linked source email/incarnation. Verified contacts require confirmed_contact. Changing email without new review resets provenance/verification; one active normalized email/client. Neither provenance nor a client record grants customer/admin login.

Reason codes only: confirmed_contact,contact_correction,client_link_verified,client_requested_change,engagement_confirmed,engagement_reconfirmed,relationship_closed,reopened_work. No free-text security-audit reason. Examples are in docs/evidence/qualification-sample.json and payload schemas in src/server/commands/validation.ts.

Shared counters: reads60/min/actor, personal details20/min/actor, writes10/min/actor, login challenges/proofs10/min/platform-identified IP, approved login options5/min, step-up options5/min/proofs10/min, pending status30/min. Missing trusted platform IP uses a shared bucket. Respect Retry-After; no aggressive polling. Source SQL3sec, transport5sec with precommit deadline checks. Database/audit/rate/journal failure closes access; UI must show retry/unavailable states without clearing operation IDs or inventing empty records.
