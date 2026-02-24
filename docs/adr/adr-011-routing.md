# ADR-011: Routing — Module-Per-Domain Router

## Status

Accepted

## Date

2025-01-01

## Context

The application's original route definitions lived in a single file, `server/routes.ts`, which
grew to **2238 lines** as features were added. This caused several problems:

- **Merge conflicts**: Any two parallel feature branches touching routes would conflict on the
  same file.
- **Cognitive load**: Finding a specific endpoint required scrolling through thousands of lines
  or relying on editor search.
- **Testing difficulty**: Testing a subset of routes (e.g., only camera CRUD) required loading
  the entire monolithic router, including all its dependencies.
- **Violation of the 500-line limit** defined in CLAUDE.md, indicating the file had grown beyond
  its intended scope.

The project needed a routing structure that could accommodate future endpoint additions without
recreating the monolith problem.

## Decision

Split routes into **8 Express Router modules** organized by domain, located in
**`server/routes/`**, and mounted centrally in **`server/routes.ts`** (now a thin mounting file
of ~60 lines):

| Module file | Domain | Mounted at |
|---|---|---|
| `auth.ts` | Login, logout, session | `/api/auth` |
| `cameras.ts` | Camera CRUD, status, bulk ops | `/api/cameras` |
| `users.ts` | User management (admin only) | `/api/users` |
| `analytics.ts` | Analytics data queries | `/api/analytics` |
| `events.ts` | SSE event streams | `/api/events` |
| `settings.ts` | Application settings | `/api/settings` |
| `network.ts` | Network scan, discovery | `/api/network` |
| `reports.ts` | Export, uptime reports | `/api/reports` |

A **`server/routes/shared.ts`** module exports common middleware and Zod-based validator
factories used by multiple router modules (e.g., `validateBody`, `requireAuth`,
`requireAdmin`, `parsePaginationParams`). This avoids duplicating validation boilerplate in
each router.

Each router module:

- Imports only the dependencies it needs (`storage`, specific broadcaster instances, etc.).
- Applies its own auth middleware at the router level where all routes in the file share the
  same access requirements, or at the individual route level where requirements differ.
- Is independently importable for unit testing.

## Consequences

### Positive

- Each router file is bounded in size and focused on one domain. Adding a new endpoint means
  editing only the relevant router, not a 2000-line file.
- Parallel feature development on different domains no longer causes routine merge conflicts
  on the routes file.
- `shared.ts` provides a single place to update common validators or middleware logic.
- Domain-scoped routers make it straightforward to apply blanket auth policies: for example,
  `users.ts` applies `requireAdmin` at the router level, guaranteeing no unauthenticated
  access to any user management endpoint.
- Individual routers can be tested in isolation with `supertest` without mounting the full
  application.

### Negative

- The `server/routes.ts` mounting file must be updated whenever a new router module is added.
  This is a minor coupling point but is unavoidable with explicit mounting.
- Cross-domain operations (e.g., an endpoint that touches both cameras and analytics) must
  decide which router to live in, or be placed in a dedicated `server/routes/composite.ts`
  module. There is currently no convention for this.

### Neutral

- The `shared.ts` module is a shared-utility file rather than a domain module. It should be
  kept lean — only truly cross-cutting middleware and validator primitives belong there.
  Domain-specific validation logic belongs in the domain's own router file.
- The 8-router split reflects domains as they exist today. As new major features are added
  (e.g., alerting, integrations), new router modules should be created rather than expanding
  existing ones beyond the 500-line limit.

## Technical Debt

There is no significant debt introduced by this decision. The split was itself a debt-reduction
refactor of the original 2238-line monolith. The primary ongoing risk is the natural tendency
to add convenience endpoints to an existing router rather than creating a new one when a new
domain is introduced — this should be resisted.

## Related

- ADR-001: Runtime Stack — Node.js + Express (ESM)
- ADR-004: Repository Pattern — storage.ts as Data Access Layer
- ADR-005: Authentication — Passport Local + SQLite Sessions
- ADR-010: Real-Time Push — SSE over WebSocket
