# Claude admin UI: running notes

November 12, 2026. Worktree `/Users/josek0514/Documents/Codex/VELANI-ADMIN-ui`, branch `claude/admin-ui-20261112`, based on `c08d233` (codex/admin-backend). UI only. No backend, auth, data or contract changes. Local commits only (AGENTS.md does not allow pushing UI branches).

## Step log

- Read AGENTS.md, docs/api-v1.md, the Codex handoff, qualification-sample.json, src/server/http.ts, reads.ts, commands/validation.ts and the source views to take exact shapes and error codes.
- Stack: the handoff says to build in this Next application. Added two browser-only dependencies, both required by the contract or the approved style: `@simplewebauthn/browser@14.0.0` (the contract asks for maintained WebAuthn helpers matching SimpleWebAuthn 14) and `@phosphor-icons/react@2.1.10` (Phosphor is the approved icon family). No other framework or CSS library.
