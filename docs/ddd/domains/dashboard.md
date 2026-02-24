# Domain: Dashboard & Observability

## Bounded Context

The Dashboard & Observability domain is the primary read-side of the platform. It aggregates data from all other domains and presents it through a composable widget system. This domain owns two surfaces: the fixed summary dashboard (Fleet Overview) and the customisable dashboard (drag-and-resize widget grid), as well as the reliability metrics API.

This domain does not write to any core domain data. It reads camera status, uptime events, analytics events, group data, and reliability metrics to compose views. The only state it owns is the per-user dashboard layout configuration.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **DashboardSummary** | A computed snapshot of fleet health: total cameras, online/offline counts, video status, average uptime, people-in/out totals, current occupancy, analytics-enabled count, speaker counts. |
| **DashboardLayout** | A per-user persisted configuration of which widgets appear on the customisable dashboard, along with their grid positions and sizes. |
| **Widget** | A discrete UI card that displays a specific metric or visualisation. Identified by a `type` string and positioned on a grid (`x`, `y`, `w`, `h`). |
| **WidgetCatalog** | The static registry of all 15+ available widget types, their default sizes, and their display names. |
| **Reliability Metrics** | Computed view objects derived from uptime event history: MTTR, MTBF, incident count, average response time, SLA compliance percentage. |
| **SLA Compliance** | The percentage of time a camera or fleet achieved at least the defined uptime target (e.g. 99.9%). |
| **Site Metrics** | Per-location (camera `location` field) reliability statistics aggregated across all cameras at that site. |
| **Network Metrics** | Fleet-wide reliability statistics across all cameras owned by the user. |
| **Cache** | A short-lived (30 s) in-memory response cache for the dashboard summary endpoint, keyed by user ID. Invalidated on camera create/delete/update. |

---

## Aggregate Roots

### DashboardLayout
The only entity persisted by this domain.

| Field | Type | Notes |
|-------|------|-------|
| userId | string | One layout per user (upsert on save) |
| widgets | JSON | Array of `{ id, type, x, y, w, h }` objects |
| updatedAt | Date | |

Constraints:
- Maximum 50 widgets per layout.
- Widget `w` and `h` are between 1 and 24 (grid units).
- Widget `type` must be a string (validated by Zod; unknown types are preserved to allow future extension).

### DashboardSummary (computed)
Not persisted. Computed on each request (with 30 s cache). Represents the current fleet health snapshot.

---

## Value Objects

- **WidgetConfig** — `{ id: string, type: string, x: number, y: number, w: number, h: number }`. Lives inside `DashboardLayout.widgets`.
- **CameraMetrics** — `{ mttr, mtbf, incidentCount, avgResponseTime, slaCompliance, incidents: [...] }`. Computed by `reliabilityMetrics.ts`, returned from `/api/metrics/camera/:id`.
- **SiteMetrics** — Per-location reliability rollup. Computed by `calculateSiteMetrics()`.
- **NetworkMetrics** — Fleet-level reliability rollup. Computed by `calculateNetworkMetrics()`.

---

## Domain Events

This domain publishes no domain events. It is a pure read-side consumer.

The dashboard summary cache is invalidated as a side-effect when the Camera Registry creates or deletes a camera:
- `dashboardCache.delete(\`dashboard:${userId}\`)` is called in camera create, delete, and update handlers.

---

## Anti-Corruption Layer

