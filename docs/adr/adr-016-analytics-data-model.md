# ADR-016: Analytics Data Model — Event-Type + Scenario Composite Key

## Status
Accepted

## Date
2025-01-01

## Context
Axis cameras report multiple types of analytics events: people counting, vehicle detection, line crossing, occupancy, and others. Each event type can also be associated with a named scenario configured on the camera (e.g., "Entrance", "Parking Lot"). Initially the data model keyed analytics rows solely by `(camera_id, event_type)`, but it became clear that a single camera can have multiple independent scenarios of the same event type running simultaneously, producing separate counts that must not be merged.

A secondary concern is extensibility: Axis regularly introduces new analytics applications, and a database-level `ENUM` type for `event_type` would require a schema migration every time a new event type is encountered. Axis cameras also return vehicle-type breakdowns (car, truck, bus, motorcycle) as nested metadata within a counting event; this structured data does not fit cleanly into a flat relational schema.

The `scenario` dimension was identified after the initial schema design, requiring a migration to add the column.

## Decision
- Key all analytics rows by the composite `(camera_id, event_type, scenario)`.
- Validate `event_type` against an **application-level whitelist** in TypeScript rather than a database `ENUM` or `CHECK` constraint. This allows new event types to be supported by updating the whitelist constant without a schema migration.
- Store vehicle-type breakdowns and other structured per-event metadata in a `metadata` **JSON column** (`TEXT` in SQLite, parsed at the application layer).
- The `scenario` column was added via an `ensureColumn` inline migration function that executes `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` at server startup.

```typescript
// Application-level event type whitelist
export const VALID_EVENT_TYPES = [
  'people_counting',
  'vehicle_counting',
  'line_crossing',
  'occupancy',
  'object_detection',
] as const;

export type EventType = typeof VALID_EVENT_TYPES[number];

export function isValidEventType(value: string): value is EventType {
  return (VALID_EVENT_TYPES as readonly string[]).includes(value);
}
```

```typescript
// Metadata JSON column usage
interface AnalyticsEventMetadata {
  vehicleBreakdown?: {
    car?: number;
    truck?: number;
    bus?: number;
    motorcycle?: number;
  };
  direction?: 'in' | 'out';
  confidence?: number;
}
```

```typescript
// ensureColumn migration pattern
async function ensureColumn(
  db: Database,
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const columns = await db.all(`PRAGMA table_info(${table})`);
  const exists = columns.some((c: { name: string }) => c.name === column);
  if (!exists) {
    await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
```

## Consequences

### Positive
- The `(camera_id, event_type, scenario)` composite key correctly models the reality that one camera can emit multiple independent analytics streams simultaneously.
- Application-level `event_type` validation is more flexible than a DB enum; new Axis analytics applications are supported by a one-line code change.
- The `metadata` JSON column avoids table proliferation: vehicle breakdown data, direction flags, and future structured fields all fit without schema changes.
- `ensureColumn` enables additive schema changes without a full migration framework, appropriate for a small team without a dedicated DBA.

### Negative
- JSON column contents are opaque to SQL; queries that need to filter or aggregate on `metadata` fields (e.g., "total truck count across all cameras") require JSON extraction functions (`json_extract` in SQLite), which are harder to index efficiently.
- Application-level whitelist validation means invalid event types can only be caught after they reach the server; a DB constraint would reject them at the storage layer.
- The `scenario` column was added reactively rather than proactively, which caused a period of data inconsistency before the migration was deployed.

### Neutral
- SQLite's dynamic typing means the `metadata` JSON column stores text; the application is responsible for serialisation (`JSON.stringify`) and deserialisation (`JSON.parse`) with appropriate error handling for malformed data.
- The `ensureColumn` pattern is appropriate for additive changes (ADD COLUMN) but cannot handle destructive migrations (DROP COLUMN, RENAME COLUMN, change type). Those still require a manual migration script.

## Technical Debt
- **Inline `ALTER TABLE` migrations bypass drizzle-kit.** Drizzle ORM's migration tooling (`drizzle-kit generate` / `drizzle-kit migrate`) is unaware of columns added via `ensureColumn`. The authoritative schema definition in `shared/schema.ts` must be manually kept in sync with what `ensureColumn` adds at runtime. A future cleanup should either migrate `ensureColumn` calls into drizzle-kit migration files or remove Drizzle's schema definition for those columns and accept raw SQL for those fields.
- The JSON metadata column has no validation schema at the DB layer; invalid or unexpected metadata shapes can be silently stored. A Zod schema for metadata parsing at the application boundary is recommended.

## Related
- [ADR-015: Data Aggregation](adr-015-data-aggregation.md)
- [ADR-018: Historical Backfill](adr-018-historical-backfill.md)
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
