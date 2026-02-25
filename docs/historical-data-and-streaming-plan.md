# Historical Data, Group Analytics & Real-Time Streaming Plan

## Problem Statement

AxisCameraUptime will operate with hundreds of cameras organized into multiple groups. Users need:

1. **Historical group analytics** — occupancy, people flow, and line crossing trends across groups of cameras over 90–365+ days
2. **Real-time streaming** — live analytics pushed over SSE to both our frontend and external API consumers as close to real time as possible
3. **External API access** — machine-to-machine authentication so BMS, VMS, and third-party dashboards can consume both historical and live data

The current implementation has critical bugs, N+1 query scaling problems, orphaned infrastructure, and missing endpoints that block all three requirements.

---

## Current Architecture Summary

### Data Collection Pipeline (Working)

```
Camera VAPIX APIs
  → analyticsPoller.ts (every 1 min, staggered cohorts, 25 concurrent)
  → writes to analytics_events table
  → analyticsBroadcaster.broadcast() pushes to SSE subscribers
```

### 3-Tier Aggregation Pipeline (Working)

```
Raw events (< 6h)
  → Hourly rollup at :05 (deletes raw rows)
  → Daily rollup at 4:00 AM (deletes hourly rows)
```

Tables: `analytics_events` → `analytics_hourly_summary` → `analytics_daily_summary`
Same pattern for uptime: `uptime_events` → `uptime_hourly_summary` → `uptime_daily_summary`

### History Backfill (Working)

Three sources extend data backwards before monitoring started:
- `uptimeSeconds` — synthetic boot event from camera-reported uptime
- System log parsing — historical reboot events from `/axis-cgi/admin/systemlog.cgi`
- TVPC hourly export — `/local/tvpc/.api?export-json&date=all&res=1h` imports into `analytics_hourly_summary`

### SSE Streaming Infrastructure (Partially Working)

| Stream Endpoint | Status | Notes |
|---|---|---|
| `GET /api/cameras/:id/analytics/stream` | Working | Per-camera, auth-scoped correctly |
| `GET /api/analytics/stream` | **Bug** | Global stream leaks cross-user data (no user filtering) |
| `GET /api/notifications/stream` | Working | Status change events (online/offline) |
| `GET /api/groups/:id/analytics/stream` | **Missing** | No group-level stream exists |

### Frontend SSE Usage

| Component | Uses SSE? | Current Approach |
|---|---|---|
| `useStatusNotifications` | Yes | Subscribes to `/api/notifications/stream` |
| `GroupDetail` trend chart | No | Polls via `useQuery` every 10s |
| `GroupOccupancyWidget` | No | Polls via `useQuery` every 10s |
| `PeopleFlowWidget` | No | Polls via `useQuery` every 30s |
| `LiveAnalyticsCard` | No | Polls via `useQuery` |

---

## Audit: Bugs and Deficiencies

### BUG-1: `/api/uptime/daily` Loses Data Beyond 6 Hours

**File:** `server/routes/cameraRoutes.ts:231-321`

The daily uptime chart endpoint fetches ALL raw `uptime_events` for every camera and recalculates per-day in JS. But the aggregation service deletes raw events older than 6 hours. For any range beyond ~6 hours, this endpoint returns incomplete/missing data.

**Impact:** The uptime trend chart on the dashboard is silently wrong for multi-day views.

**Fix:** Rewrite to query all 3 tiers (daily summary → hourly summary → raw events) and merge, the same way `calculateUptimePercentage()` in `storage.ts:668-784` already does.

### BUG-2: Global Analytics Stream Leaks Cross-User Data

**File:** `server/routes/analyticsRoutes.ts:97-131`

The `/api/analytics/stream` endpoint calls `requireAuth` to get the `userId`, but the `subscribeAll` callback on line 119 pushes events from ALL cameras to the subscriber without filtering by ownership. User A receives analytics events from User B's cameras.

**Impact:** Data leakage between users. Security vulnerability.

**Fix:** Filter events in the subscription callback — look up camera ownership before pushing, or maintain a Set of the user's camera IDs (refreshed periodically) and filter against it.

