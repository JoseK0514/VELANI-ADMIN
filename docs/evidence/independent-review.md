# Private admin backend — independent whole-branch review

codeQualityStatus: BLOCK
recommendation: REQUEST_CHANGES
Assessment: With fixes

## Scope and evidence

Reviewed base `7b2d173596b7c3253a6b10dd2a3ef103fb261eeb` through HEAD `f30f11c27e19bb246e997c73ee69a845ca77c692` in `/Users/josek0514/.codex/worktrees/velani-admin-backend-20261110`. The supplied `.superpowers/sdd/2026-11-10-private-admin-backend/review-7b2d173..f30f11c.diff` matches the committed diff with 20 context lines after its package header. Reviewed all production modules/schema/operator scripts, relevant tests and fixtures, approved spec/plan, fixed `docs/api-v1.md`, qualification artifacts, and progress ledger. No Ruling lines. The ledger is the supplied notepad. Subsequent AGENTS/handoff documentation changes belong to the parent; runtime source remained at the reviewed head.

No ULW plan exists (`ULW_LOOP_PLAN_MISSING`), so this is the required fallback report path. No source, index, branch, deployment, or external customer data was changed. Owned reproduction clusters were removed. Only this report was written.

Independent checks: 58 tests passed across 11 files (reads, commands, retention, auth, auth-security, HTTP, sources, operator, foundation, config, deadline); `tsc --noEmit --incremental false` passed; lint passed; committed diff whitespace check passed. Did not rerun build, compiled Next test, qualification workflow test or remote dependency audit. Inspected their code/evidence and the retained zero-vulnerability audit JSON; those are not fresh independent executions.

## Strengths

- Real signed OIDC/WebAuthn fixtures, authoritative session/generation rechecks, private Google-subject approval, and no deployable authentication bypass.
- Mutations, audit and minimal receipts share a transaction; duplicate operations serialize and changed replay is rejected. Sensitive commands recheck factor freshness.
- Source readers use restricted view roles, explicit schemas and identity binding; source messages stay on demand. Closure rejects missing/stale/incarnation-mismatched source evidence.
- Independent durable deletion journal, shared/exclusive barrier and crash/reconciliation tests address restoration resurrection. Prospect/source deadlines remain separate from engaged closure.
- Hosting preparation is expressly distinguished from live activation and acceptance.

## Findings

### CRITICAL

None found.

### HIGH / Important — R1: Timestamp conversion drops records between cursor pages

References: `src/server/reads.ts:441`, `src/server/sources/postgres.ts:118`; tuple comparison at `src/server/reads.ts:386`.

PostgreSQL stores microsecond timestamps, but both internal cursor creation and source item normalization pass them through JavaScript Date, truncating to milliseconds. The next query compares the truncated timestamp to the original database timestamp. All remaining records in that millisecond are skipped, regardless of the ID tie-breaker. This affects clients/projects/cases/activity and source pages. It undermines the promised stable pagination and makes records invisible to a user browsing the list.

Owned PostgreSQL reproduction with a real cryptographic login: insert two prospects at the same second plus `.123100` and `.123900`, with valid prospect deadlines. Read clients with limit 1, then use the returned cursor. Database count = 2; first page contains Newer at `.1239`; cursor carries `.123Z`; second page is empty and nextCursor is null. The older row is never served.

Smallest correction: preserve full PostgreSQL timestamp precision through the cursor boundary (including source item transformation), with a compatible validated representation. Alternatively use an identical precision-normalized ordering key in both ORDER BY and tuple comparison. Test complete page traversal with multiple distinct timestamps inside one millisecond and equal timestamps with differing IDs, including a source page.

### HIGH / Important — R5: Restoring auth tables revives revoked sessions and factors

References: `src/server/retention.ts:14`, `src/server/auth/service.ts:331`, `src/server/auth/operator.ts:70`, `docs/operations.md:35`.

The external restore barrier tracks only client/case deletion sequences. Session revocation, actor generation and passkey revocation exist exclusively in the restorable operations DB. Restore an earlier backup after logout or owner recovery, with no intervening business purge: both deletion watermarks still agree. A previously revoked, still-unexpired session token becomes valid again; restoring pre-recovery credential/generation state can likewise revive a lost factor. Runtime bindings do not detect a same-target logical restore. Generic disable-first rollback guidance does not require auth invalidation before re-enabling.

Focused owned DB reproduction using actual cryptographic login: capture session revoked_at=null, logout, observe `authentication_required`; restore that captured field (the relevant effect of restoring the earlier auth snapshot), then authenticate the same token and call ReadService through the real independent Retention.guard. Result: `restoredTokenBusinessRead ready` with journal unchanged. No token was printed. This is a logical restoration simulation, not a hosted backup qualification.

Smallest acceptable correction: make post-restore auth invalidation an explicit mandatory fail-closed activation gate. Prefer an authorization epoch outside the restorable DB checked by sessions/pending proofs/factors; alternatively require closed restore, private recover-owner and fresh enrollment, rotation of session/auth roots, and requalification before enabling, with an enforceable gate rather than optional advice. Include a regression restoring pre-logout and pre-recovery snapshots with an unchanged deletion journal. This must not be deferred as merely hosted backup testing: the current restored-state authorization behavior is demonstrably wrong.

