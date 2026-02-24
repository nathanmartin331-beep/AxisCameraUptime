# ADR-018: Historical Backfill — Synthetic Events from Camera Uptime

## Status
Accepted

## Date
2025-01-01

## Context
When a camera is added to the monitoring system, the application has no historical uptime data for it. Without backfill, the camera displays 0% uptime and empty trend charts until the monitor has been polling it long enough to accumulate meaningful data. This creates a poor user experience and makes it impossible to evaluate a camera's reliability at the time it is added.

Axis cameras expose historical uptime information through multiple channels:
1. **VAPIX `uptimeSeconds`**: A single integer representing the total seconds since the last reboot. This implicitly encodes when the last reboot occurred.
2. **System log**: Axis cameras maintain an on-device system log that may contain historical boot and shutdown events with timestamps.
3. **TVPC (Third-party Video Platform Connector)**: Some Axis deployments use TVPC, which stores hourly historical data that can be imported.

The challenge is that "synthetic" events constructed from these sources are estimates, not direct observations. They must be clearly distinguished from directly-observed events to avoid misleading uptime calculations.

## Decision
Implement historical backfill via three ordered paths, executed on first successful camera poll:

**Path 1 — Primary: Reconstruct boot history from `uptimeSeconds`**

Query VAPIX for the current `uptimeSeconds` value. Subtract from the current timestamp to determine the most recent boot time. Create a series of synthetic uptime events from the boot time to the present at the same 5-minute polling interval used by the live monitor.

All synthetic events are flagged with `isSynthetic: true` in the database to distinguish them from directly-observed events.

```typescript
interface UptimeEvent {
  cameraId: number;
  timestamp: Date;
  status: 'online' | 'offline';
  isSynthetic: boolean;
  backfillSource?: 'uptime_seconds' | 'system_log' | 'tvpc';
}

async function backfillFromUptimeSeconds(
  cameraId: number,
  uptimeSeconds: number,
): Promise<void> {
  const bootTime = new Date(Date.now() - uptimeSeconds * 1000);
  const syntheticEvents = generatePollingSequence(bootTime, new Date(), {
    intervalMinutes: 5,
    status: 'online',
    isSynthetic: true,
    backfillSource: 'uptime_seconds',
  });
  await insertEvents(cameraId, syntheticEvents);
}
```

**Path 2 — Secondary: Parse system log for historical boot events**

If the system log is accessible via VAPIX (`/axis-cgi/systemlog.cgi`), parse it for boot event entries. Each identified boot event defines the start of an uptime window. Offline gaps between boot events are also recorded as synthetic offline events.

**Path 3 — Tertiary: TVPC hourly historical data import**

For deployments that use TVPC, import available hourly historical uptime records directly. TVPC data is considered higher-fidelity than synthetic reconstruction and takes precedence over Paths 1 and 2 for overlapping time windows.

The backfill runs **once** per camera (on initial successful connection) as a fire-and-forget background task. Re-running backfill on an already-populated camera is prevented by checking for existing events before the oldest backfill window.

## Consequences

### Positive
- Cameras added to the monitor immediately show historical uptime data rather than defaulting to 0%.
- Uptime trend charts are populated from day one, enabling meaningful SLA assessment at the time of addition.
- The `isSynthetic` flag ensures that reporting tools can either include or exclude synthetic events depending on the use case (e.g., exclude synthetic events from SLA breach calculations).
- The three-path approach provides progressive fidelity; TVPC data is used when available, falling back to log parsing, falling back to `uptimeSeconds` arithmetic.

### Negative
- Synthetic events derived from `uptimeSeconds` represent only the most recent continuous uptime window; any reboots before the current window are not reconstructed (the camera's entire reboot history is not available from this API alone).
- System log parsing is fragile; log format changes across firmware versions can break the parser silently.
- Backfill events may conflict with actual observations if the monitor is later run for an overlapping time period; a conflict-resolution strategy (prefer direct observation over synthetic) must be maintained.

### Neutral
- The backfill task is idempotent by design: running it twice on the same camera produces no duplicate rows due to the `INSERT OR IGNORE` deduplication on `(camera_id, timestamp)`.
- TVPC integration is optional and requires a separate TVPC endpoint configuration in user settings.
- The `backfillSource` field provides an audit trail for understanding the origin of each synthetic data point.

## Technical Debt
- The system log parser is tightly coupled to the Axis log format version present at the time of writing. A versioned parser registry or a more robust regex-based approach with fallback is recommended.
- Path 3 (TVPC import) is partially implemented; the import UI and scheduled re-import for ongoing TVPC-connected deployments are not yet complete.
- There is no automated test for the `generatePollingSequence` function that handles edge cases (daylight saving transitions, negative `uptimeSeconds` from firmware bugs, cameras that have been online for more than a year).

## Related
- [ADR-015: Data Aggregation](adr-015-data-aggregation.md)
- [ADR-016: Analytics Data Model](adr-016-analytics-data-model.md)
- [ADR-017: Network Discovery](adr-017-network-discovery.md)
