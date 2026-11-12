# Claude admin UI: running notes

November 12, 2026. Worktree `/Users/josek0514/Documents/Codex/VELANI-ADMIN-ui`, branch `claude/admin-ui-20261112`, based on `c08d233` (codex/admin-backend). UI only. No backend, auth, data or contract changes. Local commits only (AGENTS.md does not allow pushing UI branches).

## Step log

- Read AGENTS.md, docs/api-v1.md, the Codex handoff, qualification-sample.json, src/server/http.ts, reads.ts, commands/validation.ts and the source views to take exact shapes and error codes.
- Stack: the handoff says to build in this Next application. Added two browser-only dependencies, both required by the contract or the approved style: `@simplewebauthn/browser@14.0.0` (the contract asks for maintained WebAuthn helpers matching SimpleWebAuthn 14) and `@phosphor-icons/react@2.1.10` (Phosphor is the approved icon family). No other framework or CSS library.
- Built src/ui (contract.ts, client.ts, fixtures-flag.ts, dev-fixtures.ts, copy.ts, shared.tsx, app.tsx, login.tsx, forms.tsx, parts.tsx, views.tsx, details.tsx), src/app/layout.tsx, src/app/[[...view]]/page.tsx, src/app/admin.css. Typecheck and lint clean. Unit tests in test/ui-contract.test.ts and test/ui-fixtures-guard.test.ts.
- Browser evidence: docs/handoffs/admin-ui-evidence-20261112/ (capture.mjs, results.json, screens/). Groups: states, login, views, forms, access, fixtures. Playwright answers /api/admin/v1 with fictional contract-shaped responses, except `state-closed-real-backend` (the real unconfigured backend, 503 admin_not_configured) and the `fixtures-*` shots (dev server started with NEXT_PUBLIC_ADMIN_DEV_FIXTURES=1). Passkey flows use a Chromium virtual authenticator.
- Next dev rewrites AGENTS.md and next-env.d.ts when it starts. Both are restored before every commit and are not part of this branch.

## Codex spec review (admin-spec-review.md, 2026-11-12), resolved in fcfa23f

1. Operation identity. Pending commands now live in an app-level store (`createOpsStore` in src/ui/shared.tsx), keyed per command slot, with operation ID, expected version, exact body and the typed values. `CommandForm` creates the command once per submit and only a definitive answer ends it. "Close and reload the record" closes the form and rereads, the command stays; the page shows "has no answer yet" with Review; reopening (Review or the normal button) shows the same locked command and "Retry the same save" resends it unchanged, so the server replay receipt settles it. It also survives leaving the page. "Edit again" exists only where the server said the command did not run (passkey check declined, 429).
2. Step-up. One path: `makeCommand` (shared.tsx) asks for the proof and resends the same request; the dialog now calls the gated `api`, so a 401 or a closed backend during step-up moves the whole app, ends the prompt and (closed, sign-out) clears lists, edits and pending commands. A cleared command cannot come back (store generation check).
3. 404. `useRead` keeps what is on screen only through transient failures (no answer, 503, 429). A 404, 403 or 400 replaces it, so the record, its forms and edit buttons are removed.
4. Tests. test/ui-form-lifecycle.test.ts renders the real AdminApp, detail views and CommandForm in jsdom with only fetch and the passkey prompt replaced (10 tests). `mustKeepOperation` is now what CommandForm uses. Dev dependencies added for this: jsdom, @types/react-dom.

## Checks (final)

- `npm run typecheck`, `npm run lint`: clean.
- `npm test`: 144 tests in 17 files pass (75 backend, 69 UI: ui-contract 54, ui-fixtures-guard 5, ui-form-lifecycle 10).
- `NEXT_PUBLIC_ADMIN_DEV_FIXTURES=1 npm run build`: passes; fixture module and sample text absent from .next/static and .next/server.
- Browser: see results.json for per-capture axe, overflow and console results at 1440 and 390 (1024 for overview, clients, client detail).

## Real navigation evidence and the layout move (after Codex follow-up on fcfa23f)

Test: `test/e2e/ui-navigation.e2e.mjs`, "pending operation survives real sidebar navigation". It runs the actual Next app in Chromium (Playwright), answers /api/admin/v1 in the browser with fictional responses, aborts the first `POST projects` (lost response), clicks the real sidebar Link to Integrations, clicks Clients, opens the client again, and compares both captured `POST projects` requests byte for byte. It also checks that no new GET session happened during navigation and that the document was not reloaded.

| Structure | Mode | Result |
|---|---|---|
| fcfa23f (AdminApp inside the catch-all page) | next start (production build) | FAIL: after navigating away and back the "has no answer yet" notice was gone; the pending command was lost |
| fcfa23f | next dev | FAIL: same |
| AdminApp in the root layout | next start | PASS at 1440 and 390: 2 sends, identical operation ID and body (IDs dbc45a82-c7fd-465a-ae50-de76e2ac37c5 and 9d16bd8c-1cbe-4f3d-a872-e9d8a7adb9f2 in the recorded run), 0 session checks during navigation, axe 0 |
| AdminApp in the root layout | next dev | PASS at 1440 and 390 |

So the page under the catch-all is replaced on real navigation in Next 16.4.6 here, in both modes. Smallest fix: `src/app/layout.tsx` now renders `<AdminApp />` and `src/app/[[...view]]/page.tsx` returns null. No other app code changed. The gate, session and pending-operation store now live at the persistent root layout, which also removes a sign-in recheck on every navigation.

Writes disabled: the contract exposes it as `capabilities.internalWrites: false` on GET /session (and 503 `writes_disabled` on a command). Second e2e test "writes disabled shows unavailable save controls with an explanation": New client and all five client actions are disabled with "Saving is turned off in this environment.", nothing is sent, axe 0, at 1440 and 390. Screens: screens/e2e-*.png.

Run: `npm run build && npm run test:e2e` (production build) or `npm run test:e2e:dev`. Playwright is not a repo dependency; set ADMIN_E2E_PLAYWRIGHT (a package.json whose node_modules has playwright and @axe-core/playwright) and ADMIN_E2E_CHROMIUM, or use the local defaults in the script. ADMIN_E2E_SHOTS=<dir> saves screenshots.

Correction noted: only Codex sends the two synthetic EN/ES client-hub submissions. The UI work sends no email of any kind.

Checks after this change: typecheck and lint clean; `npm test` 144 tests in 17 files; e2e 4 of 4 in next start and 4 of 4 in next dev.
