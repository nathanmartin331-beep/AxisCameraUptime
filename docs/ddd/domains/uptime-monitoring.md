# Domain: Uptime Monitoring

## Bounded Context

The Uptime Monitoring domain is responsible for continuously measuring whether each registered Axis camera is reachable and producing video. It runs a scheduled background poller, records status-change events, computes uptime percentages and reliability metrics, and broadcasts real-time status updates to connected clients.

This domain owns the entire observability pipeline for device health: from the raw HTTP probe against the camera's VAPIX `systemready.cgi` endpoint, through the event store, up to the tiered rollup aggregation and MTTR/MTBF metric calculations.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **UptimeEvent** | An immutable record of a status transition for a camera at a point in time. Contains `cameraId`, `timestamp`, and `status`. |
| **Status** | One of `"online"`, `"offline"`, or `"unknown"`. Written to both `UptimeEvent` and the camera's `currentStatus` field. |
| **VideoStatus** | One of `"video_ok"`, `"video_failed"`, or `"unknown"`. Tracks whether the MJPEG/JPEG endpoint returns a valid image. |
| **Poll Cycle** | A scheduled cron execution (every 5 minutes by default) that checks all cameras belonging to all users. |
| **Cohort Staggering** | Distributing polling across a time window to avoid thundering-herd bursts when many cameras are registered. |
| **systemready.cgi** | VAPIX endpoint that returns `systemready=yes|no` plus `uptime` (seconds) and `bootid` (reboot counter). |
| **Boot ID** | An integer from VAPIX that increments on each device reboot, enabling reliable reboot detection. |
| **Reboot Detection** | Comparing the current `bootId` to the last stored `lastBootAt` to detect a device restart. |
| **VAPIX Protocol Cache** | An in-memory map from camera IP to the detected VAPIX protocol variant (`json`, `legacy`, or `param`) used during probing. |
| **Uptime Percentage** | The fraction of monitored time during which a camera had `status = "online"`, expressed as 0–100. |
| **MTTR** | Mean Time To Repair — the average duration of an offline incident. |
| **MTBF** | Mean Time Between Failures — the average time between the end of one incident and the start of the next. |
| **History Backfill** | A one-time operation at startup (or on-demand) that reconstructs historical uptime events from VAPIX system logs and TVPC history. |
| **Tiered Rollup** | The aggregation process that compresses raw events into hourly and daily summary tables for query performance. |
| **Data Retention** | Automated deletion of events older than the user's configured `dataRetentionDays` window. |
| **SSE Broadcast** | Server-Sent Events stream that pushes status-change notifications to all subscribed browser clients in real time. |

---

## Aggregate Roots

### UptimeEvent
An immutable event record representing a status observation.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| cameraId | string | Foreign key to Camera |
| timestamp | Date | When the status was recorded |
| status | `"online"` \| `"offline"` \| `"unknown"` | Camera's observed state |
| responseTime | number \| null | HTTP round-trip time in milliseconds |

Events are only written when the status changes from the previous observation (delta encoding), except for the initial event on first poll.

---

## Value Objects

- **UptimeHourlySummary** — Aggregated record covering one clock hour: `cameraId`, `hourStart`, `onlineMinutes`, `offlineMinutes`, `maxResponseTime`.
- **UptimeDailySummary** — Aggregated record covering one calendar day: `cameraId`, `dayStart`, `uptimePercentage`, `incidentCount`, `totalDowntimeMinutes`.
- **ReliabilityMetrics** — Computed view object returned by the metrics API: `mttr`, `mtbf`, `incidentCount`, `avgResponseTime`, `slaCompliance`.
- **SystemReadyResponse** — Parsed result of a VAPIX `systemready.cgi` probe: `systemReady`, `uptime`, `bootId`.
- **VideoCheckResponse** — Result of a VAPIX video endpoint probe: `videoAvailable`, `responseTime`.

---

## Domain Events

| Event | Trigger | Consumer |
|-------|---------|---------|
| `CameraStatusChanged` | Poll cycle detects a transition | `statusBroadcaster` pushes SSE to all subscribed clients; `UptimeEvent` written to DB |
| `CameraRebootDetected` | `bootId` changes between polls | `camera.lastBootAt` updated; logged |
| `VideoStatusChanged` | Video probe result changes | `camera.videoStatus` updated |
| `UptimeEventsAggregated` | Tiered rollup cron | Hourly/daily summary rows written or updated |
| `OldEventsDeleted` | Data retention cron | Uptime events older than retention window purged |

