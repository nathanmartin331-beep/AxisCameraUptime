# ADR-022: Testing — Vitest Server-Only

## Status
Accepted

## Date
2025-01-01

## Context
The project requires automated testing to prevent regressions in business-critical logic: uptime calculation, analytics rollup, data aggregation, and API endpoint behaviour. Testing scope and tooling choices must be made for three possible layers:

1. **Server-side unit/integration tests**: Pure functions, service classes, database interaction, API route handlers.
2. **Client-side component tests**: React component rendering, user interactions, hook behaviour.
3. **End-to-end (E2E) tests**: Full browser-based tests covering complete user workflows.

Vitest is the natural choice for a Vite-based project: it shares the Vite configuration, supports native ESM, and has a Jest-compatible API. Jest would require additional Babel/transpilation configuration to handle the project's TypeScript and ESM setup.

A `.agentic-qe/` directory exists at the repository root suggesting that an AI-assisted QE workflow was explored but not completed. Playwright and Cypress were evaluated for E2E testing but not adopted in the initial implementation.

## Decision
- Use **Vitest** as the sole testing framework.
- Scope test discovery to `server/__tests__/**/*.test.ts` — server-side tests only.
- Run tests in the **Node.js environment** (`environment: 'node'` in `vitest.config.ts`), appropriate for server-side code.
- Collect coverage using the **v8** provider (`coverage.provider: 'v8'`), which uses Node.js's built-in V8 coverage instrumentation without requiring Babel instrumentation transforms.
- **No client-side component tests** in the current implementation.
- **No E2E tests** in the current implementation.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/__tests__/**'],
    },
  },
});
```

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

The test suite covers:
- Uptime calculation and percentage functions.
- Analytics data aggregation and rollup logic.
- Database query helpers and repository functions.
- API route handler logic (using `supertest` for HTTP-level integration tests).
- Data validation and sanitisation utilities.

## Consequences

### Positive
- Vitest's configuration reuses the Vite/TypeScript setup; no additional transpilation configuration is needed.
- v8 coverage provides accurate branch and statement coverage without instrumentation overhead.
- Scoping tests to `server/__tests__/` keeps the test suite fast and focused on the most critical business logic.
- Vitest's Jest-compatible API means test patterns (`describe`, `it`, `expect`, `vi.mock`) are familiar to any developer with Jest experience.
- Running in the Node.js environment means server tests can use actual SQLite database connections (in-memory or file-based) for realistic integration tests.

### Negative
- **No client-side tests** means React component logic, hooks, and UI interactions are entirely unverified by automated testing. Regressions in the client are only caught by manual testing.
- **No E2E tests** means complete user workflows (login → add camera → view dashboard → view analytics) have no automated verification. A breaking change in the API contract or routing could go undetected until manual QA.
- Test coverage metrics reflect only server-side code; the overall quality signal they provide is incomplete.

### Neutral
- The `.agentic-qe/` directory at the repository root indicates that AI-assisted QE tooling was investigated. Its presence without integration suggests either an abandoned experiment or work in progress. Clarifying its status and either committing to it or removing the directory is recommended.
- Vitest supports both jsdom and happy-dom browser environments; adding client component tests would require adding one of these environments and configuring React Testing Library, but would not require replacing Vitest.
- Playwright and Cypress are both compatible with this project's stack; either could be added as an E2E layer without conflicting with Vitest.

## Technical Debt
- **No client-side tests** is an accepted gap with known risk. Any future investment in test coverage should prioritise React component tests for the analytics dashboard components, which contain the most complex rendering and conditional logic.
- **No E2E tests** means the integration between client routing, API authentication, and the dashboard rendering is only verified manually. Adding a Playwright smoke test suite for the critical paths (login, camera list, analytics view) would significantly reduce regression risk.
- The `.agentic-qe/` directory is unexplored; if it contains a QE automation approach that was evaluated and rejected, that decision should be documented. If it represents future intent, it should be either completed or removed to avoid confusing contributors.
- Coverage thresholds are not enforced in CI. Adding minimum coverage gates (`coverage.thresholds.lines: 80`) would prevent the test suite from drifting below an acceptable baseline as the codebase grows.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-014: Build Tooling](adr-014-build-tooling.md)
- [ADR-021: Monorepo Structure](adr-021-monorepo-structure.md)
