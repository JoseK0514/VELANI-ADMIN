Plan: docs/superpowers/plans/2026-11-10-private-admin-backend.md

User approved backend implementation of reviewed design; Claude owns UI. New repository development baseline7b2d173; detached worktree, no existing app source modified. Initial schema/config RED assertion evidence in /tmp/velani-admin-task1-red.log and /tmp/velani-admin-config-red.log. First harness attempt preceded completed dependency installation and failed module load; it is not counted as behavioral RED. Qualified later REDs and final GREEN retained.

Pre-flight: Task1 AdminConfig/pool/schema -> Tasks2–5: matching types, no authority overlap. Task2 Actor/current auth -> Tasks3–5: all access server-derived. Task3 Sources -> Task4 closure/provenance: uncertainty fails closed. Task4 receipts/versions -> Task5 HTTP: child commands use parent version; no auto-new op on retry. Task5 retention ->Task6 deployment: independent deletion journal required before restore can serve old data.
Task 1: complete (commits 7b2d173..9c23c08, tests: npm test →    Duration  330ms (tests 89%, import 8%, transform 2%, worker 1%))
Task 2: complete (commits 9c23c08..885a080, tests: npm test →    Duration  2.79s (tests 90%, import 9%, transform 1%))
Task 3: complete (commits 885a080..7a70af2, tests: npm test →              at least ~255ms faster with isolate: false — reuses workers across files instead of one per file)
Task 4: complete (commits 7a70af2..5ece99e, tests: npm test →              at least ~298ms faster with isolate: false — reuses workers across files instead of one per file)
Task 5: complete (commits 5ece99e..c60a7e6, tests: npm test →              at least ~462ms faster with isolate: false — reuses workers across files instead of one per file)
Task 6: complete (commits c60a7e6..f30f11c, tests: npm test →              at least ~517ms faster with isolate: false — reuses workers across files instead of one per file)
Task6 hosting receipts: new isolated velani-admin prj_c6aunTwnTZVBglfKUGTtPXhvmrJu. CLI first no-target upload unexpectedly assigned Production; cancellation arrived after READY. Backend503 admin_not_configured observed with no app env values. Public302 Vercel auth. Pause CLI requires direct user confirmation; async question pending. Own automatic bypass revoked; remaining0. Subsequent explicit Preview READY Node24.x. No paid resource, source grant, custom domain or live Google identity activated. Hosted uploads predate final fixes and are closed preparation only; not claimed as launch acceptance.
Final review dispatched once to admin_final_review, read-only gpt-6-astra, range7b2d173..f30f11c. Await terminal result; no parallel implementers.
Final review: initial BLOCK on R1,R2,R3,R5. R4 regraded minor maintainability and deferred; no demonstrated behavior/security defect warrants broad splitting in this correctness pass.
Final: Ruling: keep Claude-owned UI outside backend qualification — explicit user ownership — visual/mobile/keyboard acceptance remains unverified.
Final: Ruling: keep live identity/source/hosting/cron/backup/budget/pause states as activation gates — local fixtures cannot prove provider operation — live service readiness remains unverified.
Final: Ruling: supported restores must first advance the independent authorization fence, rotate auth roots and re-enroll — arbitrary provider-owner SQL cannot be inferred from restorable DB contents — restores outside this mandatory private runbook are not qualified.
Final: minor (deferred): R4 internal reparsing and module-size cleanup; existing behavior tests pass, cleanup remains future maintainability work.
Final: fixed R1 — internal and source full cursor traversal within one millisecond and equal timestamps RED→GREEN; suite75/75.
Final: fixed R2 — fresh trial/paid facts with wrong incarnation become unknown/partial RED→GREEN; suite75/75.
Final: fixed R3 — missing/subset/orphan/old-incarnation coverage null/partial, verified-empty0 RED→GREEN; suite75/75.
Final: fixed R5 — restored pre-logout/pre-recovery state remains fenced with unchanged deletion journal; old roots rejected, credentials/proofs reset and fresh factors verified RED→GREEN; suite75/75.
Final integration: keep local codex/admin-backend branch/worktree for Claude; no merge/push. Corrected closed Preview READY, source91289f2, Node24.x. Application env keys0, bypasses0, public302. Production pausefalse awaiting direct confirmation. No live activation claimed.

Authorized pause follow-up 2026-11-10T16:25:05.150240+00:00: Jose delegated the requested velani-admin Production pause. Completed the dashboard project-name confirmation, observed the paused banner and Resume Project control, and verified project API paused=true. Preview/data/settings unaffected. App env keys0 and automation bypasses0. Screenshot: vercel-admin-paused-20261110.png. No application source changed.
