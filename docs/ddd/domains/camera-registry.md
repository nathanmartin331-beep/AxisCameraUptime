# Domain: Camera Registry

## Bounded Context

The Camera Registry domain is the authoritative source of truth for every Axis device managed by the platform. It owns the full lifecycle of a camera record: creation, credential management, hardware identity (model, series, firmware), capabilities (PTZ, audio, analytics), lifecycle status (EOL data), SSL fingerprinting, and the analytics configuration overlay.

This domain also exposes the uptime event query surface that lives on camera routes (events, daily uptime, batch uptime) even though the uptime calculations are implemented in the Uptime Monitoring domain — the camera routes act as the coordination point because cameras are the primary aggregate.

---

## Ubiquitous Language

| Term | Definition |
|------|-----------|
| **Camera** | An Axis network device registered in the system. The primary aggregate. |
| **IP Address** | The network address used to reach the device. Must be unique per user. |
| **Encrypted Password** | The VAPIX credential stored as AES-256 ciphertext. Never returned to clients. |
| **Model** | The Axis product model string (e.g. `P3245-V`) detected via VAPIX. |
| **Series** | Single-letter product line identifier: `P`, `Q`, `M`, `F`, or `C` (speaker). |
| **Capabilities** | A JSON blob describing what the camera supports: PTZ, audio channels, analytics ACAPs, lifecycle, enabled analytics. |
| **CameraCapabilities** | The typed structure within capabilities that tracks analytics availability and enablement per feature. |
| **Lifecycle** | EOL/EOS data sourced from Axis public data: status label, discontinuation date, hardware/software support end dates, replacement model. |
| **Analytics Config** | The subset of capabilities controlling which analytics types are polled (`enabledAnalytics`). |
| **SSL Fingerprint** | SHA-256 fingerprint of the camera's TLS certificate, captured on first HTTPS contact. |
| **VAPIX** | Axis Video API. The HTTP interface used to probe the camera for model, capabilities, and analytics data. |
| **Detection Cache** | An in-memory TTL cache preventing repeated model detection requests for the same camera. |
| **Probe** | The act of querying a camera over VAPIX to discover its analytics capabilities. |
| **Digest Auth** | HTTP Digest Authentication used when connecting to camera VAPIX endpoints. |

---

## Aggregate Roots

### Camera
The central aggregate of this domain. Contains all device identity and connection data.

| Field | Type | Notes |
|-------|------|-------|
| id | string (UUID) | Primary key |
| userId | string | Owner reference (scoped to user) |
| name | string | Display label |
| ipAddress | string | Must be unique per user |
| username | string | VAPIX auth username |
| encryptedPassword | string | AES-256 encrypted VAPIX password |
| protocol | `"http"` \| `"https"` | Default `"http"` |
| port | number \| null | Custom port override |
| verifySslCert | boolean | Whether to verify TLS cert |
| sslFingerprint | string \| null | Pinned SHA-256 TLS fingerprint |
| model | string \| null | Detected Axis model string |
| fullName | string \| null | Full product name |
| series | string \| null | `P`, `Q`, `M`, `F`, `C` |
| firmwareVersion | string \| null | |
| vapixVersion | string \| null | |
| hasPTZ | boolean | |
| hasAudio | boolean | |
| audioChannels | number | |
| numberOfViews | number | |
| capabilities | JSON | Arbitrary capability blob including analytics, lifecycle, enabledAnalytics |
| currentStatus | `"online"` \| `"offline"` \| `"unknown"` | Set by Uptime Monitoring |
| videoStatus | `"video_ok"` \| `"video_failed"` \| `"unknown"` | Set by Uptime Monitoring |
| lastSeen | Date \| null | Last successful poll timestamp |
| lastBootAt | Date \| null | Last detected reboot timestamp |
| location | string \| null | Physical location label |
| notes | string \| null | Free-text notes |
| createdAt | Date | |

Invariants:
- `ipAddress` must be unique within a user's camera list.
- `encryptedPassword` must always hold an AES-encrypted value; plaintext is never persisted.
- Only fields in `ALLOWED_CAMERA_UPDATE_FIELDS` may be updated via PATCH.

---

## Value Objects

- **CameraCapabilities** — The typed shape of the `capabilities` JSON column. Tracks:
  - `analytics` — per-ACAP availability flags and scenario lists
  - `enabledAnalytics` — admin-toggled feature switches (people count, occupancy, line crossing, etc.)
  - `lifecycle` — EOL metadata with `lastChecked` timestamp
- **CameraConnectionInfo** — Derived at query time from `protocol`, `port`, `verifySslCert`, and `sslFingerprint`. Used by the HTTP dispatcher to build undici agents.

---

## Domain Events

| Event | Trigger | Effect |
|-------|---------|--------|
| `CameraCreated` | `POST /api/cameras` | Schedules an immediate `checkAllCameras()` after 2 s |
| `CameraDeleted` | `DELETE /api/cameras/:id` | Invalidates dashboard cache for owner |
| `ModelDetected` | `POST /api/cameras/:id/detect-model` | Writes model, series, firmware, capabilities, lifecycle to camera record |
| `AnalyticsProbed` | `POST /api/cameras/:id/probe-analytics` | Writes analytics capability flags and scenario lists to capabilities blob |
| `AnalyticsConfigUpdated` | `PATCH /api/cameras/:id/analytics-config` | Writes `enabledAnalytics` overlay into capabilities blob |
| `LifecycleRefreshed` | `GET /api/cameras/:id/lifecycle` | Caches EOL data in capabilities blob for 7 days |

