# ADR-015: Data Aggregation — Tiered Rollup

## Status
Accepted

## Date
2025-01-01

## Context
The monitoring system polls cameras every 5 minutes and stores raw events (uptime checks, analytics counts, line-crossing events) in SQLite. At the target scale of 2,500 cameras, this produces approximately 720,000 raw events per day (2,500 cameras × 12 polls/hour × 24 hours). Retaining all raw events indefinitely is impractical in SQLite at this volume; the database would grow by tens of millions of rows per month.

However, historical trend data (daily uptime percentages, event counts over 30 or 90 days) is a core product feature. A pure deletion strategy would destroy analytical value. A tiered rollup strategy preserves analytical value while controlling storage growth.

Dashboard features also require different time-resolution data:
- **Live Analytics card**: raw or near-raw resolution for the current hour.
- **Daily Trends chart**: daily aggregates over 30–90 days.
- **Historical table**: hourly aggregates over 48 hours.

## Decision
Implement a three-tier data pipeline:

| Tier | Table | Resolution | Retention |
|------|-------|------------|-----------|
| 1 | `uptime_events` / `analytics_events` | Raw (per-poll) | 6 hours |
| 2 | `hourly_summaries` | Hourly aggregate | 48 hours |
| 3 | `daily_summaries` | Daily aggregate | Permanent |

**Rollup mechanism:** A scheduled job (Node.js `cron`) runs at configurable intervals and executes raw SQL `INSERT OR REPLACE INTO ... SELECT` statements to aggregate from Tier 1 → Tier 2 and Tier 2 → Tier 3.

```sql
-- Example: Tier 1 → Tier 2 hourly rollup
INSERT OR REPLACE INTO hourly_summaries
  (camera_id, hour_bucket, event_type, scenario, count, metadata)
SELECT
  camera_id,
  strftime('%Y-%m-%dT%H:00:00', timestamp) AS hour_bucket,
  event_type,
  scenario,
  SUM(count) AS count,
  json_group_object(key, value) AS metadata
FROM analytics_events
WHERE timestamp >= datetime('now', '-48 hours')
GROUP BY camera_id, hour_bucket, event_type, scenario;
```

**Retention cleanup:** A separate scheduled job runs daily at **3:00 AM** (configurable per deployment) and deletes raw events older than 6 hours and hourly summaries older than 48 hours.

**Scale target:** 2,500 cameras × 12 polls/hour × 24 hours = **720,000 raw events/day**. At 6-hour retention, the raw tier holds a maximum of ~180,000 rows at any time — well within SQLite's operational range.

**Retention configurability:** Per-user retention overrides are stored in the `user_settings` table, allowing individual users or administrators to extend retention windows if their deployment warrants it.

## Consequences

### Positive
- Raw event volume is bounded; the raw tier never exceeds ~180,000 rows regardless of uptime.
- Daily summaries provide permanent historical trend data without unbounded storage growth.
- `INSERT OR REPLACE` with a composite unique key is idempotent; the rollup job can safely be re-run after a failure without producing duplicate rows.
- Tier separation allows each query to hit the most appropriate resolution: live dashboards read from Tier 1, trend charts from Tier 3.
- The daily 3 AM cleanup window minimises I/O contention during business hours.

### Negative
- Data at the boundary of a retention window is permanently deleted; there is no recovery path if the rollup job fails before aggregating raw events.
- The 6-hour raw retention window means raw event replay (e.g., re-aggregating with corrected logic) is only possible within that window.
- Three separate tables increase query complexity; joins or union queries are needed for time-range queries that span tier boundaries.

### Neutral
- SQLite's WAL mode is assumed for concurrent read/write access during rollup and dashboard queries.
- The cron schedule (3 AM cleanup, hourly rollup) is hardcoded as a starting point; production deployments should externalise this to an environment variable.
- A future migration to a time-series database (e.g., InfluxDB, TimescaleDB) would provide more sophisticated retention and downsampling policies but would add infrastructure complexity.

## Technical Debt
- **Raw SQL bypasses Drizzle ORM.** The rollup queries use raw `db.run()` / `db.all()` calls with hand-written SQL rather than Drizzle query builders. This means rollup queries are not type-checked at compile time and are not visible in Drizzle's schema introspection. A future refactor should either wrap these in typed query helpers or accept the maintenance burden of raw SQL with inline documentation.
- The retention configuration is stored per-user in `user_settings` but there is no UI for administrators to set a global default. A global configuration table or environment variable would be more appropriate for multi-tenant deployments.

## Related
- [ADR-001: Runtime Stack](adr-001-runtime-stack.md)
- [ADR-016: Analytics Data Model](adr-016-analytics-data-model.md)
- [ADR-018: Historical Backfill](adr-018-historical-backfill.md)
