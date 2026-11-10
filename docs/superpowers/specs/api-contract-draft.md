# Private admin API — proposed v1

November 10, 2026. **Design draft, not a deployed endpoint or final contract.** Freeze this contract after Jose approves the design, before Claude implements connected screens. Keep existing public signup, billing and client-hub contracts unchanged.

## Boundaries

One same-origin admin UI/API, proposed `https://admin.thevelani.com`. Production/staging have different origins, cookies, identity configuration and databases. Business endpoints below require the fully authenticated, active `platform_owner` session; a pending Google/passkey challenge grants no business access. Customer Employee ID sessions, signup cookies, billing links and form references grant no admin authority.

Authentication uses maintained OIDC/WebAuthn libraries. Exact library callback paths are an implementation choice after a supported-version spike; retain their standards protections rather than wrapping them in a home-grown protocol. Business API namespace is `/api/admin/v1`. All responses have private/no-store headers and a safe request ID. The reverse proxy/browser cache must not cache authenticated pages or API responses publicly.

Common input limits: 32 KiB JSON body; explicit fields only; path IDs are UUIDs for internal entities; source IDs use their documented format. Unknown fields, states, filters and sorts are rejected. Dates are ISO UTC; display in America/Puerto_Rico, with the source workplace zone shown when actually known. Versions are decimal strings, never floating point.

## Read responses

Every independently loaded section carries:

```json
{
  "schemaVersion": 1,
  "state": "ready",
  "data": {},
  "source": {
    "system": "nevora_control",
    "environment": "production",
    "observedAt": "2026-11-10T15:00:00.000Z",
    "freshness": "fresh",
    "coverage": "complete"
  },
  "requestId": "opaque-correlation-id"
}
```

`state` is `ready|partial|unavailable`. `freshness` is `fresh|stale|unknown`, `coverage` is `complete|partial|unknown`. A request-time successful read can be fresh while the business fact itself is old; row facts additionally retain their enrollment/event observation time. `coverage:complete` means complete for the declared source/scope, not proof that every legacy business relationship has been imported.

For lists, `data={items:[],nextCursor:null}`. Default page25/max100; cursor is authenticated and bound to scope/filters/sort, containing no contact text. Metric shape is `{value:number|null,unit:string,reason:string|null}`. Zero requires a successfully counted, declared source; missing live billing is `{value:null,unit:"USD",reason:"live_billing_not_verified"}`. Do not add currencies together. Total source outage503; partial overview200 with unavailable sections and explicit source errors.

| Method and route | Content / rules |
|---|---|
| GET `/session` | Actor ID/display name, required factor/session expiry, safe capabilities, environment and CSRF token; no provider tokens |
| POST `/logout` | CSRF-protected session revocation; confirmed subsequent business request401 |
| GET `/overview` | Separate workplace/trial/client/request/project metrics, attention items and per-section source state; no invented revenue/MRR |
| GET `/nevora/workplaces` | Canonical workspace ID/origin, lifecycle/incarnation/revision, enrollment business label, trial/catalog access state, fixture classification and source timestamps |
| GET `/nevora/workplaces/:id` | Same fields plus sanitized provisioning timeline and links to internal cases; no secret refs, resource JSON, employee records or guessed Owner proof |
| GET `/nevora/registrations` | Pending IDs, stage/locale/dates and verification status only; encrypted email/name stays unavailable |
| GET `/velani/requests` | ID/reference/type/asserted company/project/urgency/language/received date, case status and source outbox states; omit description/full contact from list |
| GET `/velani/requests/:id` | On-demand permitted source contact/message and email submission state; audited detail access;404 when expired/not found; no frozen email payload or verification token |
| GET `/clients`, GET `/clients/:id` | Internal business profile and explicitly linked resources; classify source contacts as asserted/enrollment/verified, never all as current Owners |
| GET `/projects`, GET `/projects/:id` | Internal project/client/stage/target date/version/notes; independent of payment or workplace lifecycle |
| GET `/cases`, GET `/cases/:id` | Internal triage/source link/follow-up/version; expired source content is unavailable even if metadata remains briefly for cleanup |
| GET `/activity` | Paginated safe administrative/access audit; actor/action/object ID/time/result; never descriptions, passwords or proofs |
| GET `/integrations` | Safe connection/freshness/coverage/retention-job evidence; omit credentials, raw URLs with proofs and provider environment values |
| POST `/search` | Read-only authenticated search body `{entity,query,cursor?,limit?}`; entity is `client|project|request|workplace`, query1–120 characters; exact normalized email match only on allowed existing contact fields; no pre-provision encrypted-email search |

