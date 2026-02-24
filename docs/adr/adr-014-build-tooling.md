# ADR-014: Build Tooling — Vite + esbuild

## Status
Accepted

## Date
2025-01-01

## Context
The project is a monorepo containing a React client, an Express server, and a shared schema/types package. Each zone has different runtime targets (browser vs. Node.js) and different development ergonomics requirements (HMR for the client, fast restart for the server). A unified TypeScript configuration is desirable to reduce duplication, but browser and Node environments have different global type definitions that can conflict.

Webpack 5 is the incumbent standard but carries significant configuration overhead. Rollup is better suited to library bundling. ts-node has historically been slow to start for large projects. Vite offers near-instant HMR via native ESM and delegates heavy lifting to esbuild/Rollup under the hood.

## Decision
- Use **Vite 5** as the development server and production bundler for the **client** (`client/` zone).
- Use **esbuild** directly to produce the **server** production bundle (single CJS file for Node.js deployment).
- Use **tsx** (TypeScript execute, backed by esbuild) as the development runner for the server, enabling `--watch` restarts without a compilation step.
- Maintain a **single `tsconfig.json`** at the repository root covering all three zones, extended by zone-specific `tsconfig` files where necessary.
- Define path aliases in the root `tsconfig.json`:
  - `@/*` → `client/src/*`
  - `@shared/*` → `shared/*`

```json
// tsconfig.json path aliases
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["client/src/*"],
      "@shared/*": ["shared/*"]
    }
  }
}
```

```typescript
// vite.config.ts alias registration (mirrors tsconfig)
import path from 'path';
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
});
```

## Consequences

### Positive
- Vite provides sub-second HMR for the React client during development, dramatically improving the inner development loop.
- esbuild produces the server bundle in milliseconds, keeping CI build times short.
- tsx's esbuild-backed execution eliminates the cold-start penalty of ts-node for server development.
- A single `tsconfig.json` at the root ensures consistent compiler options (strict mode, target, lib) across all zones and prevents drift.
- Path aliases (`@/`, `@shared/`) enable clean imports without deep relative paths (`../../../`).
- No Webpack configuration file to maintain.

### Negative
- Vite uses Rollup for production builds and esbuild for dev transforms; there can be subtle differences in module resolution between dev and prod that are hard to debug.
- esbuild used directly for the server bundle does not perform full TypeScript type checking; type errors are only caught by a separate `tsc --noEmit` pass.
- tsx in watch mode does not perform type checking during development; type errors are silent until a build or explicit `tsc` run.

### Neutral
- The Vite dev server proxies API requests to the Express server during development; this proxy configuration lives in `vite.config.ts`.
- esbuild's server bundle output is a single CJS file; this is appropriate for containerised deployment but precludes tree-shaking of server-side dependencies.

## Technical Debt
- **Single `tsconfig.json` creates browser/Node globals tension.** The `lib` option must include both `dom` (for client code) and Node type declarations (`@types/node`). This means server code technically has access to browser globals (`window`, `document`) without a compile error, and vice versa. Zone-specific `tsconfig` files with `extends` would resolve this but add configuration complexity.
- If the server bundle grows large, switching to a proper bundler (Rollup with Node preset, or Vite in library mode) may be necessary to enable tree-shaking of server dependencies.
- The `tsx --watch` restart strategy restarts the entire process on any file change; a more surgical hot-reload mechanism (e.g., module-level reload) would further improve server dev ergonomics.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-012: Client Framework](adr-012-client-framework.md)
- [ADR-021: Monorepo Structure](adr-021-monorepo-structure.md)
