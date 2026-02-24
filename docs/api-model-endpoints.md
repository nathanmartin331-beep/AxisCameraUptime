# Model Management API Endpoints

## Overview
These endpoints provide model detection and management capabilities for Axis cameras.

## Endpoints

### 1. Enhanced Camera List - GET /api/cameras

Get all cameras with optional filtering by model or capabilities.

**Query Parameters:**
- `model` (string, optional) - Filter by camera model (e.g., "P3245-LVE")
- `hasPTZ` (boolean, optional) - Filter cameras with PTZ capability
- `hasAudio` (boolean, optional) - Filter cameras with audio capability

**Examples:**
```bash
# Get all cameras
GET /api/cameras

# Get cameras by model
GET /api/cameras?model=P3245-LVE

# Get cameras with PTZ
GET /api/cameras?hasPTZ=true

# Get cameras with audio
GET /api/cameras?hasAudio=true
```

**Response:**
```json
[
  {
    "id": "camera-id",
    "name": "Front Door",
    "ipAddress": "192.168.1.100",
    "username": "admin",
    "model": "P3245-LVE",
    "series": "P",
    "hasPTZ": false,
    "hasAudio": true,
    "hasIR": true,
    "resolution": "5MP",
    "currentStatus": "online",
    "videoStatus": "video_ok"
  }
]
```

---

### 2. Detect Camera Model - POST /api/cameras/:id/detect-model

Manually trigger model detection for a specific camera.

**URL Parameters:**
- `id` (string, required) - Camera ID

**Response:**
```json
{
  "success": true,
  "model": "P3245-LVE",
  "series": "P",
  "capabilities": {
    "hasPTZ": false,
    "hasAudio": true,
    "hasIR": true,
    "resolution": "5MP"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Camera not responding"
}
```

**Example:**
```bash
curl -X POST http://localhost:5000/api/cameras/abc123/detect-model \
  -H "Cookie: connect.sid=..." \
  -H "Content-Type: application/json"
```

---

### 3. Get Camera Capabilities - GET /api/cameras/:id/capabilities

Get detected capabilities for a specific camera.

**URL Parameters:**
- `id` (string, required) - Camera ID

**Response:**
```json
{
  "model": "P3245-LVE",
  "series": "P",
  "hasPTZ": false,
  "hasAudio": true,
  "hasIR": true,
  "resolution": "5MP",
  "detectedAt": "2025-11-11T12:00:00Z"
}
```

**Error Response:**
```json
{
  "message": "Camera model not detected yet"
}
```

**Example:**
```bash
curl http://localhost:5000/api/cameras/abc123/capabilities \
  -H "Cookie: connect.sid=..."
```

---

### 4. List Supported Models - GET /api/models

Get all supported Axis camera models or filter by series.

**Query Parameters:**
- `series` (string, optional) - Filter by camera series (P, Q, M, or F)

**Response:**
```json
[
  {
    "model": "P3245-LVE",
    "series": "P",
    "hasPTZ": false,
    "hasAudio": true,
    "hasIR": true,
    "resolution": "5MP"
  },
  {
    "model": "Q6215-LE",
    "series": "Q",
    "hasPTZ": true,
    "hasAudio": true,
    "hasIR": true,
    "resolution": "4K"
  }
]
```

**Examples:**
```bash
# Get all models
GET /api/models

# Get P-series models only
GET /api/models?series=P

# Get Q-series models only
GET /api/models?series=Q
```

---

### 5. Model Statistics - GET /api/cameras/stats/models

Get statistics about camera models in the system.

**Response:**
```json
{
  "total": 10,
  "detected": 7,
  "undetected": 3,
  "detectionRate": 0.7,
  "byModel": {
    "P3245-LVE": 3,
    "Q6215-LE": 2,
    "M3047-P": 2
  },
  "bySeries": {
    "P": 5,
    "Q": 2,
    "M": 2,
    "F": 0
  }
}
```

**Example:**
```bash
curl http://localhost:5000/api/cameras/stats/models \
  -H "Cookie: connect.sid=..."
```

---

## Authentication & Authorization

All endpoints require authentication via session cookie. Write operations (POST, PATCH, DELETE) require **admin** role.

| Method | Access Level |
|--------|-------------|
| GET (read) | Any authenticated user |
| POST (create/detect) | Admin only |
| PATCH (update) | Admin only |
| DELETE (remove) | Admin only |

```bash
curl http://localhost:5000/api/... \
  -H "Cookie: connect.sid=YOUR_SESSION_COOKIE"
```

Non-admin users attempting write operations will receive a `403 Forbidden` response.

## Error Handling

### Common Error Responses

**401 Unauthorized:**
```json
{
  "error": "Unauthorized"
}
```

**403 Forbidden:**
```json
{
  "message": "Forbidden"
}
```

**404 Not Found:**
```json
{
  "message": "Camera not found"
}
```

**500 Internal Server Error:**
```json
{
  "message": "Failed to detect camera model",
  "error": "Connection timeout"
}
```

---

## Testing

### Using curl

```bash
# 1. Login first to get session cookie
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' \
  -c cookies.txt

# 2. Use the session cookie for API calls
curl http://localhost:5000/api/cameras/stats/models \
  -b cookies.txt

# 3. Trigger model detection
curl -X POST http://localhost:5000/api/cameras/abc123/detect-model \
  -b cookies.txt
```

### Using Postman

1. Set up authentication:
   - POST `/api/login` with credentials
   - Cookie will be automatically stored