Plain list filters are `state`, `classification`, and declared date bounds/cursor/limit. Never accept arbitrary table, schema, SQL, origin, provider account or connection string. Fixture exclusion is the default; including fixtures requires a named capability and visible test label. Production cannot be switched into staging by changing a query parameter.

Optional future lead routes are not a v1 promise: Rondo leads remain disabled until their distinct source-retention and read-only grant are qualified. No chat-transcript route is proposed. Company readiness/current headcount/heartbeat fields are `not_supported` in v1 and must not be inferred from registration or enrollment counts.

## Internal business commands

All commands use this envelope. The actor is derived from the authenticated session, never the body.

```json
{
  "schemaVersion": 1,
  "operationId": "83121a1b-189d-4bba-adfb-4cffcd380772",
  "expectedVersion": "2",
  "payload": {}
}
```

Creating a new root client/project/case uses expectedVersion `"0"`. Updating a root or adding/changing its contact, note or source link uses the current parent aggregate version and increments that parent. In one operations-DB transaction: check authority and recent factor when required, reserve unique actor/operation ID plus command hash, lock/compare current version, mutate, append audit, persist the minimal receipt. Same logical command/body returns the original receipt; changed replay409. A replay receipt does not represent the object's newest state; reread before showing current data. All previous-operation lookups still require active admin authority.

| Route | Payload and effect |
|---|---|
| POST `/clients` | `{displayName,relationshipState:"prospect"}` creates an internal client; name1–160; engagement is a separate reviewed command |
| PATCH `/clients/:id` | `{displayName?,relationshipState?,reasonCode?,confirmServiceRelationship?}`; apply the proposed closure/retention state machine in README; engagement/reactivation requires recent step-up, confirmServiceRelationship:true and engagement_confirmed/engagement_reconfirmed; no billing or workplace changes |
| POST `/clients/:id/contacts` | `{name,email,phone?,language,provenance,sourceId?,reasonCode?}`; name1–120, email<=254, optional phone<=32, language en/es, provenance asserted/source_enrollment/operator_verified; operator_verified requires recent step-up and confirmed_contact; version belongs to the client aggregate |
| PATCH `/clients/:id/contacts/:contactId` | `{name?,email?,phone?,language?,active?,provenance?,sourceId?,reasonCode}`; contact must belong to that client, current client version and recent step-up required; email changes reset verification unless explicitly reviewed again; contact_correction or confirmed_contact required |
| POST `/projects` | `{clientId,name,stage,targetDate?}`; name1–200, stages planned/in_progress/waiting_client/completed/canceled, nullable ISO date |
| PATCH `/projects/:id` | `{name?,stage?,targetDate?,reasonCode?}`; no implicit client reassignment |
| POST `/cases` | `{sourceRequestId}` opens/replays the one internal case for an existing, unexpired client-hub request; duplicate case409 with existing case ID |
| PATCH `/cases/:id` | `{state,followUpAt?,clientId?,projectId?,reasonCode?}`; states new/reviewing/waiting_client/resolved/closed; project must belong to the selected client; link changes require recent step-up |
| POST `/clients/:id/source-links` | `{sourceSystem:"nevora",sourceId,expectedSourceRevision,expectedIncarnation,reasonCode:"client_link_verified"}`; requires exact verified production workspace/revision/incarnation; one workplace cannot link to two clients; recent step-up; metadata only; source environment is fixed by the server |
| POST `/notes` | `{targetType,targetId,text}`; target client/project/case; plain text1–2000, follows target version/retention; no attachments or credential/employee-data collection |