- **30-second summary cache**: The `GET /api/dashboard/summary` response is cached per-user for 30 seconds. This prevents thundering-herd database load when multiple browser tabs are open. The cache is a plain `Map` in `routes/shared.ts`.
- **Speaker/camera separation**: The summary logic explicitly separates `series === 'C'` devices (Axis speakers) from video cameras to avoid mixing uptime statistics.
- **Read-only consumer**: This domain never writes to other domains' tables. All reads are through `storage.ts` query methods.
- **Metric isolation**: Reliability metric calculations are encapsulated in `reliabilityMetrics.ts` and accessed only through the dashboard routes — other domains do not call these functions directly.
- **Layout size validation**: Zod enforces `max(50)` on the widgets array and numeric bounds on `x`, `y`, `w`, `h` to prevent runaway layout data.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/routes/dashboardRoutes.ts` | `GET /api/dashboard/summary` (with cache), `GET /api/metrics/camera/:id`, `GET /api/metrics/sites`, `GET /api/metrics/network`, `GET /api/dashboard/layout`, `POST /api/dashboard/layout` |
| `server/reliabilityMetrics.ts` | `calculateCameraMetrics()`, `calculateSiteMetrics()`, `calculateNetworkMetrics()`: derive MTTR, MTBF, incident count, SLA compliance from uptime event history |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/pages/Dashboard.tsx` | Fixed fleet overview: status cards, uptime chart, active incidents list, analytics summary |
| `client/src/pages/CustomizableDashboard.tsx` | Drag-and-resize widget grid powered by `react-grid-layout`. Loads/saves layout via dashboard layout API. Widget add/remove/resize. |
| `client/src/components/widgets/ActiveIncidentsWidget.tsx` | Shows cameras currently offline with duration |
| `client/src/components/widgets/CameraStatusWidget.tsx` | Online/offline/unknown counts with status ring |
| `client/src/components/widgets/GroupOccupancyWidget.tsx` | Current occupancy sum for a selected group |
| `client/src/components/widgets/GroupOverviewWidget.tsx` | Group list with member count and occupancy |
| `client/src/components/widgets/IncidentLeaderboardWidget.tsx` | Cameras ranked by total incident count |
| `client/src/components/widgets/MTBFWidget.tsx` | Fleet MTBF (Mean Time Between Failures) card |
| `client/src/components/widgets/MTTRWidget.tsx` | Fleet MTTR (Mean Time To Repair) card |
| `client/src/components/widgets/MTTRTrendWidget.tsx` | MTTR trend line chart over time |
| `client/src/components/widgets/MetricCard.tsx` | Generic configurable metric card |
| `client/src/components/widgets/NetworkUptimeWidget.tsx` | Fleet average uptime percentage |
| `client/src/components/widgets/PeopleFlowWidget.tsx` | Today's people-in / people-out counters |
| `client/src/components/widgets/SLAComplianceWidget.tsx` | SLA compliance gauge |
| `client/src/components/widgets/SiteRankingsWidget.tsx` | Locations ranked by uptime |
| `client/src/components/widgets/TotalIncidentsWidget.tsx` | Total incident count over selected period |
| `client/src/components/widgets/UptimeDistributionWidget.tsx` | Histogram of uptime percentages across the fleet |
| `client/src/components/widgets/VideoHealthWidget.tsx` | Video-ok / video-failed / unknown counts |
| `client/src/components/widgets/WidgetCatalog.ts` | Static registry of all available widget types with default grid sizes and display metadata |
| `client/src/components/widgets/WidgetRenderer.tsx` | Router component that renders the correct widget component for a given `type` string |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard/summary` | any | Fleet health snapshot (30 s cached per user). Returns camera counts by status, video status, avg uptime, people counts, speaker counts |
| GET | `/api/metrics/camera/:id` | any | MTTR, MTBF, incident count, SLA compliance for a single camera |
| GET | `/api/metrics/sites` | any | Per-location reliability metrics for all user cameras |
| GET | `/api/metrics/network` | any | Fleet-level reliability metrics |
| GET | `/api/dashboard/layout` | any | Load saved widget layout for current user |
| POST | `/api/dashboard/layout` | any | Save widget layout for current user (max 50 widgets) |

---

## Dependencies

### What this domain depends on
- **Camera Registry** — `storage.getCamerasByUserId()`, `storage.getCameraById()`, camera status fields (`currentStatus`, `videoStatus`)
- **Uptime Monitoring** — `storage.calculateUptimePercentage()`, `storage.getUptimeEventsInRange()`, `calculateCameraMetrics()`, `calculateSiteMetrics()`, `calculateNetworkMetrics()`
- **Analytics** — `storage.getLatestAnalyticsPerCamera()` for current occupancy, people-in, people-out on the summary endpoint
- **Camera Groups** — Group list and occupancy via `storage.getGroupsByUserId()`, `storage.getGroupCurrentOccupancy()`
- **IAM** — `requireAuth` on all routes
- `server/storage.ts` — Dashboard layout CRUD (`getDashboardLayout`, `saveDashboardLayout`)

### What depends on this domain
Nothing depends on this domain. It is a terminal consumer in the dependency graph.