2. Test endpoints:
   - GET `/api/cameras?model=P3245-LVE`
   - POST `/api/cameras/:id/detect-model`
   - GET `/api/cameras/stats/models`

---

## Implementation Status

- ✅ Enhanced GET /api/cameras with filtering
- ✅ POST /api/cameras/:id/detect-model
- ✅ GET /api/cameras/:id/capabilities
- ✅ GET /api/models
- ✅ GET /api/cameras/stats/models

**Also implemented (not listed above):**
- Role-based access control (Admin/Viewer) on all write endpoints
- User management endpoints (GET/POST/PATCH/DELETE `/api/auth/users`)
- Profile editing endpoint (PATCH `/api/auth/me`)
- Camera group management (GET/POST/PATCH/DELETE `/api/groups`)
- Product lifecycle/EOL tracking
- Real-time analytics SSE streams (see below)

---

## Real-Time Analytics — Server-Sent Events (SSE)

The server pushes analytics data to clients in real time via SSE. Events are emitted the instant the analytics poller retrieves new data from cameras, so consumers never need to poll the REST API for fresh numbers.

### 6. Stream All Analytics — GET /api/analytics/stream

Stream analytics events from all cameras (or a single camera via query param). Designed for external tools, dashboards, and integrations that need a firehose of analytics data.

**Authentication:** Session cookie (any authenticated user).

**Query Parameters:**
- `cameraId` (string, optional) — Only receive events for this camera. The camera must belong to the authenticated user.

**SSE Headers (set automatically):**
```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**Event Format:**

Each event is a single `data:` line containing a JSON object, followed by two newlines:

```
data: {"cameraId":"abc123","timestamp":"2026-02-24T14:30:01.123Z","events":[{"eventType":"people_in","value":42,"metadata":{"source":"tvpc"}},{"eventType":"people_out","value":38,"metadata":{"source":"tvpc"}},{"eventType":"occupancy","value":4,"metadata":{"source":"tvpc"}}]}\n\n
```

**Keepalive:** A comment line is sent every 30 seconds to prevent proxy/load-balancer timeouts:
```
: keepalive\n\n
```

**Payload Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `cameraId` | string | ID of the camera that produced the events |
| `timestamp` | string (ISO 8601) | Server time when the events were broadcast |
| `events` | array | Array of analytics event objects |
| `events[].eventType` | string | One of: `people_in`, `people_out`, `occupancy`, `line_crossing`, `avg_dwell_time` |
| `events[].value` | number | The metric value (count, occupancy number, seconds, etc.) |
| `events[].metadata` | object \| null | Source info, scenario name, vehicle breakdown, etc. |

**Examples:**

```bash
# Stream all cameras
curl -N http://localhost:5000/api/analytics/stream \
  -b cookies.txt

# Stream a specific camera only
curl -N http://localhost:5000/api/analytics/stream?cameraId=abc123 \
  -b cookies.txt
```

**JavaScript (browser/Node):**
```js
const es = new EventSource('/api/analytics/stream?cameraId=abc123', {
  // credentials needed for session cookie
  withCredentials: true,
});

es.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  console.log(`Camera ${payload.cameraId}:`, payload.events);
};

es.onerror = () => {
  console.log('SSE connection lost, browser will auto-reconnect');
};
```

**Python:**
```python
import requests
import json

with requests.get(
    'http://localhost:5000/api/analytics/stream',
    cookies={'connect.sid': SESSION_COOKIE},
    stream=True,
) as resp:
    for line in resp.iter_lines(decode_unicode=True):
        if line.startswith('data: '):
            payload = json.loads(line[6:])
            print(f"Camera {payload['cameraId']}: {payload['events']}")
```

---

### 7. Stream Single Camera Analytics — GET /api/cameras/:id/analytics/stream

Stream analytics events for a single camera. Same SSE protocol as the global stream but scoped to one camera. Ideal for camera detail views in a UI.

**URL Parameters:**
- `id` (string, required) — Camera ID. Must belong to the authenticated user.

**Authentication:** Session cookie (any authenticated user).

**Event Format:** Identical to the global stream (see above).

**Example:**
```bash
curl -N http://localhost:5000/api/cameras/abc123/analytics/stream \
  -b cookies.txt
```

**JavaScript:**
```js
const es = new EventSource('/api/cameras/abc123/analytics/stream', {
  withCredentials: true,
});

es.onmessage = (event) => {
  const { events } = JSON.parse(event.data);
  const occupancy = events.find(e => e.eventType === 'occupancy');
  if (occupancy) {
    document.getElementById('occ').textContent = occupancy.value;
  }
};
```

---

### SSE Integration Notes

| Concern | Detail |
|---------|--------|
| **Event frequency** | One burst per camera per poll cycle (~1 minute, configurable via `ANALYTICS_POLL_INTERVAL` env var). |
| **Reconnection** | Browsers auto-reconnect on disconnect. The `EventSource` API handles this natively. For non-browser clients, reconnect on TCP close. |
| **Keepalive** | A `: keepalive` comment is sent every 30 seconds. If your proxy has a longer idle timeout you can ignore these. |
| **Backpressure** | The server does not buffer missed events. If a client disconnects and reconnects, it should fetch the latest state from the REST API (`GET /api/cameras/:id/analytics`) and then resume streaming. |
| **Auth** | Both endpoints require a valid session cookie. An unauthenticated request returns `401`. |
| **Ownership** | Camera ownership is validated at connection time. If a camera ID is provided that doesn't belong to the user, the server returns `403`. |
| **Cleanup** | The server automatically unsubscribes listeners when the client TCP connection closes. No manual teardown is needed on the server side. |