Project/case stage may move to any listed state with an audit record; reopening resolved/closed/completed/canceled work requires reasonCode `reopened_work`. Client relationship transitions follow README's more restrictive engagement/closure rules. Other allowed codes are `confirmed_contact`, `contact_correction`, `client_link_verified`, `client_requested_change`, `engagement_confirmed`, `engagement_reconfirmed` and `relationship_closed`; no free-text reason is copied into security audit. New root clients must start as prospect; engagement is a separate explicit versioned command. A project cannot be created/reopened under an inactive client. Additional context belongs in retention-bound internal notes. A source_enrollment contact must match the actual linked source record, not merely the caller's provenance label. Creating/changing an operator_verified contact records Jose's explicit business verification; it does not authenticate that contact or prove current customer Owner authority. Only one active normalized email per client is allowed. Source identity changes, reassignment of an existing external link, merges, permanent contact deletion and retention/erasure are not ordinary v1 commands. Use a reviewed operator procedure until separately designed. There is no destructive DELETE endpoint and no public admin signup/user-creation endpoint.

Success200/update,201/create:

```json
{
  "schemaVersion": 1,
  "state": "saved",
  "receipt": {
    "operationId": "83121a1b-189d-4bba-adfb-4cffcd380772",
    "entityType": "project",
    "entityId": "709b1b4a-510d-4fa6-abfd-d6a8135bb194",
    "version": "3",
    "replayed": false
  },
  "requestId": "opaque-correlation-id"
}
```

After uncertain transport, keep exactly the same operation/body. Do not immediately issue a new operation. Backend either replays a committed receipt or safely tries the uncommitted original. Receipts contain no frozen contact/message content. Notes share their parent's retention, not an indefinite audit lifetime.

## Errors and rate bounds

`{schemaVersion:1,error:{code,fields?,retryAfterMs?},requestId}`; no submitted values or SQL/provider errors echoed. Field errors use stable paths/codes and Claude localizes them.

| HTTP | Meaning |
|---|---|
| 400/422 | Invalid structure/field, unknown property, bad cursor/filter/state |
| 401 | Missing, incomplete, expired or revoked admin authentication |
| 403 | Valid identity lacks platform permission, CSRF/Origin fails, or recent factor required (`reauth_required`) |
| 404 | Object absent, expired or outside this server's configured source scope; no existence leak |
| 409 | Version changed, changed replay, duplicate case/source link or mismatched source incarnation |
| 413/415 | Body bound exceeded / non-JSON command |
| 429 | Rate limit, Retry-After supplied |
| 503 | Source/identity/audit/database unavailable; never false empty success |

Proposed v1 limits: authenticated reads60/minute/actor, writes10/minute/actor, detail reads20/minute/actor; login challenges10/minute/IP plus5/minute/approved actor; private source query timeout3seconds, HTTP handler budget5seconds. Use bounded shared PostgreSQL rate counters; do not add Redis for one operator. Audit failure blocks personal-detail disclosure and mutations. Rate-limit/store failure fails closed. Limits are proposals to verify with legitimate browser behavior, not current live settings.

## Future source summaries and actions

Add a separately versioned company-owned aggregate publisher only after its credential/identity/retention design is approved. It reports workspace/incarnation, monotonic revision, observedAt, readiness counts and safe worker summaries, with no employees or secrets. Reject stale/foreign/replayed incarnation facts. Do not give the admin all company DSNs or reuse a billing instance secret with policy-write capability.

No v1 route issues refunds, subscription changes, suspension, deletion, provider creation, email retries, credential resets or Owner impersonation. Later commands must return durable 202/receipt states, preserve original operation IDs, reconcile UNKNOWN and enforce source authority; they require an additional contract and acceptance gate.
