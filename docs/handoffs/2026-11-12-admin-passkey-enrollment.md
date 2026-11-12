# Staging owner passkey enrollment — November 12, 2026

Scope: real owner credential enrollment at `https://admin-staging.thevelani.com`. Production remains paused. No application code or API contract changes.

The original enrollment expired with zero registered factors. With Jose present at the Mac, the supported recovery procedure closed the independent authorization fence, advanced staging epoch 1 to 2, rotated the three staging auth roots through sensitive Vercel environment variables, and deployed the unchanged reviewed application from source `e63e828ccf552f620ac4e7a3b421a50c170c7e9e`. Deployment `dpl_GvN3yUjMwMGQ7AbYL1mW129b4Zx2` is READY and aliased to the staging origin. No raw secret was displayed or saved locally.

Private owner operations verified exact staging bindings, an already bound Google owner, zero existing active factors/sessions, and matching independent/local deletion watermarks of 2. Recovery invalidated expired pending login/challenge metadata, preserved the bound Google identity, advanced owner generation to 2 and opened enrollment until `2026-11-12T13:42:21.418Z`. The independent fence then reopened with the new fingerprints; epoch 2 and recovery_pending=false were read back. Fresh Google sign-in succeeded and created a fresh pending login.

Jose created the primary credential himself through the Mac prompt. Safari advanced to “Add your backup passkey,” and an independent SQL read confirmed exactly one active, distinct credential. A repeated primary attempt was rejected as already saved; it did not create a second credential. The selected Bitwarden backup could not proceed because Jose did not remember the vault master password. Its official hint form was opened in a separate Safari tab; the Velani enrollment tab was preserved. No vault reset, deletion, password change, or substitute credential was performed by Codex.

Earlier checkpoint (superseded by completion below): **primary registered; independent backup and authenticated sign-in pending**. No business session or CRUD acceptance is claimed. Business writes remain disabled. Do not reopen or bypass the enrollment window with an ad hoc timestamp change. If it expires before a second factor is registered, use the supported private recovery procedure again when Jose and an independent backup provider are ready. Staging credentials do not enroll the separate production relying party.

At `2026-11-12T13:42:16.038Z`, readback still showed one active/distinct factor, one factor-enrolled audit receipt, zero active business sessions and zero signed-in receipts. The renewed window subsequently expired while Jose requested help with Bitwarden's password hint. Wait until an independent backup is ready before another recovery; that supported procedure revokes previous site registrations and requires fresh enrollment. Do not mistake the saved Apple Passwords entry for a fully accepted account.

## Completed owner enrollment and sign-in

Jose could not recover the old Bitwarden master password, then explicitly chose a new free account while preserving the old vault. Codex prepared the signup with optional marketing unchecked; Jose completed the account, new master password and extension login himself. The new empty web vault and authenticated Safari extension were observed. No paid plan, vault deletion or reset occurred.

Jose explicitly approved restarting expired staging enrollment, including revocation of the earlier partial site registration. The same guarded private recovery procedure advanced staging epoch/generation to3, rotated the three staging roots in the existing approved store and deployed source `74c9fbc2fe3a991ccf6b7c0d917aad878e7f3ea4`. New deployment **dpl_2TSErQebj3tgQf3iPDiqMr5rnkW5** is READY and aliased to the staging origin. Vercel's `meta.gitCommitSha` matches that source; the optional custom `meta.sourceSha` has a typing error (`74c9fbcb`) and must not be used as source proof. No application code changed. Enrollment reopened until `2026-11-12T14:07:00.627Z`, after fresh Google proof.

The new Bitwarden vault obtained a Velani passkey and the server recorded one active factor. A second Bitwarden save prompt reported an existing Velani item. Codex selected its non-saving provider navigation, “Use your device or hardware key” → “Just once,” to open the native Apple sheet. The sheet explicitly stated the staging host, owner email and Save In: Passwords. Jose clicked Continue and approved the credential save himself. Safari then visibly showed **Overview**, **Platform owner · Staging**, the owner email and Sign out. It was left open and signed in.

Independent SQL readback at **2026-11-12T13:57:46.832Z**:

- Authorization epoch3; owner generation3; independent recovery_pending=false; deletion watermark2.
- **2 active, distinct credential IDs**;1 revoked earlier partial credential.
- **1 active business session**, signed-in audit count1, latest factor proof `2026-11-12T13:56:58.792Z`.
- Factor-enrolled audit count3 includes the revoked initial registration and two current registrations.

**Staging passkey enrollment and one real UI/API sign-in are complete.** Provider observations establish Bitwarden plus Apple Passwords; no raw private key, credential ID, session token, master password or code was displayed. Separate sign-ins using each individual factor and a second-device recovery were not independently exercised. The UI's first/second registration order does not create different authorization privileges.

Production project `velani-admin` was independently read back as paused=true after staging acceptance. No production deploy/unpause or production passkey enrollment occurred. Staging business writes stay disabled; broader authenticated CRUD/conflict/step-up/logout acceptance remains a separate next step. Configuration-only verification used provider deployment readback, Safari and explicit-store SQL; documentation JSON parses and git diff --check passed. No new full-suite test claim.