### BUG-3: Group Trend Endpoint Has O(N) Raw Events Queries

**File:** `server/routes/analyticsRoutes.ts:239-244`

```typescript
// This runs once PER MEMBER CAMERA — 200 cameras = 200 DB queries
for (const member of members) {
  const events = await storage.getAnalyticsEvents(member.id, eventType, startDate, endDate);
  ...
}
```

The daily and hourly summary queries above this (lines 218-237) correctly use `IN (memberIds)` for batch querying. But the raw events tier falls back to a per-camera loop.

**Impact:** O(N) queries where N = cameras in group. With 200 cameras, 200 sequential DB queries per request.

**Fix:** Replace loop with a single batch query: `SELECT * FROM analytics_events WHERE camera_id IN (?) AND event_type = ? AND timestamp BETWEEN ? AND ?`

### BUG-4: `getGroupAnalyticsSummary` Ignores Date Range

**File:** `server/storage.ts:1363-1416`

```typescript
async getGroupAnalyticsSummary(
  groupId: string,
  _startDate: Date,  // ← prefixed with _, never used
  _endDate: Date     // ← prefixed with _, never used
)
```

The method only returns the **latest** values for each camera. Cannot answer "what was Building A's total in/out yesterday?" — the date range parameters are accepted but discarded.

**Impact:** No historical group summaries. The endpoint always returns "right now" regardless of what date range the caller requests.

### BUG-5: `getGroupCurrentOccupancy` is O(N) Sequential Queries

**File:** `server/storage.ts:1339-1361`

Loops through each member camera calling `getLatestAnalyticsEventsByScenario()` individually. With 200 cameras, that's 200 sequential queries to get a single aggregate number.

**Impact:** Slow group occupancy responses at scale.

**Fix:** Single SQL query with `IN (memberIds)` using a subquery to get the latest event per camera per scenario.

---

## Missing Features

### MISSING-1: Group-Level SSE Stream

**Need:** `GET /api/groups/:id/analytics/stream`

Server subscribes to the `analyticsBroadcaster` for all member cameras, aggregates occupancy/counts across the group, and pushes a single combined event to the client.

**Payload shape:**
```json
{
  "groupId": "group-123",
  "timestamp": "2026-02-25T14:30:01.123Z",
  "occupancy": 47,
  "totalIn": 312,
  "totalOut": 265,
  "perCamera": [
    { "cameraId": "cam-1", "occupancy": 12, "in": 85, "out": 73 },
    { "cameraId": "cam-2", "occupancy": 35, "in": 227, "out": 192 }
  ]
}
```

**Why SSE not WebSocket:** Existing infrastructure is SSE, browser `EventSource` auto-reconnects, unidirectional push is all we need.

### MISSING-2: Group Daily Analytics Endpoint

**Need:** `GET /api/groups/:id/analytics/daily?eventType=occupancy&days=90`

Per-camera already has this (`GET /api/cameras/:id/analytics/daily`) with proper 3-tier merging. Groups have no equivalent — only the hourly-bucketed trend endpoint.

**Implementation:** New `storage.getGroupAnalyticsDailyTotals(memberIds, eventType, days)` that queries all 3 tiers with batch `IN (memberIds)`, groups by day, and sums across cameras. Same merge logic as `getAnalyticsDailyTotals` but operating on arrays of camera IDs.

**Response shape:**
```json
{
  "groupId": "group-123",
  "eventType": "occupancy",
  "days": 90,
  "dailyTotals": [
    { "date": "2025-11-27", "total": 482 },
    { "date": "2025-11-28", "total": 510 }
  ],
  "perCamera": [...]  // optional, when ?perCamera=true
}
```

### MISSING-3: External API Authentication

**Need:** API key or Bearer token auth for machine-to-machine access.

Current auth is Replit session-based (`requireAuth` checks `req.session`). No mechanism for external systems to authenticate.

