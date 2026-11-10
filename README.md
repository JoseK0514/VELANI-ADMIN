# Velani private admin backend

One private admin for Jose, with separate NEVORA and Velani sections. This repository contains the backend; Claude owns the interface. Customer workforce, Shopify, Rondo and commerce APIs remain separate.

Start with [the Claude handoff](docs/handoffs/2026-11-10-codex-to-claude-admin.md), [API v1](docs/api-v1.md), and [operations](docs/operations.md). The approved investigation is retained under docs/superpowers/specs; its historical draft status does not override the later implementation approval.

Node 24.x. `npm ci --ignore-scripts`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`. Tests start their own loopback PostgreSQL and refuse inherited database URLs. Set ADMIN_TEST_PG_BIN to an existing PostgreSQL bin directory when the local default is unavailable. Build before the test suite: its Next transport check starts the compiled application. Build/start never migrate.

The hosted project is closed and unconfigured. No customer data, Google OAuth secret, source credentials or paid admin database has been activated. See the qualification report for exact local, hosted and pending states. No UI screens were created.
