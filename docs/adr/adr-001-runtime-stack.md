# ADR-001: Runtime Stack — Node.js + Express (ESM)

## Status

Accepted

## Date

2025-01-01

## Context

The project requires an HTTP server to serve a REST API for camera management and a React-based
frontend for the dashboard UI. The server must handle concurrent polling of 2500+ cameras, stream
real-time status updates to browser clients, and serve static assets from a single deployable
process. The team needed a framework that is easy to deploy on a single self-hosted instance
without a container orchestrator, while remaining flexible enough for future changes.

Evaluated alternatives:

- **Fastify**: Better raw throughput than Express, schema-based validation built in, but smaller
  ecosystem of middleware and less team familiarity.
- **NestJS**: Opinionated structure and dependency injection suit large teams, but adds significant
  boilerplate and compile overhead for a single-instance tool.
- **Hono**: Modern, edge-first, minimal overhead, but very new and limited middleware ecosystem at
  the time of the decision.
- **Separate frontend/backend processes**: Clean separation of concerns but requires a reverse
  proxy, two process managers, and more complex deployment.

## Decision

Use **Express 4** as the HTTP framework with **ESM modules** (`"type": "module"` in package.json).
A single Node.js process serves both the JSON API and the compiled Vite/React static assets from
the `dist/public/` directory. TypeScript is compiled via `tsx` in development and `tsc` + `node`
in production.

Key choices:

- ESM (`import`/`export`) throughout — no CommonJS interop shims.
- `express.static` mounts the Vite build output under `/`.
- A catch-all `*` route returns `index.html` to support client-side routing.
- `tsx` watches server source in development; Vite dev server proxies API calls to the Express
  port via `vite.config.ts`.

## Consequences

### Positive

- Battle-tested framework with a large ecosystem of compatible middleware (Passport, helmet,
  cors, morgan, compression, etc.).
- Single-process deployment means one systemd unit, no orchestration layer, trivially simple
  `npm start`.
- ESM import graph enables tree-shaking and aligns with the modern Node.js module system.
- `tsx` provides fast development reload without a full build step.

### Negative

- Express 4 lacks native async error propagation; every async route handler must be wrapped or
  use an outer try/catch to pass errors to `next(err)`.
- ESM complicates a small number of older CommonJS-only npm packages that require `createRequire`
  workarounds.
- Static file serving from Express is less efficient than a dedicated CDN or nginx for high-traffic
  deployments.

### Neutral

- Express 5 (now stable) would provide native async error handling; migrating is low-risk but
  deferred until ecosystem middleware catches up.
- Vite dev server and Express dev server run on separate ports during development, requiring the
  proxy configuration in `vite.config.ts`.

## Technical Debt

The Replit scaffold that initialized this project pulled in `@neondatabase/serverless` and related
PostgreSQL packages that are never imported at runtime. These dead dependencies inflate
`node_modules` and create a misleading `package.json`. They should be removed in a future cleanup
pass once the PostgreSQL migration path is confirmed unnecessary.

## Related

- ADR-002: Database — SQLite via better-sqlite3 + Drizzle ORM
- ADR-005: Authentication — Passport Local + SQLite Sessions
- ADR-010: Real-Time Push — SSE over WebSocket
- ADR-011: Routing — Module-Per-Domain Router
