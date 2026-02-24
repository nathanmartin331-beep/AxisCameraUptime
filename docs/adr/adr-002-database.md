# ADR-002: Database — SQLite via better-sqlite3 + Drizzle ORM

## Status

Accepted

## Date

2025-01-01

## Context

The application must persist camera records, uptime history, analytics events, user accounts, and
session data for deployments potentially managing 2500+ cameras. Data access patterns are
predominantly synchronous within a single Node.js process — the camera monitor runs tight loops
of reads and batch writes, and API handlers are simple CRUD. A separate database server would
require additional infrastructure (Docker, a managed service, or a system daemon) and network
round-trips for every query, adding operational complexity that is disproportionate to the
scale of a self-hosted monitoring tool.

Evaluated alternatives:

- **PostgreSQL via Neon (serverless)**: The Replit scaffold installed `@neondatabase/serverless`
  and `drizzle-orm/neon-http`. Suitable for cloud deployments with a remote DB, but requires a
  running PostgreSQL instance or a Neon project. Neon's HTTP driver adds per-request latency.
- **PostgreSQL via `pg`**: Local Postgres daemon works for on-prem, but demands separate install,
  user provisioning, and connection pooling configuration for a self-hosted appliance.
- **Prisma**: Feature-rich ORM with migrations and a rich client. Heavier than needed, requires
  a separate migration workflow, and `prisma generate` step adds CI complexity.
- **Kysely**: Type-safe query builder without the magic of an ORM. Good fit, but more verbose for
  schema definition and no built-in migration tool.

## Decision

Use **SQLite** (file-backed) via **`better-sqlite3`** (synchronous Node.js bindings) with
**Drizzle ORM** for schema definition, type generation, and query building. The database file is
stored at the path specified by `DATABASE_URL` (defaults to `./camera_uptime.db`).

The database is opened at startup with the following PRAGMA configuration applied once:

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -65536;   -- 64 MB
PRAGMA foreign_keys = ON;
PRAGMA mmap_size = 268435456; -- 256 MB
```

Schema changes are applied via **`drizzle-kit push`** (schema-diff against the live DB) rather
than versioned migration files. Additional columns added post-scaffold are patched at startup
via inline `ensureColumn` calls using raw `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` SQL, which
Drizzle does not support natively.

## Consequences

### Positive

- Zero infrastructure: a single `.db` file is the entire database. Backup is a file copy.
- `better-sqlite3` synchronous API eliminates async/await overhead in tight polling loops,
  making batch writes measurably faster than an async client.
- Drizzle provides full TypeScript inference for query results and schema definitions with minimal
  magic — no code generation beyond type inference at build time.
- WAL mode allows concurrent reads while a write is in progress, preventing reader starvation
  during bulk cohort writes.
- `mmap_size` and enlarged `cache_size` reduce disk I/O for the large analytics tables.

### Negative

- SQLite is single-writer: all camera monitor batch writes are serialized. At very high camera
  counts this may become a bottleneck (though WAL mode substantially mitigates this).
- `drizzle-kit push` is a destructive command in production — it diffs the schema and issues DDL
  without a rollback mechanism. A future migration to numbered migration files is needed before
  any multi-instance or production hardening.
- `better-sqlite3` requires a native compilation step (`node-gyp`) which complicates Docker
  images and some CI environments.

### Neutral

- The `@neondatabase/serverless`, `drizzle-orm/neon-http`, `connect-pg-simple`, and `pg`
  packages remain installed from the Replit scaffold but are never imported. They should be
  removed to reduce attack surface and install time.
- SQLite is sufficient through at least 10,000 cameras at 5-minute poll intervals based on
  write throughput benchmarks; beyond that, a migration to PostgreSQL would reuse the Drizzle
  schema definitions with minimal changes.

## Technical Debt

1. **Dead Neon/PG dependencies**: `@neondatabase/serverless`, `drizzle-orm/neon-http`,
   `connect-pg-simple`, and related packages are installed but unused. Remove them.
2. **Inline `ensureColumn` migrations**: Several columns added after the initial scaffold are
   applied at server startup via raw `ALTER TABLE` SQL outside of Drizzle's awareness. These
   should be consolidated into numbered migration files managed by `drizzle-kit generate`.
3. **`drizzle-kit push` in production**: Replace with `drizzle-kit migrate` backed by a
   `./drizzle/` migrations directory before any multi-user or multi-instance deployment.

## Related

- ADR-001: Runtime Stack — Node.js + Express (ESM)
- ADR-003: Schema Design — Shared schema.ts as Single Source of Truth
- ADR-004: Repository Pattern — storage.ts as Data Access Layer
- ADR-007: Camera Polling — Cron + Cohort Staggering + p-limit
