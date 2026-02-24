# ADR-003: Schema Design — Shared schema.ts as Single Source of Truth

## Status

Accepted

## Date

2025-01-01

## Context

The application has both a server (Node.js/Express) and a client (React/Vite) that share common
data shapes: camera records, uptime entries, user objects, analytics events, and API response
bodies. Without a shared definition, types drift — the server serializes a field the client does
not know about, or a client form submits a shape the server rejects. This manifests as runtime
errors rather than compile-time errors, making them harder to catch in development.

The project also needs runtime validation at API boundaries (incoming JSON bodies, query params)
in addition to static TypeScript types, because TypeScript types are erased at runtime.

## Decision

All database table definitions, TypeScript interfaces, and Zod validation schemas are co-located
in a single file: **`shared/schema.ts`**. This file is imported by both `server/` modules and
`client/` components via the `@shared/` path alias configured in `vite.config.ts` and
`tsconfig.json`.

Key schema design choices:

- **UUID primary keys** (`$defaultFn(() => randomUUID())`): avoids sequential ID enumeration,
  works across future distributed scenarios, and avoids integer overflow for large analytics
  tables.
- **Timestamps as integers** (Unix milliseconds via `integer('...')` in Drizzle): SQLite stores
  integers efficiently; JavaScript `Date` construction from a millisecond integer is one
  expression. ISO string columns were avoided to prevent timezone ambiguity.
- **Encrypted credentials**: Camera passwords are stored in the `cameras` table as an encrypted
  string (see ADR-006). The schema type is `text`, and the application layer handles
  encrypt/decrypt transparently.
- **Capabilities as JSON blob**: Camera capability flags (PTZ support, analytics types,
  supported VAPIX APIs) are stored as a `text` column containing a JSON array and parsed at
  the application layer. This avoids a capabilities join table for what is essentially a
  read-once, rarely-updated property.
- **Tiered rollup tables**: Raw poll results are written to `uptime_entries` (one row per poll
  per camera). A background aggregation job rolls these into `hourly_stats` and `daily_stats`
  tables to support efficient trend queries without full-table scans over millions of raw rows.

## Consequences

### Positive

- Single source of truth eliminates type drift between client and server.
- Zod schemas in `shared/schema.ts` are used directly for API body validation (`z.parse`) on
  the server, ensuring the validated TypeScript type matches the declared schema.
- `drizzle-orm`'s `InferSelectModel` and `InferInsertModel` derive TypeScript types directly
  from table definitions, so the schema, types, and validators stay in sync with one source
  edit.
- The `@shared/` alias works identically in Vite's browser build and in `tsx` / `tsc` server
  builds, so no duplication or copy step is needed.

### Negative

- `shared/schema.ts` grows as the schema grows. It is currently approaching the 500-line limit
  set in CLAUDE.md. If the schema continues to expand it will need to be split into domain
  modules (e.g. `shared/schema/cameras.ts`, `shared/schema/analytics.ts`).
- Coupling client and server to a shared file means a schema change requires coordination of
  both ends. In a micro-service architecture this would be an API contract versioning problem;
  here it is acceptable because client and server are always deployed together.

### Neutral

- The JSON blob for capabilities trades query flexibility for schema simplicity. If capability
  filtering in SQL becomes necessary, the blob should be normalized into a join table.
- Integer timestamps require explicit conversion to `Date` objects in display code; this is a
  minor ergonomic trade-off compared to storing ISO strings.

## Technical Debt

1. **Inline `ensureColumn` migrations**: Several columns added post-scaffold are not reflected
   in `shared/schema.ts` and are instead patched at startup with raw `ALTER TABLE` SQL. The
   schema file must be updated to include these columns so Drizzle type inference stays accurate.
2. **Schema file size**: As the system grows, `shared/schema.ts` should be split by domain
   before it substantially exceeds 500 lines.

## Related

- ADR-002: Database — SQLite via better-sqlite3 + Drizzle ORM
- ADR-004: Repository Pattern — storage.ts as Data Access Layer
- ADR-006: Credential Encryption — AES-256-GCM at Rest
