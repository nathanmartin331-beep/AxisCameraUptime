# Domain: Analytics

## Bounded Context

The Analytics domain collects, stores, and surfaces behavioural data produced by the analytics ACAPs (Application Client and Platform) installed on Axis cameras. It is responsible for polling each camera's VAPIX analytics endpoints on a regular schedule, persisting the resulting counts, and streaming live updates to the browser via Server-Sent Events.

This domain owns the analytics event store, the polling loop, the SSE broadcaster, and the API layer that serves both per-camera and group-level analytics queries.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **AnalyticsEvent** | A timestamped measurement record for a specific event type on a specific camera (e.g. `people_in = 14` at 10:30). |
| **Event Type** | The classification of an analytics measurement: `occupancy`, `people_in`, `people_out`, `line_crossing`, `avg_dwell_time`. |
| **Scenario** | A named counting zone or line configured on the camera (e.g. `"Entrance"`, `"Zone A"`). Multiple scenarios can exist per camera per event type. |
| **ACAP** | Axis Camera Application Platform — a sandboxed app running on the camera that provides analytics capabilities. |
| **People Counter** | ACAP that counts people entering/leaving a defined zone. VAPIX endpoint: `GET /local/peoplecounter/query.cgi`. |
| **Occupancy Estimator** | ACAP that estimates current room occupancy. VAPIX endpoint: `GET /local/occupancy/.api`. |
| **AOA** | Axis Object Analytics — provides line crossing counts and zone-based counting. VAPIX endpoint: SOAP-based `getAccumulatedCounts`. |
| **TVPC** | Third-party Visual People Counter. VAPIX endpoint variant used for people counting on cameras without dedicated ACAP. |
| **Line Crossing** | An event type generated when an object crosses a defined line. Tracked via AOA scenarios. |
| **Analytics Poller** | The background cron service that iterates over analytics-enabled cameras and collects current counts. |
| **Analytics Broadcaster** | In-process pub/sub bus that pushes freshly polled analytics payloads to SSE-connected clients. |
| **Probe** | A one-time VAPIX interrogation to discover which analytics ACAPs and scenarios are installed on a camera. Initiated by the Camera Registry domain on admin request. |
| **AnalyticsHourlySummary** | Aggregated table row holding max/avg values for a camera+event_type combination within a single clock hour. |
| **AnalyticsDailySummary** | Aggregated table row holding max/avg values for a camera+event_type combination within a calendar day. |
| **AOA Failure Cache** | A temporary suppression map (camera IP → first-failure timestamp, TTL 1 hour) that prevents repeated error log spam when a camera's AOA endpoint returns 2003. |

---

## Aggregate Roots

### AnalyticsEvent
The fundamental record of an analytics observation.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| cameraId | string | Foreign key to Camera |
| timestamp | Date | When the value was recorded |
| eventType | string | One of the five event type values |
| value | number | The measured count or estimate |
| metadata | JSON \| null | Includes `scenario` name, vehicle type breakdown, and other ACAP-specific fields |

---

## Value Objects

- **Scenario** — Named counting zone or line. Derived from `metadata.scenario` on events; not a standalone persistent entity. Multiple scenarios aggregate into a total for display.
- **AnalyticsHourlySummary** — DB row: `camera_id`, `event_type`, `hour_start` (unix timestamp), `max_value`, `avg_value`, `sample_count`.
- **AnalyticsDailySummary** — DB row: `camera_id`, `event_type`, `day_start` (unix timestamp), `max_value`, `avg_value`, `sample_count`.
- **GroupAnalyticsSummary** — Computed response object: aggregated totals for all cameras in a group (`totalIn`, `totalOut`, `currentOccupancy`, per-camera breakdown).

---

## Domain Events

| Event | Trigger | Consumer |
|-------|---------|---------|
| `AnalyticsDataReceived` | Analytics poller completes a camera poll | `analyticsBroadcaster` fans out to SSE subscribers; event persisted to DB |
| `AnalyticsHourlySummarised` | Tiered aggregation cron | `analytics_hourly_summary` row written/updated |
| `AnalyticsDailySummarised` | Tiered aggregation cron | `analytics_daily_summary` row written/updated |
| `AnalyticsCapabilitiesProbed` | Camera Registry triggers `probe-analytics` | Analytics poller's `probeAnalyticsCapabilities()` result stored in Camera capabilities |