**Implementation:**
- `api_keys` table: `id, userId, keyHash, name, scopes, createdAt, lastUsedAt, expiresAt`
- Middleware: check `X-API-Key` header → hash → lookup → attach userId to request
- Falls through to session auth if no API key header present
- Scopes: `read:cameras`, `read:analytics`, `stream:analytics`, `read:groups`, `write:cameras`
- Settings page UI for creating/revoking API keys

### MISSING-4: SSE Reconnection Support (Last-Event-ID)

**Need:** Event sequence numbers + `Last-Event-ID` support on SSE streams.

Current SSE has no backpressure. If a client disconnects for 30 seconds during a poll cycle, it misses those events entirely. The only recovery is to hit the REST API for current state, but there's a race window between the REST response and the SSE reconnection.

**Implementation:**
- Add auto-incrementing sequence number to `analyticsBroadcaster`
- Include `id:` field in SSE events: `id: 12345\ndata: {...}\n\n`
- On reconnect, browser sends `Last-Event-ID: 12345` header
- Server replays missed events from a bounded ring buffer (last 5 minutes / 1000 events)
- If gap is too large, send a `event: reset\n` telling the client to fetch full state from REST

### MISSING-5: Webhook Delivery

**Need:** Push analytics and status events to registered webhook URLs.

SSE requires the consumer to hold a persistent connection. BMS/VMS integrations often prefer webhooks.

**Implementation:**
- `webhooks` table: `id, userId, url, secret, events[], active, createdAt`
- Events: `analytics.update`, `status.change`, `camera.offline`, `occupancy.threshold`
- Delivery: fire-and-forget with retry queue (3 attempts, exponential backoff)
- HMAC signature in `X-Webhook-Signature` header for verification
- Settings page UI for managing webhooks

### MISSING-6: Bulk Fleet Analytics Endpoint

**Need:** `GET /api/analytics/summary` — current state of all groups in one call.

Currently you must hit each group individually. External dashboards displaying a building overview with 10 groups would make 10 API calls.

**Response shape:**
```json
{
  "groups": [
    {
      "groupId": "group-123",
      "name": "Building A",
      "occupancy": 47,
      "totalIn": 312,
      "totalOut": 265,
      "cameraCount": 8,
      "onlineCameras": 7
    }
  ],
  "fleet": {
    "totalOccupancy": 312,
    "totalCameras": 200,
    "onlineCameras": 195
  }
}
```

---

## Implementation Plan

### Tier 1 — Fix Broken Things

These are bugs in production code that produce wrong data or leak information.

#### T1.1: Fix `/api/uptime/daily` to Use Summary Tables

**Files:** `server/routes/cameraRoutes.ts` (lines 231-321)

Replace raw-event-only calculation with 3-tier query approach:
1. Query `uptime_daily_summary` for each camera with `IN (cameraIds)` grouped by `day_start`
2. Query `uptime_hourly_summary` for recent data not yet rolled into daily
3. Query `uptime_events` for last ~6h of raw data
4. Merge per-day, compute average across cameras per day

Model after `calculateBatchUptimePercentage()` (storage.ts:791-871) which already does this correctly.

**Estimated scope:** ~80 lines changed in cameraRoutes.ts, new storage method.

#### T1.2: Fix Auth Scoping on `/api/analytics/stream`

**Files:** `server/routes/analyticsRoutes.ts` (lines 97-131)

Add user camera ownership filtering:
1. On connection, fetch user's camera IDs into a `Set<string>`
2. In the `subscribeAll` callback, check `if (!userCameraIds.has(payload.cameraId)) return`
3. Refresh the camera ID set every 60s (handles cameras added/removed during long connections)

**Estimated scope:** ~15 lines changed.

#### T1.3: Fix Group Trend Raw Events N+1 Query

**Files:** `server/routes/analyticsRoutes.ts` (lines 239-244)

Replace per-camera loop with batch query:
```sql
SELECT camera_id, timestamp, value, metadata
FROM analytics_events
WHERE camera_id IN (?, ?, ...) AND event_type = ? AND timestamp BETWEEN ? AND ?
```

