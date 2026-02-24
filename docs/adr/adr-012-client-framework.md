# ADR-012: Client Framework — React 18 + Wouter

## Status
Accepted

## Date
2025-01-01

## Context
The project requires a single-page application to display camera uptime dashboards, analytics, and configuration. Routing, data-fetching, and global state management choices must be made. The application has approximately 10 top-level routes and no need for server-side rendering. Bundle size is a concern because the client is served from the same Express process that also handles the API; keeping the bundle lean reduces both download time and cognitive overhead.

Redux and similar global state managers add significant boilerplate for what is essentially a server-state-heavy application where most state can be derived from remote data queries.

## Decision
- Use **React 18** as the UI rendering library.
- Use **Wouter** (~2 KB) for client-side routing instead of React Router (~50 KB).
- Use **TanStack Query (React Query v5)** for all server-state management, configured with `staleTime: Infinity` and `refetchOnWindowFocus: false`.
- Do **not** introduce a global state manager (no Redux, no Zustand). Component-local state and TanStack Query's cache serve as the single source of truth.

```typescript
// Default QueryClient configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    },
  },
});
```

## Consequences

### Positive
- Wouter is a ~96% smaller dependency than React Router for equivalent routing needs at this scale.
- TanStack Query handles caching, background refetching, loading/error states, and request deduplication, eliminating the need for a Flux-style global store.
- `staleTime: Infinity` means cached data is never considered stale automatically, giving the application full control over when refetches occur — appropriate for camera-uptime data that is polled on a server schedule.
- `refetchOnWindowFocus: false` prevents noisy re-requests when users switch browser tabs.
- Fewer dependencies reduce the attack surface and simplify upgrades.

### Negative
- Wouter lacks advanced features present in React Router: nested layouts with loaders, data pre-fetching via route loaders, and scroll restoration. Adding those features requires custom implementation.
- `staleTime: Infinity` means stale data will persist until an explicit `invalidateQueries` call; developers must be disciplined about cache invalidation after mutations.
- No global state manager means any truly cross-cutting UI state (e.g., a global notification queue) must be managed through React Context or lifted state, which can become unwieldy if scope grows.

### Neutral
- TanStack Query's devtools are available in development for cache inspection.
- Wouter's API surface is intentionally minimal; the learning curve is low for developers already familiar with React Router.
- The absence of SSR is an accepted trade-off given this is an internal operations dashboard.

## Technical Debt
- If the application grows beyond ~20 routes or requires route-level data loaders, migrating from Wouter to React Router or a meta-framework (Next.js, Remix) will require a routing layer rewrite.
- The `staleTime: Infinity` default may mask data-freshness bugs; a future review of per-query stale times for critical data (e.g., live camera status) is advisable.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-013: UI Component Library](adr-013-ui-components.md)
- [ADR-014: Build Tooling](adr-014-build-tooling.md)