---

## Anti-Corruption Layer

- **Capability guard**: The analytics poller only processes cameras where `enabledAnalytics` has at least one feature set to `true` in the camera capabilities blob. Cameras without a completed probe are skipped.
- **AOA failure suppression**: The `aoaCountsFailedCache` map (IP → first-failure timestamp) prevents the same 2003 error from being logged more than once per hour per camera.
- **Scenario deduplication**: The `analyticsRoutes.ts` endpoint deduplicates scenario events by name, taking the highest value for each scenario, before returning them to clients. This prevents double-counting that would otherwise occur from multiple raw event rows.
- **Concurrency limit**: `p-limit` caps parallel analytics probes at `ANALYTICS_CONCURRENCY` (default 25) to protect the network.
- **SSE ownership check**: The stream endpoints verify `camera.userId === getUserId(req)` before subscribing a client to a camera's event stream.
- **Event type whitelist**: All analytics query endpoints validate `eventType` against the five known values before querying the DB.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/services/analyticsPoller.ts` | Core polling loop: cron schedule, per-ACAP query functions (`queryPeopleCounter`, `queryOccupancyEstimator`, `queryObjectAnalytics`, `queryTVPC`), `probeAnalyticsCapabilities()`, batch write to `analytics_events` |
| `server/services/analyticsEventBroadcaster.ts` | In-process pub/sub: `subscribe(cameraId, callback)`, `subscribeAll(callback)`, `unsubscribe()`; pushes payloads from poller to SSE handlers |
| `server/routes/analyticsRoutes.ts` | REST and SSE endpoints: per-camera current analytics, daily history, per-camera SSE stream, all-camera SSE stream, group analytics summary, group analytics trend |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/components/analytics/AnalyticsSection.tsx` | Container component on the Camera Detail page. Renders live and historical analytics cards, handles analytics type selection |
| `client/src/components/analytics/LiveAnalyticsCard.tsx` | Displays current counts for a single event type (e.g. current occupancy). Subscribes to the SSE stream for real-time updates. Deduplicates scenario cards. |
| `client/src/components/analytics/DailyTrendsChart.tsx` | Bar/line chart showing per-day totals for a selected event type over a configurable range. Uses deduplicated scenario aggregation to match live counts. |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/cameras/:id/analytics` | any | Current analytics for a camera: latest value, per-scenario breakdown, total. Supports `?eventType=` and `?days=` |
| GET | `/api/cameras/:id/analytics/daily` | any | Daily totals for a camera. Supports `?eventType=` and `?days=` (max 90). Returns `dailyTotals` and optional `scenarioTotals` |
| GET | `/api/analytics/stream` | any | SSE stream: all analytics events for the current user's cameras. Optional `?cameraId=` filter |
| GET | `/api/cameras/:id/analytics/stream` | any | SSE stream: analytics events for a single camera |
| GET | `/api/groups/:id/analytics` | any | Aggregated analytics summary for all cameras in a group |
| GET | `/api/groups/:id/analytics/trend` | any | Hourly trend data for a group. Supports `?eventType=` and `?days=`. Merges daily summary, hourly summary, and raw event tables |

---

## Dependencies

### What this domain depends on
- **Camera Registry** — reads camera credentials, IP addresses, and `enabledAnalytics` capability flags; reads camera ownership to enforce SSE access control
- **Camera Groups** — `getGroupMembers()` called when computing group analytics
- `server/services/digestAuth.ts` — VAPIX HTTP Digest authentication for ACAP endpoints
- `server/services/cameraUrl.ts` — URL building and undici dispatcher for HTTPS cameras
- `server/encryption.ts` — Decrypting camera passwords before VAPIX calls
- `server/storage.ts` — Persisting and querying analytics events and summary tables

### What depends on this domain
- **Dashboard & Observability** — reads current occupancy, people-in/out totals via `storage.getLatestAnalyticsPerCamera()` for dashboard summary widget
- **Camera Groups** — provides group analytics summary data consumed by the Group Occupancy widget
