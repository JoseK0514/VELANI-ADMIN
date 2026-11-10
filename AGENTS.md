# VELANI-ADMIN backend

This private admin is separate from the customer NEVORA app and public Shopify/Rondo service. Jose approved the investigation design and backend implementation on November10,2026; Claude owns UI. One platform owner initially. Development is the application line; use isolated worktrees and preserve others' work. No main merge, shared push, production activation or disclosure of live customer data follows from local tests.

Read docs/superpowers/specs/README.md and api-contract-draft.md. Maintain the fixed v1 API and conservative source authority: explicit read-only views, no customer APP/WORKER/provider secrets, no customer impersonation or payment/destructive commands. Contact provenance does not grant auth. Source/prospect expiry cannot reset on edits; client closure/reactivation follows the reviewed design. Secrets stay in approved stores. Build/start never migrate.

Use meaningful RED/GREEN regression tests and owned loopback PostgreSQL. Never use production credentials for tests or create a test-auth bypass in a deployable handler. Record task evidence, source/environment identities and exact qualification limits. New admin tables are internal; existing public contracts and NEVORA workforce retention are unchanged. Follow Jose's engineering agreements and applicable architecture/security/governance skills.
