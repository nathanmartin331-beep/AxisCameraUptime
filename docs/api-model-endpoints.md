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