---

## Anti-Corruption Layer

- **Password encryption boundary**: `encryptPassword()` from `server/encryption.ts` is called immediately when any camera is created or updated with a new password. The result is stored as `encryptedPassword`. Plaintext is discarded after encryption and never persisted or returned via the API.
- **Safe camera projection**: All route handlers strip `encryptedPassword` before serialising the response (`const { encryptedPassword, ...safeCamera } = camera`).
- **Field whitelist**: `ALLOWED_CAMERA_UPDATE_FIELDS` (defined in `routes/shared.ts`) restricts which fields can be patched, preventing mass-assignment attacks.
- **Zod validation**: `createCameraSchema` validates all inbound camera creation payloads before any persistence.
- **ID validation**: `validateId()` enforces UUID format before any database query by ID, protecting against injection via path parameters.
- **User ownership check**: Every route that accesses a camera by ID verifies `camera.userId === getUserId(req)` and returns 403 otherwise.

---

## Server Files

| File | Responsibility |
|------|---------------|
| `server/routes/cameraRoutes.ts` | Camera CRUD, uptime event queries, model detection, lifecycle lookup, analytics probe, analytics config, capability query, model stats |
| `server/services/cameraDetection.ts` | VAPIX model detection logic: queries `/axis-cgi/basicdeviceinfo.cgi` and XML param endpoints; returns model, series, firmware, capability flags |
| `server/services/detectionCache.ts` | In-memory TTL cache for detection results; prevents hammering the same device repeatedly |
| `server/services/axisEolData.ts` | Fetches Axis public EOL dataset; maps model strings to lifecycle status records |
| `server/services/cameraUrl.ts` | Builds VAPIX URLs, creates undici HTTP/HTTPS dispatchers, handles SSL fingerprint pinning, provides `getConnectionInfo()` |
| `server/services/digestAuth.ts` | HTTP Digest Authentication helper wrapping the undici `fetch`; used by all VAPIX requests |
| `server/models/cameraModels.ts` | Static database of known Axis model strings, product names, and series classifications |
| `server/models/cameraCapabilities.ts` | Typed capability definitions and helpers for the capabilities JSON blob |
| `server/encryption.ts` | AES-256 encrypt/decrypt for camera passwords (shared with IAM) |

---

## Client Files

| File | Responsibility |
|------|---------------|
| `client/src/pages/Cameras.tsx` | Camera list page with status indicators, model badges, uptime column, and navigation to detail |
| `client/src/pages/CameraDetail.tsx` | Camera detail page: routing and data orchestration |
| `client/src/components/CameraDetailView.tsx` | Detailed view: status, uptime chart, analytics section, capabilities, lifecycle |
| `client/src/components/CameraTable.tsx` | Sortable/filterable table component for the camera list |
| `client/src/components/AddCameraModal.tsx` | Modal form for adding a new camera with all connection fields |
| `client/src/types/camera.ts` | Shared TypeScript types for camera objects used across client components |

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/cameras` | any | List all cameras for current user (filterable by model, hasPTZ, hasAudio) |
| GET | `/api/cameras/:id` | any | Get single camera |
| POST | `/api/cameras` | admin | Create camera |
| PATCH | `/api/cameras/:id` | admin | Update camera fields (whitelist enforced) |
| DELETE | `/api/cameras/:id` | admin | Delete camera and all associated data |
| GET | `/api/cameras/:id/events` | any | Uptime events in date range |
| GET | `/api/cameras/uptime/batch` | any | Bulk uptime percentages for all user cameras |
| GET | `/api/uptime/events` | any | All uptime events across all user cameras |
| GET | `/api/uptime/daily` | any | Daily average uptime chart data |
| GET | `/api/cameras/:id/uptime` | any | Single camera uptime percentage |
| POST | `/api/cameras/:id/check` | any | Queue a manual status check |
| POST | `/api/cameras/:id/detect-model` | admin | Probe VAPIX and store model/capabilities/lifecycle |
| GET | `/api/cameras/:id/lifecycle` | any | Get cached (7-day TTL) EOL lifecycle data |
| POST | `/api/cameras/:id/probe-analytics` | admin | Probe VAPIX for analytics ACAP availability |
| PATCH | `/api/cameras/:id/analytics-config` | admin | Toggle enabled analytics features |
| GET | `/api/cameras/:id/capabilities` | any | Return stored capabilities blob |
| GET | `/api/models` | any | List known Axis models (optionally filter by series P/Q/M/F) |
| GET | `/api/cameras/stats/models` | any | Aggregate model detection statistics |

---

## Dependencies

### What this domain depends on
- **IAM** — `requireAuth`, `requireAdmin` middleware on every route
- `server/encryption.ts` — Camera password encryption/decryption
- `server/cameraMonitor.ts` — `checkAllCameras()` called after camera create/import
- `server/uptimeCalculator.ts` — `calculateUptimeFromEvents()` used in daily uptime endpoint
- `server/storage.ts` — All camera CRUD and uptime query operations

### What depends on this domain
- **Uptime Monitoring** — reads the camera list and updates `currentStatus`, `videoStatus`, `lastSeen`, `lastBootAt`
- **Analytics** — reads camera credentials and capabilities to know which cameras to poll
- **Camera Groups** — reads camera list to populate group membership
- **Network Discovery** — creates camera records after discovery
- **Import / Export** — creates camera records from CSV, reads camera list for export
- **Dashboard & Observability** — reads camera status and analytics summaries for widget data