**Estimated scope:** ~20 lines changed.

#### T1.4: Batch `getGroupCurrentOccupancy`

**Files:** `server/storage.ts` (lines 1339-1361)

Replace per-camera `getLatestAnalyticsEventsByScenario` loop with:
```sql
SELECT ae.camera_id, ae.value, ae.metadata
FROM analytics_events ae
INNER JOIN (
  SELECT camera_id, MAX(timestamp) as max_ts
  FROM analytics_events
  WHERE camera_id IN (?, ...) AND event_type = 'occupancy'
  GROUP BY camera_id
) latest ON ae.camera_id = latest.camera_id AND ae.timestamp = latest.max_ts
WHERE ae.event_type = 'occupancy'
```

**Estimated scope:** ~40 lines changed.

---

### Tier 2 — Core Missing Features

These enable the primary use case: historical group analytics and real-time group streaming.

#### T2.1: Add Group-Level SSE Stream

**New endpoint:** `GET /api/groups/:id/analytics/stream`

**Files:**
- `server/routes/analyticsRoutes.ts` — new route handler
- `server/services/analyticsEventBroadcaster.ts` — no changes needed (use existing `subscribe` per-camera)

**Implementation:**
1. Validate group ownership
2. Fetch member camera IDs
3. Subscribe to `analyticsBroadcaster` for each member camera
4. Maintain in-memory aggregate state per group connection: `Map<cameraId, { occupancy, in, out }>`
5. On any member event, update aggregate, push combined payload to client
6. Refresh member list every 60s (handles membership changes)
7. On disconnect, unsubscribe all

**Estimated scope:** ~80 lines new code.

#### T2.2: Add `GET /api/groups/:id/analytics/daily`

**New endpoint + storage method.**

**Files:**
- `server/storage.ts` — new `getGroupAnalyticsDailyTotals(memberIds, eventType, days)` method
- `server/routes/analyticsRoutes.ts` — new route handler

**Storage method:** Same 3-tier merge as `getAnalyticsDailyTotals` but with `IN (memberIds)`:
1. Query `analytics_daily_summary WHERE camera_id IN (?) AND event_type = ?`, group by `day_start`, SUM values
2. Query `analytics_hourly_summary` same pattern
3. Query `analytics_events` same pattern (batch, not per-camera loop)
4. Merge across tiers per day

**Query params:**
- `eventType` — occupancy, people_in, people_out, line_crossing
- `days` — 1-365 (no artificial 90-day cap)
- `perCamera` — optional, includes per-camera breakdown

**Estimated scope:** ~120 lines new code (storage method + route).

#### T2.3: Fix `getGroupAnalyticsSummary` to Use Date Range

**Files:** `server/storage.ts` (lines 1363-1416)

Replace the `_startDate`/`_endDate` ignored params with actual date-range queries:
- When range is "today" (startDate = midnight today), use latest values (current behavior)
- When range is historical, query the 3 tiers with date bounds and aggregate

**Estimated scope:** ~60 lines changed.

#### T2.4: Wire Frontend to Group SSE Stream

**Files:**
- New hook: `client/src/hooks/useGroupAnalyticsStream.ts`
- Modified: `client/src/pages/GroupDetail.tsx` — replace poll with SSE
- Modified: `client/src/components/widgets/GroupOccupancyWidget.tsx` — replace poll with SSE
- Modified: `client/src/components/widgets/PeopleFlowWidget.tsx` — replace poll with SSE

**Hook API:**
```typescript
function useGroupAnalyticsStream(groupId: string): {
  occupancy: number;
  totalIn: number;
  totalOut: number;
  perCamera: Map<string, { occupancy: number; in: number; out: number }>;
  connected: boolean;
}
```

Falls back to REST polling if SSE connection fails.

**Estimated scope:** ~60 lines new hook, ~30 lines changed per component.

#### T2.5: Extend Frontend Time Range for Groups

**Files:** `client/src/pages/GroupDetail.tsx` (lines 455-461)

Add 90d and 365d tabs to trend chart. When days > 30, switch from hourly trend endpoint to new daily endpoint (T2.2) for appropriate granularity.

