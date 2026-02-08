# Axis Camera VAPIX Edge Cases & Model Compatibility Reference

> Comprehensive reference for all known Axis camera model edge cases, VAPIX protocol quirks, and compatibility issues encountered in the AxisCameraUptime monitoring system.

## Table of Contents

1. [Camera Series Overview](#camera-series-overview)
2. [Fisheye & Panoramic Cameras](#fisheye--panoramic-cameras)
3. [Multi-Sensor & Multi-Directional Cameras](#multi-sensor--multi-directional-cameras)
4. [Thermal & Bispectral Cameras](#thermal--bispectral-cameras)
5. [Modular Cameras (F-Series)](#modular-cameras-f-series)
6. [Door Stations & Intercoms (A/I-Series)](#door-stations--intercoms-ai-series)
7. [Body-Worn Cameras (W-Series)](#body-worn-cameras-w-series)
8. [Explosion-Protected Cameras (ExCam)](#explosion-protected-cameras-excam)
9. [VAPIX Protocol Variants](#vapix-protocol-variants)
10. [Video Check Edge Cases](#video-check-edge-cases)
11. [systemready.cgi Edge Cases](#systemreadycgi-edge-cases)
12. [Legacy Firmware Compatibility](#legacy-firmware-compatibility)

---

## Camera Series Overview

| Series | Type | Examples | HTTP Reachable | Notes |
|--------|------|---------|----------------|-------|
| **P** | Fixed/PTZ box/bullet/dome | P3255, P1448, P3719 | Yes | Most common, standard VAPIX |
| **Q** | PTZ, thermal, specialty | Q6135, Q1942, Q8742 | Yes | Some have dual sensors |
| **M** | Mini/panoramic/fisheye | M3007, M3057, M4308 | Yes | Square/circular sensor output |
| **F** | Modular (main unit + sensors) | F34, F44, FA54 | Yes | Main unit is HTTP host; sensors are not |
| **A** | Door stations | A8207, A8105 | Yes | Has SIP, relay I/O, audio; limited video |
| **I** | Intercoms | I8116 | Yes | Similar to A-series but intercom-focused |
| **W** | Body-worn | W100, W101, W800 | **NO** | Upload-only via AXIS Body Worn Manager |
| **T** | Thermal standalone | T8705 | Yes | Bare thermal, no visual overlay |
| **D** | Audio devices | D3110 | Yes | Audio-only, no video endpoint |

---

## Fisheye & Panoramic Cameras

### Problem
Fisheye cameras have circular sensors that produce **square** native output. Requesting a 16:9 resolution like `160x90` causes HTTP 500 or returns a distorted/empty image.

### Affected Models
| Model | Type | Native Aspect | Correct Thumbnail |
|-------|------|--------------|-------------------|
| M3007 | Fisheye (5MP) | 1:1 | `160x160` |
| M3007-P | Fisheye (5MP) PoE | 1:1 | `160x160` |
| M3057 | Fisheye (6MP) | 1:1 | `160x160` |
| M3058 | Fisheye (12MP) | 1:1 | `160x160` |
| M3067 | Fisheye (6MP, next gen) | 1:1 | `160x160` |
| M3068 | Fisheye (12MP, next gen) | 1:1 | `160x160` |
| M3077 | Fisheye (6MP, outdoor) | 1:1 | `160x160` |

### Multi-Sensor Panoramic (Multi-Imager)
These have multiple sensors stitched into a wide panoramic view:

| Model | Sensors | Native Aspect | Correct Thumbnail |
|-------|---------|--------------|-------------------|
| M4308 | 4 sensors (4x 3MP) | 32:9 or wider | `320x90` |
| M4317 | 4 sensors (5MP) | 32:9 | `320x90` |
| M4318 | 4 sensors (12MP) | 32:9 | `320x90` |
| M4327 | 4 sensors (outdoor) | 32:9 | `320x90` |
| M4328 | 4 sensors (outdoor, 12MP) | 32:9 | `320x90` |

### Detection Logic
```
IF model matches M30x7 or M30x8 → fisheye → 160x160
IF model matches M43xx → multi-imager panoramic → 320x90
IF camera.numberOfViews > 1 && series == 'M' → 320x90
ELSE → 160x90 (standard 16:9)
```

### Fallback Strategy
Always try with `resolution=` param first, then retry without it on failure. The camera will return its native resolution as fallback, which is always valid.

---

## Multi-Sensor & Multi-Directional Cameras

### Multi-Directional P-Series
These have multiple independent sensors pointed in different directions (NOT stitched):

| Model | Sensors | Notes |
|-------|---------|-------|
| P3719-PLE | 4 sensors | Each sensor is an independent channel |
| P3717-PLE | 4 sensors | Similar to P3719 |
| P3727 | 4 sensors | Next generation |
| P3737 | 4 sensors | With IR |
| P3747 | 4 sensors | Vandal-resistant |
| P3748 | 4 sensors | High-res version |

### VAPIX Behavior
- `NbrOfSources` = number of physical sensors (e.g., 4)
- `NbrOfViews` = number of configured views (may differ from sources)
- Each sensor is addressed via `camera=N` parameter (1-indexed)
- Default `camera=1` returns first sensor only

### Video Check Strategy
```
GET /axis-cgi/jpg/image.cgi?camera=1  → First sensor (default for monitoring)
GET /axis-cgi/jpg/image.cgi?camera=2  → Second sensor
...etc
```

For uptime monitoring, checking `camera=1` is sufficient — if the camera hardware is up, all sensors are accessible.

---

## Thermal & Bispectral Cameras

### Pure Thermal
| Model | Type | Notes |
|-------|------|-------|
| Q1942-E | Thermal bullet | Standard thermal, valid JPEG output |
| Q1951-E | Thermal bullet | Next gen |
| Q1961-TE | Thermal PTZ | Standard VAPIX |
| Q2901-E | Thermal compact | Entry-level thermal |

Pure thermal cameras work with standard VAPIX. The JPEG output is a grayscale/colorized thermal image.

### Bispectral (Thermal + Visual)
| Model | Sensors | Notes |
|-------|---------|-------|
| Q8742-E | 2 (thermal + visual) | `camera=1` = thermal, `camera=2` = visual |
| Q8752-E | 2 (thermal + visual) | Next gen |

### VAPIX Behavior
- `camera=1` returns thermal image (grayscale/palette)
- `camera=2` returns visual image (standard color)
- Both are valid JPEG responses
- For monitoring, either channel works; `camera=1` (default) is fine

---

## Modular Cameras (F-Series)

### Architecture
- **Main unit** (e.g., F34, F44): Processing unit, HTTP host, runs VAPIX
- **Sensor units** (e.g., FA1125, FA3105): Connected via cable, NOT independently addressable

### Key Behavior
- Only the main unit is reachable via HTTP
- Each sensor unit appears as a channel: `camera=1`, `camera=2`, etc.
- `NbrOfViews` reflects number of connected sensor units
- Main unit without sensors connected may return HTTP 500 on image request

### Monitoring Strategy
- Add only the main unit's IP to the monitoring system
- Use `camera=1` for video check (assumes at least one sensor connected)
- If video check fails with HTTP 500, it may indicate no sensor units connected (not necessarily a real failure)

---

## Door Stations & Intercoms (A/I-Series)

### Door Stations (A-Series)
| Model | Features | Notes |
|-------|----------|-------|
| A8207-VE | Video, SIP, I/O, audio | Has camera, supports standard JPEG API |
| A8105-E | Video, SIP, audio | Compact door station |
| A8004-VE | Video, SIP | Basic door station |

### Intercoms (I-Series)
| Model | Features | Notes |
|-------|----------|-------|
| I8116-E | Video, SIP, audio | Network intercom |

### Key Behavior
- Support standard VAPIX for video (image.cgi works)
- May have additional SIP/relay endpoints that don't affect monitoring
- Series detection should include `'A'` and `'I'` for proper classification
- systemready.cgi is supported on modern firmware

---

## Body-Worn Cameras (W-Series)

### CRITICAL: Not HTTP-Reachable

| Model | Notes |
|-------|-------|
| W100 | First gen body-worn |
| W101 | Updated body-worn |
| W800 | System controller (this IS HTTP-reachable) |

### Why They Can't Be Monitored
- W100/W101 cameras are docked in a system controller (W800)
- When deployed (on an officer), they have **no network connectivity**
- When docked, they upload footage to AXIS Body Worn Manager via proprietary protocol
- They do NOT expose HTTP/VAPIX endpoints
- The W800 system controller IS reachable but doesn't proxy individual camera endpoints

### Recommendation
- The W800 system controller can be monitored for uptime
- Individual W100/W101 body-worn cameras **cannot** be monitored via this system
- If a user tries to add a W-series camera IP, it will simply timeout (not a bug)

---

## Explosion-Protected Cameras (ExCam)

### Naming Convention
ExCam cameras are standard Axis cameras in explosion-proof housings. The model name includes a prefix:

| ExCam Model | Base Camera | Series |
|-------------|------------|--------|
| ExCam XF P1378 | P1378 | P |
| ExCam XF Q1785 | Q1785 | Q |
| ExCam XPT Q6135 | Q6135 | Q |
| ExCam XF M3206 | M3206 | M |

### Detection
- `ProdNbr` returns the full ExCam name (e.g., `ExCam XF P1378`)
- Series detection must parse past the `ExCam XF` / `ExCam XPT` prefix
- The base camera model determines all VAPIX behavior
- Firmware is identical to the base model

### Detection Logic
```
IF model starts with "EXCAM" → strip "EXCAM XF " or "EXCAM XPT " prefix → detect series from remainder
```

---

## VAPIX Protocol Variants

### Three Protocol Modes

| Mode | Firmware | Auth | Request | Response |
|------|----------|------|---------|----------|
| **Legacy** (key=value) | 5.x – 9.x | None (systemready) / Digest (param) | GET | `key=value\n` text |
| **JSON** (v1.2+) | 9.50+ | None (systemready) / Digest (others) | GET or POST | JSON `{"apiVersion":"1.0",...}` |
| **Modern JSON** (v1.4+) | 11.x+ | None (systemready) | POST with JSON body | JSON response |

### Protocol Detection Flow
```
1. GET /axis-cgi/systemready.cgi (no auth)
2. IF 404 → "param" protocol (very old firmware)
3. IF response starts with '{' → "json" protocol
4. IF response contains 'key=value' → "legacy" protocol
5. Cache the result per IP for subsequent polls
```

### Per-Camera Protocol Cache
The `protocolCache` Map stores the detected protocol per camera IP address. This eliminates redundant GET→POST retries on every poll cycle. The cache persists for the lifetime of the process and is invalidated when:
- The process restarts
- A camera's IP address changes (new IP = new cache entry)

---

## Video Check Edge Cases

### Resolution Parameter Compatibility

| Scenario | Resolution Param | Expected Result |
|----------|-----------------|-----------------|
| Standard 16:9 camera | `resolution=160x90` | 2-5KB JPEG thumbnail |
| Fisheye camera | `resolution=160x160` | 2-5KB square JPEG |
| Multi-imager panoramic | `resolution=320x90` | 5-10KB wide JPEG |
| Very old firmware (<5.0) | `resolution=` anything | May be ignored, returns native |
| Camera with privacy mask covering entire view | Any | Valid JPEG (black image) |
| Camera during boot | Any | HTTP 503 |
| Sensor disconnected (F-series) | Any | HTTP 500 |

### Fallback Chain
```
1. Try with model-appropriate resolution parameter
2. On failure (500, empty, non-image), retry WITHOUT resolution parameter
3. On second failure, report video_failed
```

### Video Endpoint Variants
| Endpoint | Firmware | Notes |
|----------|----------|-------|
| `/axis-cgi/jpg/image.cgi` | 5.0+ (modern) | Standard endpoint, supports `resolution=`, `camera=` |
| `/jpg/image.jpg` | VAPIX 1/2 (very old) | Pre-5.0 firmware, no query params |
| `/axis-cgi/bitmap/image.bmp` | Some old models | BMP format, rare |

---

## systemready.cgi Edge Cases

### Response Variations

| Firmware | Response Format | Example |
|----------|----------------|---------|
| 9.50 – 10.x | Key=value text | `systemready=yes\nuptime=12345\nbootid=abc` |
| 11.x+ (some) | JSON on GET | `{"apiVersion":"1.0","data":{"systemReady":"yes",...}}` |
| 11.x+ (some) | JSON on POST only | GET returns error JSON, POST works |
| Pre-9.50 | 404 Not Found | Endpoint doesn't exist |

### Error Responses to Handle

| HTTP Status | Meaning | Action |
|-------------|---------|--------|
| 200 + valid data | Camera is responding | Parse normally |
| 200 + JSON | Modern firmware | Switch to JSON protocol |
| 200 + HTML | Web UI redirect (misconfigured) | Treat as parse error, fall back to param.cgi |
| 404 | Old firmware, no systemready.cgi | Fall back to param.cgi |
| 500 | Server error (during boot or misconfigured) | Fall back to param.cgi |
| 503 | Camera booting | Treat as offline (temporary) |
| Connection refused | Camera off or wrong IP | Report offline |
| Timeout | Network issue or camera hung | Report offline |

### Content-Type Guard
Some misconfigured cameras or network devices at the same IP may return HTML instead of the expected VAPIX response. The response parser should:
1. Check if response starts with `<` (HTML) → treat as invalid
2. Check Content-Type header for `text/html` → treat as invalid
3. Only parse if response looks like `key=value` or valid JSON

---

## Legacy Firmware Compatibility

### VAPIX Version History

| VAPIX Version | Firmware | Key Changes |
|--------------|----------|-------------|
| VAPIX 1 | Pre-4.0 | `/jpg/image.jpg`, Basic auth only |
| VAPIX 2 | 4.0-4.x | `/axis-cgi/jpg/image.cgi`, added Digest auth |
| VAPIX 3 | 5.0-8.x | param.cgi, standardized key=value format |
| VAPIX 4 (v1.0-v1.2) | 9.0-9.50 | systemready.cgi introduced, JSON for some APIs |
| VAPIX 4 (v1.4+) | 10.x-11.x | Full JSON API, POST-based, basicdeviceinfo.cgi |

### Very Old Camera Handling (pre-5.0)
- No systemready.cgi → falls back to param.cgi automatically via protocolCache
- No basicdeviceinfo.cgi → model detection uses param.cgi Brand group
- Video endpoint may be `/jpg/image.jpg` instead of `/axis-cgi/jpg/image.cgi`
- If `/axis-cgi/jpg/image.cgi` returns 404, could try `/jpg/image.jpg` as last resort
- These cameras are increasingly rare in production deployments

### param.cgi Fallback
When systemready.cgi is unavailable (404 or 500), the system falls back to:
```
GET /axis-cgi/param.cgi?action=list&group=root.Properties.System
```
This requires Digest authentication but works on virtually all Axis cameras from firmware 4.0+.

---

## Implementation Status

### Implemented
- [x] Protocol caching (protocolCache) to avoid redundant GET→POST retries
- [x] Fisheye detection for M3007, M3057, M3058 → 160x160 thumbnails
- [x] Multi-sensor panoramic detection → 320x90 thumbnails
- [x] Video check fallback (thumbnail → no-resolution-param)
- [x] systemready.cgi 404 → param.cgi fallback
- [x] JSON response detection → JSON API path
- [x] Series detection for P, Q, M, F

### Needs Implementation
- [ ] Expanded fisheye list: M3067, M3068, M3077
- [ ] Multi-imager panoramic: M4308, M4317, M4318, M4327, M4328
- [ ] ExCam prefix stripping in series detection
- [ ] A-series and I-series in series detection
- [ ] HTTP 500 on systemready.cgi → param.cgi fallback (same as 404)
- [ ] HTML response guard on systemready.cgi
- [ ] Multi-directional P-series detection (P3719, P3717, P3727, P3737, P3747, P3748)
- [ ] Very old firmware `/jpg/image.jpg` fallback
- [ ] W-series (body-worn) warning/rejection

---

## Quick Reference: Model → Behavior

```
M3007, M3057, M3058, M3067, M3068, M3077  → Fisheye (160x160 thumbnail)
M4308, M4317, M4318, M4327, M4328         → Multi-imager (320x90, use camera=1)
P3719, P3717, P3727, P3737, P3747, P3748  → Multi-directional (use camera=1)
Q8742, Q8752                               → Bispectral (camera=1=thermal, camera=2=visual)
F34, F44, FA54                             → Modular (main unit only, sensors via camera=N)
ExCam XF *, ExCam XPT *                   → Strip prefix, treat as base model
W100, W101                                 → NOT HTTP-reachable, cannot monitor
A8207, A8105, I8116                        → Standard VAPIX, has SIP/relay extras
```