### MEDIUM / Important — R2: Catalog join attaches an old incarnation to the current workplace

Reference: `src/server/reads.ts:198`.

Workplace enrichment matches catalog records solely on ID. A fresh catalog row for incarnation 1 is presented as current access on the same workplace ID at incarnation 2. The command closure path correctly rejects this mismatch, but the dashboard read path exposes trial/paid facts and enrollment identity from the previous incarnation as though applicable to the current one.

Owned admin DB/login reproduction with a controlled Sources boundary: workplace `{id:X, incarnation:"2"}` and fresh catalog `{id:X, incarnation:"1", trialEndsAt:tomorrow}` produced workplace incarnation 2 with `catalog.access:"trial"`. This exercised ReadService, not a live source. Production adapters validate each incarnation independently but do not join them, so they do not prevent this case.

Smallest correction: require matching environment and incarnation in addition to ID before using catalog facts; otherwise emit access unknown with partial/unknown coverage. Add a read regression using mismatched incarnations and fresh trial/paid evidence.

### MEDIUM / Important — R3: Incomplete catalog coverage becomes a verified zero trial count

References: `src/server/reads.ts:232` and `src/server/reads.ts:265`.

The trial count only tests whether the catalog page has more rows and whether returned rows are fresh. It never establishes that the catalog covers current canonical workplaces. An empty catalog passes `every(...)`, so the dashboard reports zero trials and ready/complete coverage even when registry workplaces are present. A partial subset likewise yields an understated count; orphan/old-incarnation catalog rows may overcount. This contradicts the requirement to expose unknown coverage instead of manufacturing metrics.

Owned admin DB/login reproduction with Sources returning workplace count 3 and an empty successful catalog page produced `trials:{value:0,unit:"workplaces",reason:null}` with workplace coverage complete and overall ready. Missing evidence was presented as a known zero.

Smallest correction: qualify the bounded catalog set against the bounded authoritative workplace ID/environment/incarnation set. Missing, mismatched, excess or unavailable coverage must make the metric null and coverage partial/unknown. A truly empty, verified workplace scope may yield zero. Test empty catalog/nonempty registry, partial coverage, orphan/mismatched rows, and verified empty scope.

### MEDIUM / Important — R4: Avoidable internal reparsing and oversized responsibility groups

References: `src/server/commands/execute.ts:65`, `src/server/commands/clients.ts:15`, `src/server/http.ts:150`, `src/server/reads.ts:66`, `src/server/auth/service.ts:23`.

The command boundary parses the payload, then dispatch passes it back as unknown and each handler parses the same schema again. This discards the typed command correlation and adds unnecessary internal validation. The skill-perspective size check also found 503 pure lines in HTTP, 447 in reads, 391 in auth service and 259 in source adapter, without size exceptions. HTTP combines body/proof parsing, cookies, limits, authentication routing and business routing; reads combines source composition, metrics and internal queries. These are maintainability findings, not evidence of an additional security exploit.

Correction: retain a discriminated typed command after the single boundary parse. Split distinct responsibilities when addressing the read defects, keeping behavior and public API stable; avoid broad unrelated refactors. This finding may be explicitly deferred by the executor, unlike R1–R3 and R5.

### LOW / Minor

None separately identified.

## Skill-perspective check

Ran using the installed `programming/SKILL.md`, its TypeScript reference, and `remove-ai-slops/SKILL.md` under `/Users/josek0514/.codex/plugins/cache/sisyphuslabs/omo/5.1.30/skills`. Applied their review criteria only; did not execute cleanup/delegation instructions. Approved repository stack takes precedence over generic tooling preferences.

The diff violates their single-boundary parsing/typed-dispatch and module-size perspectives (R4). The timestamp normalization also illustrates unnecessary lossy production normalization with a concrete correctness failure (R1). No deletion-only, prose-pinning, tautological, or solely implementation-constant tests were identified. Database migrations/grants, actual protocol proofs, rollback and erasure assertions exercise real behavior. Missing coverage is recorded with the concrete R1–R3 defects rather than treating green tests as complete acceptance.

## Rejected suspicion

Initially suspected SQL precedence in visibleClient. Actual owned DB reproduction disproved it: exact client detail, no-match search, ordinary pagination and completed-project exclusion all worked. It is NOT a finding.

## Recommendations and blockers

Fix R1–R3 and R5 and add the narrow behavioral regressions described above before approval. Preserve current authorization, retention and idempotency controls. R4 is a medium maintainability concern that can be explicitly deferred without pretending the skill check was clear. No additional reviewer dispatch is needed to establish these reproductions.

## Declined to judge

- Claude-owned UI, browser accessibility and visual behavior: outside this backend branch review.
- Live Google enrollment, hosted/source grants, cron ticks, restore qualification, spending headroom and actual Production pause state: intentionally unconfigured/unqualified and no external actions were authorized in this review. Local success does not close these activation gates.

## Assessment

Ready to merge: With fixes. Authentication, command atomicity and retention foundations have meaningful evidence, but pagination, source-truth read defects and restored authorization state prevent approval of the current contract implementation.

blockers: R1 cursor precision loss; R2 stale-incarnation catalog attachment; R3 unsupported trial count/coverage; R5 restored session/factor revocation bypass.