**Estimated scope:** ~15 lines changed.

---

### Tier 3 — External API Access

These enable external systems to consume analytics data.

#### T3.1: API Key Authentication

**Files:**
- `shared/schema.ts` — new `apiKeys` table
- `server/auth.ts` — new `requireApiKeyOrAuth` middleware
- `server/routes/settingsRoutes.ts` — CRUD endpoints for API keys
- `client/src/pages/Settings.tsx` — API key management UI

**Schema:**
```typescript
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(), // first 8 chars for display
  scopes: text("scopes", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});
```

**Auth flow:**
1. Check `X-API-Key` header
2. Hash it, look up in `api_keys` table
3. If found and not expired, attach `userId` to request, update `lastUsedAt`
4. If not found, fall through to session auth

**Estimated scope:** ~150 lines new code across files.

#### T3.2: SSE Reconnection with `Last-Event-ID`

**Files:**
- `server/services/analyticsEventBroadcaster.ts` — add sequence counter + ring buffer
- `server/routes/analyticsRoutes.ts` — all SSE routes read `Last-Event-ID`, replay from buffer

**Implementation:**
- Broadcaster assigns monotonic sequence ID to each broadcast
- Ring buffer stores last 1000 events (or last 5 minutes, whichever is smaller)
- On SSE connection, check `req.headers['last-event-id']`
- If present and within buffer range, replay missed events before switching to live
- If gap too large, send `event: reset\ndata: {}\n\n` telling client to fetch REST state
- Each SSE message includes `id:` field: `id: 12345\ndata: {...}\n\n`

**Estimated scope:** ~60 lines new in broadcaster, ~20 lines per SSE route.

#### T3.3: Webhook Delivery

**Files:**
- `shared/schema.ts` — new `webhooks` table
- `server/services/webhookDelivery.ts` — new service
- `server/routes/settingsRoutes.ts` — webhook CRUD endpoints
- `client/src/pages/Settings.tsx` — webhook management UI

**Webhook events:**
| Event | Trigger | Payload |
|---|---|---|
| `analytics.update` | Each poll cycle completes | Per-camera analytics values |
| `status.change` | Camera goes online/offline | Camera ID, old/new status, timestamp |
| `occupancy.threshold` | Group occupancy crosses user-defined threshold | Group ID, current occupancy, threshold |
| `camera.offline` | Camera goes offline | Camera ID, name, last seen |

**Delivery:**
- HMAC-SHA256 signature: `X-Webhook-Signature: sha256=<hex>`
- Retry: 3 attempts with exponential backoff (10s, 60s, 300s)
- Dead letter: mark webhook inactive after 10 consecutive failures
- Delivery log: last 100 deliveries per webhook with status codes

**Estimated scope:** ~200 lines new service, ~80 lines routes, ~60 lines UI.

#### T3.4: Bulk Fleet Analytics Endpoint

**New endpoint:** `GET /api/analytics/summary`

Returns current state of all groups + fleet totals in one call.

**Files:**
- `server/routes/analyticsRoutes.ts` — new route
- `server/storage.ts` — new `getFleetAnalyticsSummary(userId)` method

**Implementation:** Fetch all groups for user, batch-query current occupancy for all member cameras in one SQL pass, aggregate per group.

**Estimated scope:** ~80 lines new code.

---

### Tier 4 — Polish

#### T4.1: TVPC Backfill Provenance

Show in the UI when a camera has historical data imported from TVPC, and how far back it goes.

**Files:**
- `server/routes/cameraRoutes.ts` — include `tvpcHistoryBackfilled` and earliest data date in camera response
- `client/src/pages/CameraDetail.tsx` — badge/tooltip showing "Historical data since Jan 2024"
- `client/src/components/analytics/AnalyticsSection.tsx` — provenance indicator

**Estimated scope:** ~30 lines.

#### T4.2: Per-Camera Breakdown in Group Daily

Add `?perCamera=true` query param to `GET /api/groups/:id/analytics/daily` that includes daily totals broken down by individual camera within the group.

