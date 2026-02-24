# ADR-004: Repository Pattern — storage.ts as Data Access Layer

## Status

Accepted

## Date

2025-01-01

## Context

Early in development all database access was scattered directly in Express route handlers using
inline Drizzle queries. This made it difficult to:

- Test business logic without a real database connection.
- Reuse common query patterns (e.g., "get camera with decrypted password") across multiple
  route files.
- Change the underlying query implementation (e.g., swap Drizzle for raw SQL) without touching
  route handlers.
- Enforce consistent error handling and data transformation in one place.

As the number of routes grew (eventually reaching a monolithic 2238-line `routes.ts`), the lack
of a data access boundary made the codebase progressively harder to navigate.

## Decision

Introduce **`server/storage.ts`** as a centralized Data Access Layer (DAL). All database access
from route handlers is performed through a named method on the exported `storage` object (e.g.,
`storage.getCameras()`, `storage.updateCameraStatus()`, `storage.createUser()`).

The `storage` object implements the `IStorage` interface defined in the same file, which enables
mock substitution in unit tests without a database.

Key design rules:

- Route handlers import `storage` and call named methods. They do not import `db` (the Drizzle
  instance) directly.
- The `storage` methods handle all Drizzle query construction, result mapping, and
  credential encryption/decryption (delegating to `server/credentialEncryption.ts`).
- Insert and update methods accept typed objects derived from `shared/schema.ts` insert types,
  so schema changes propagate as type errors to callers.

**Exceptions permitted for performance-sensitive bulk operations:**

- `server/cameraMonitor.ts`: Uses `db.prepare()` (raw `better-sqlite3` statements) for the
  bulk uptime-entry insert loop executed every 5-minute polling cycle. The overhead of routing
  2500 inserts through `storage` method call dispatch is avoided.
- `server/dataAggregation.ts`: Uses raw prepared statements for the hourly/daily rollup
  aggregation queries that operate over large window ranges.

## Consequences

### Positive

- Route handlers are thin: they validate input, call a `storage` method, and return the result.
  Business logic and query construction live in one layer.
- `IStorage` enables unit testing of route logic with a simple in-memory mock, without spinning
  up a SQLite database.
- All credential decryption is centralized in `storage` — no route handler ever touches raw
  encrypted text.
- When `drizzle-orm` types change (e.g., after a schema migration), the compiler surface for
  fixing the breakage is limited to `storage.ts` rather than spread across all route files.

### Negative

- `storage.ts` is a single file covering all domains (cameras, users, analytics, sessions). It
  will grow large as new entities are added. A future refactor should split it into per-domain
  storage modules (e.g., `server/storage/cameras.ts`).
- The performance-sensitive exceptions (cameraMonitor, dataAggregation) use a different
  abstraction level (raw prepared statements via `better-sqlite3` API) than the rest of the
  codebase (Drizzle ORM). Developers must be aware that two abstraction levels exist and which
  to use in each context.

### Neutral

- The `IStorage` interface currently mirrors the `storage` object's method signatures 1:1. If
  the interface diverges from the implementation (e.g., multiple storage backends), it provides
  a clear contract; for now it is primarily useful for test mocking.

## Technical Debt

1. **Two abstraction levels**: `storage.ts` uses Drizzle ORM while `cameraMonitor.ts` and
   `dataAggregation.ts` use raw `better-sqlite3` prepared statements. Documenting which layer
   to use and why (performance justification) is the minimum; consolidating them behind a
   consistent interface is a longer-term goal.
2. **`storage.ts` monolith risk**: As more domains are added, the file risks exceeding the
   500-line limit. It should be refactored into per-domain modules under `server/storage/`
   before it becomes unwieldy.

## Related

- ADR-002: Database — SQLite via better-sqlite3 + Drizzle ORM
- ADR-003: Schema Design — Shared schema.ts as Single Source of Truth
- ADR-007: Camera Polling — Cron + Cohort Staggering + p-limit
- ADR-011: Routing — Module-Per-Domain Router