---

## Anti-Corruption Layer

- **Protocol cache**: VAPIX protocol variants are cached per IP in memory. This shields the polling loop from having to renegotiate protocol on every cycle.
- **Concurrency limit**: `p-limit` caps parallel outbound HTTP probes at `POLL_CONCURRENCY` (default 25) to prevent overwhelming the network or the server's file descriptor limit.
- **Cohort staggering**: Cameras are spread across a poll window so the cron does not emit all requests simultaneously.
- **Model prefix normalisation**: `stripExCamPrefix()` sanitises explosion-proof housing model prefixes (e.g. `ExCam XF P1378` → `P1378`) before persistence.
- **Timeout and abort**: Each HTTP probe uses an `AbortController` with a hard timeout so a hung camera cannot block a poll slot indefinitely.
- **Batch DB writes**: Status updates are written in a single transaction batch after each poll cycle, not one-at-a-time.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/cameraMonitor.ts` | Core polling service: cron schedule, cohort staggering, VAPIX `systemready.cgi` probing, video health checks, reboot detection, batch DB writes, protocol cache, `checkAllCameras()` export |
| `server/uptimeCalculator.ts` | Pure function `calculateUptimeFromEvents()`: computes uptime percentage from a sorted event list and a time window |
| `server/reliabilityMetrics.ts` | `calculateCameraMetrics()`, `calculateSiteMetrics()`, `calculateNetworkMetrics()`: derive MTTR, MTBF, incident count, SLA compliance from event history |
| `server/services/historyBackfill.ts` | `backfillFromUptimeSeconds()`, `backfillFromSystemLog()`, `backfillFromTvpcHistory()`: reconstruct historical events from VAPIX data on camera first registration |
| `server/services/statusBroadcaster.ts` | In-process pub/sub for camera status changes; clients subscribe by user ID, updates are pushed as SSE |
| `server/services/dataAggregation.ts` | Tiered rollup: compresses raw uptime events into `uptime_hourly_summary` and `uptime_daily_summary` tables |
| `server/services/dataRetention.ts` | Periodic deletion of events and summaries that exceed the configured retention window |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/components/UptimeChart.tsx` | Recharts line/bar chart rendering daily uptime percentages for a single camera or all cameras |
| `client/src/pages/Reports.tsx` | Fleet-level uptime report: date range selection, per-camera table, CSV export trigger |
| `client/src/hooks/useStatusNotifications.ts` | SSE client hook that subscribes to the status broadcast stream and triggers React Query cache invalidations |

---

## API Endpoints

Uptime-related endpoints are hosted under camera routes (see Camera Registry) and reliability routes (see Dashboard). The following are the uptime-specific ones:

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/cameras/:id/events` | any | Raw uptime events for a camera within `?days=N` |
| GET | `/api/cameras/uptime/batch` | any | Bulk uptime percentages for all user cameras |
| GET | `/api/uptime/events` | any | All uptime events across all user cameras |
| GET | `/api/uptime/daily` | any | Daily average uptime chart data (optional `?cameraId=`) |
| GET | `/api/cameras/:id/uptime` | any | Single camera uptime percentage for `?days=N` |
| POST | `/api/cameras/:id/check` | any | Trigger an immediate manual check (enqueued) |
| GET | `/api/metrics/camera/:id` | any | MTTR, MTBF, incident count for a camera |
| GET | `/api/metrics/sites` | any | Per-site/location reliability metrics |
| GET | `/api/metrics/network` | any | Fleet-level network reliability metrics |

---

## Dependencies

### What this domain depends on
- **Camera Registry** — reads the camera list (`storage.getCamerasByUserId()`), reads camera credentials for VAPIX probes, writes `currentStatus`, `videoStatus`, `lastSeen`, `lastBootAt` back to the camera record
- **User Settings** — reads `pollingInterval` and `dataRetentionDays` to configure the cron schedule and retention window
- `server/services/digestAuth.ts` — VAPIX HTTP Digest authentication
- `server/services/cameraUrl.ts` — URL building and HTTPS dispatcher
- `server/encryption.ts` — Decrypting camera passwords before VAPIX calls
- `server/storage.ts` — Writing uptime events, reading events for metric calculations

### What depends on this domain
- **Dashboard & Observability** — reads online/offline camera counts, average uptime, and reliability metrics
- **Camera Registry** — camera routes surface uptime event queries
- **Import / Export** — reads uptime percentages for the uptime report CSV
- **User Settings** — provides the retention configuration that governs data deletion