**Estimated scope:** ~40 lines (extend T2.2 storage method with optional grouping).

#### T4.3: Daily Trend Bar Chart for Groups

Add a `DailyTrendsChart` variant to `GroupDetail.tsx` — bar chart of daily totals (matching the per-camera `DailyTrendsChart` style but for group-aggregated data).

**Files:**
- New: `client/src/components/analytics/GroupDailyTrendsChart.tsx`
- Modified: `client/src/pages/GroupDetail.tsx` — add chart below existing trend

**Estimated scope:** ~120 lines new component, ~10 lines integration.

---

## Dependency Graph

```
T1.1 (fix /api/uptime/daily)          — standalone
T1.2 (fix stream auth)                — standalone
T1.3 (fix group trend N+1)            — standalone
T1.4 (batch group occupancy)          — standalone

T2.1 (group SSE stream)               — depends on T1.2 (auth fix)
T2.2 (group daily endpoint)           — standalone
T2.3 (fix group summary date range)   — standalone
T2.4 (frontend SSE wiring)            — depends on T2.1
T2.5 (extend time range tabs)         — depends on T2.2

T3.1 (API key auth)                   — standalone
T3.2 (SSE Last-Event-ID)              — depends on T2.1
T3.3 (webhooks)                       — depends on T3.1
T3.4 (bulk fleet endpoint)            — depends on T1.4

T4.1 (TVPC provenance)                — standalone
T4.2 (per-camera breakdown)           — depends on T2.2
T4.3 (group daily chart)              — depends on T2.2
```

## Recommended Execution Order

**Phase 1 — Bug fixes (all independent, can parallelize):**
T1.1 + T1.2 + T1.3 + T1.4

**Phase 2 — Group analytics core (sequential dependencies):**
T2.2 → T2.3 → T2.1 → T2.4 → T2.5

**Phase 3 — External API (sequential dependencies):**
T3.1 → T3.2 → T3.3 → T3.4

**Phase 4 — Polish (independent):**
T4.1 + T4.2 + T4.3

---

## Files Modified Summary

| File | Tiers | Type |
|---|---|---|
| `server/routes/cameraRoutes.ts` | T1.1, T4.1 | Modified |
| `server/routes/analyticsRoutes.ts` | T1.2, T1.3, T2.1, T2.2, T3.4 | Modified |
| `server/storage.ts` | T1.4, T2.2, T2.3, T3.4 | Modified |
| `server/services/analyticsEventBroadcaster.ts` | T3.2 | Modified |
| `server/auth.ts` | T3.1 | Modified |
| `server/routes/settingsRoutes.ts` | T3.1, T3.3 | Modified |
| `shared/schema.ts` | T3.1, T3.3 | Modified |
| `client/src/hooks/useGroupAnalyticsStream.ts` | T2.4 | New |
| `client/src/pages/GroupDetail.tsx` | T2.4, T2.5, T4.3 | Modified |
| `client/src/components/widgets/GroupOccupancyWidget.tsx` | T2.4 | Modified |
| `client/src/components/widgets/PeopleFlowWidget.tsx` | T2.4 | Modified |
| `client/src/components/analytics/GroupDailyTrendsChart.tsx` | T4.3 | New |
| `client/src/pages/CameraDetail.tsx` | T4.1 | Modified |
| `client/src/pages/Settings.tsx` | T3.1, T3.3 | Modified |
| `server/services/webhookDelivery.ts` | T3.3 | New |

---

## Testing Strategy

Each tier should include tests before merging:

- **T1.x bug fixes:** Unit tests proving the fix + regression test for the original bug
- **T2.x group features:** Integration tests with multi-camera groups, verify 3-tier data merging, SSE event delivery
- **T3.x external API:** Auth middleware tests (valid key, expired key, invalid key, no key fallback to session), webhook delivery retry logic, SSE reconnection replay
- **T4.x polish:** Snapshot/visual tests for new UI components

Test files go in `server/__tests__/` and `tests/` per existing convention.
