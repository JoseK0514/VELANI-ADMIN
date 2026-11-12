# Development is the primary working release — November 12, 2026

Owner decision from Jose: development will be treated as the main operational/acceptance release while Velani, NEVORA and the private admin are brought to readiness. Once the combined application works through the required flows, promote that verified source to the real main/production environment. Jose reports the services are not yet in regular customer use; that is planning context, not a substitute for inspecting actual data and traffic before changes.

## Instructions for Codex, Claude and future sessions

- Continue normal work on the development line or isolated branches based on its approved combined source. Preserve the other agent's work and fixed backend/UI contracts.
- Development is the current reference for integrating and accepting the product. Apply production standards: real authorization, least privilege, input validation, idempotency, safe failures, retention, backups, logs/alerts and spending limits. Fix material issues there before promotion.
- Claude owns UI and Codex owns backend/hosting unless explicitly reassigned. Acceptance must exercise the real combined UI/API and record the source, deployed configuration, data scope and observed results.
- Environment names remain truthful. A host called staging or a provider slot called Production does not change the actual environment binding. The current admin acceptance host is `https://admin-staging.thevelani.com`, using isolated staging stores and synthetic feeds. Its separate real production project remains paused.
- This decision does not itself authorize production deployment/unpausing, a main merge, public signup, real charges, new paid activation, copied production credentials/customer data, or weaker controls. Existing specific authorizations and aggregate budgets persist. Provider commercial-use requirements apply regardless of branch/host naming.
- Keep the real main/production environment stable and closed where it is already closed. Prepare its rollout and rollback in advance, then promote the exact verified release after Jose's approval; apply production-specific credentials/domains and repeat environment-specific acceptance.
- Report development readiness separately from production activation. State any remaining provider purchase, owner credential/biometric step, deployment approval or failed acceptance plainly. Do not call an unexecuted production step complete.

## Effect on the current admin task

Finish the authorized hosted staging tests and use that environment as the current working reference. Open internal saves only for the bounded synthetic acceptance and restore the closed-write configuration afterward unless Jose separately decides to operate with real internal records. Prepare the main/production release packet, including schedules/alerts and rollback, without activating that separate project. This preserves the original user-approved test scope while making the release direction explicit.

Canonical repository reference: this file and the matching section in AGENTS.md. Include this policy in subsequent Codex↔Claude handoffs so each side follows the same promotion sequence.
