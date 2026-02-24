# ADR-021: Monorepo Structure — Single Repo, Three Zones

## Status
Accepted

## Date
2025-01-01

## Context
The project comprises three distinct code zones: a React browser client, an Express Node.js server, and shared TypeScript types and schema definitions used by both. These zones must be developed together (API shape changes require coordinated client and server updates) but have different runtime targets, different dependency trees, and different build toolchains.

Options for organising these zones range from a fully-monolithic single module (no zone separation, all in `src/`) to fully-separate git repositories with a shared package published to npm. The team is small (one to three engineers) and the project is a single deployable unit; the overhead of multi-repo coordination is unjustified.

npm workspaces and specialised monorepo tools (Turborepo, Nx) provide dependency hoisting and task orchestration but add configuration complexity and tooling surface area that may not be warranted at this project scale.

## Decision
Organise the repository as a **single npm package** (no workspaces) with three logical zones:

| Zone | Directory | Contents |
|------|-----------|----------|
| Client | `client/` | React 18 application, Vite config, Tailwind, component source |
| Server | `server/` | Express application, VAPIX polling, database layer, API routes |
| Shared | `shared/` | Drizzle ORM schema, Zod validators, TypeScript type definitions used by both client and server |

**Build:**
- `npm run build` runs Vite for the client and esbuild for the server in sequence from a single root `package.json`.

**Install:**
- `npm install` at the repository root installs all dependencies for all zones from a single `node_modules/`.

**Path aliases** (see ADR-014):
- `@/` → `client/src/` for client-internal imports.
- `@shared/` → `shared/` for cross-zone imports of schema and types.

**No zone-crossing server imports from client code.** The client only imports from `@shared/`; it never imports from `server/`. Server code may import from `shared/`. This is enforced by convention (no tooling enforcement currently).

## Consequences

### Positive
- A single `npm install` and a single `npm run build` command cover the entire project; onboarding is frictionless.
- Shared types and schema changes are immediately visible to both client and server without a publish-and-update cycle.
- TypeScript path aliases make cross-zone imports readable and refactoring-safe.
- No monorepo tooling configuration to maintain (no `turbo.json`, no `nx.json`, no workspace `package.json` files).
- All code is in one git repository; PRs, history, and blame are unified.

### Negative
- A single `node_modules/` means all client and server dependencies are co-installed, including runtime server dependencies that will never be used in the browser. This can complicate dependency auditing.
- Without workspaces, it is not possible to publish any zone as a standalone npm package without restructuring.
- The absence of tooling-enforced zone boundaries means a developer could accidentally import server-side Node.js modules (`fs`, `path`, database clients) into client code, producing confusing build failures.
- A single `package.json` means `npm install` and `npm audit` run for the combined dependency tree; there is no way to audit the client bundle dependencies independently.

### Neutral
- The `shared/` zone is a TypeScript source directory, not a compiled package. Both the Vite client build and the esbuild server build resolve `@shared/` imports directly from source. This requires both build tools to be configured with the `@shared/` alias.
- Splitting into separate repos or workspaces in the future would require extracting `shared/` into a published package and updating all import paths — a non-trivial but straightforward refactor.

## Technical Debt
- **An unused `src/` directory exists at the repository root.** This appears to be a remnant of the initial project scaffold before the three-zone structure was adopted. It creates confusion for new contributors who may expect source code to live at `src/`. The directory should be removed if empty, or its contents relocated to the appropriate zone directory.
- There is no lint rule or TypeScript project reference that prevents client code from importing server-internal modules. A future improvement would add an ESLint `no-restricted-imports` rule or TypeScript project references with explicit `paths` exclusions to enforce the client → shared → server dependency direction.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-014: Build Tooling](adr-014-build-tooling.md)
- [ADR-013: UI Component Library](adr-013-ui-components.md)
