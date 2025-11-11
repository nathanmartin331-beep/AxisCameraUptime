# VAPIX Response Validation Guide

## Overview

This document explains how the system validates Axis camera VAPIX API responses, what data we expect to receive, and how to test your cameras.

## VAPIX systemready.cgi API

The Axis VAPIX API provides a `systemready.cgi` endpoint that returns camera health status:

**Endpoint:** `http://{camera-ip}/axis-cgi/systemready.cgi`  
**Authentication:** Not required for systemready endpoint  
**Method:** GET  
**Response Format:** Key-value pairs, one per line

### Expected Response Format

```
systemready=yes
uptime=123456
bootid=abc123def456
```

**Field Descriptions:**
- `systemready`: Indicates if camera is ready (`yes` or `no`)
- `uptime`: Camera uptime in seconds since last boot
- `bootid`: Unique identifier that changes on each reboot

## Validation Improvements Implemented

### 1. **Robust Parsing**
- Handles both Unix (`\n`) and Windows (`\r\n`) line endings
- Case-insensitive key matching
- Handles extra whitespace gracefully
- Validates each line contains `=` separator

### 2. **Required Field Validation**
```typescript
// Validates systemready field exists
if (!data.systemready) {
  throw new Error(`Missing 'systemready' field in response`);
}

// Validates systemready value is yes or no
if (systemReady !== "yes" && systemReady !== "no") {
  throw new Error(`Invalid systemready value: '${data.systemready}'`);
}
```

### 3. **Optional Field Handling**
- **uptime**: Validated as integer, defaults to 0 if invalid
- **bootid**: Warns if missing (reboot detection won't work)

### 4. **Improved Error Messages**
Before:
```
[Monitor] ✗ Camera (192.168.1.100) - Offline: This operation was aborted
```

After:
```
[Monitor] ✗ Camera (192.168.1.100) - Offline: Timeout after 5000ms
[Monitor] ✗ Camera (192.168.1.101) - Offline: HTTP 404: Not Found
[Monitor] ✗ Camera (192.168.1.102) - Offline: Missing 'systemready' field
```

### 5. **Non-Axis Device Detection**
The system now validates that responses match VAPIX format. If a non-Axis device responds, you'll see:
```
[Monitor] ✗ Camera - Offline: Invalid response format - not VAPIX systemready
```

## Testing Your Cameras

### Option 1: Via API (Recommended for Debugging)

Test any camera you've already added to the system:

```bash
# Test camera by ID
curl -X POST http://localhost:5000/api/cameras/{camera-id}/test-connection \
  -H "Content-Type: application/json" \
  --cookie "connect.sid=your-session-cookie"
```

**Response Example (Success):**
```json
{
  "success": true,
  "cameraName": "Front Entrance",
  "ipAddress": "192.168.1.100",
  "responseTime": 234,
  "httpStatus": 200,
  "rawResponsePreview": "systemready=yes\nuptime=123456\nbootid=abc123",
  "parsedFields": {
    "systemready": "yes",
    "uptime": "123456",
    "bootid": "abc123"
  },
  "validation": {
    "hasSystemReady": true,
    "systemReadyValue": "yes",
    "hasBootId": true,
    "bootIdValue": "abc123",
    "hasUptime": true,
    "uptimeValue": "123456",
    "isValidAxisFormat": true
  },
  "interpretation": {
    "isOnline": true,
    "uptime": 123456,
    "bootId": "abc123",
    "canDetectReboots": true
  }
}
```

**Response Example (Timeout):**
```json
{
  "success": false,
  "error": "Timeout - camera did not respond within 10 seconds"
}
```

### Option 2: Monitor Logs

When the monitoring system runs (every 5 minutes), check the server logs:

```bash
# Watch for VAPIX responses in development mode
# The system logs raw responses from cameras
```

In development, the first poll of each camera logs the raw VAPIX response for debugging.

### Option 3: Manual Browser Test

You can manually test the VAPIX endpoint in your browser:

1. Navigate to: `http://{your-camera-ip}/axis-cgi/systemready.cgi`
2. You should see plain text response like:
   ```
   systemready=yes
   uptime=123456
   bootid=abc123def456
   ```

## Current Test Cameras Status

**All test cameras are showing offline** - This is expected because they use non-existent IP addresses:

- **192.168.1.101-120**: Demo IPs on a network that doesn't exist
- **203.0.113.25**: TEST-NET-3 (IANA reserved documentation range)
- **198.51.100.10**: TEST-NET-2 (IANA reserved documentation range)

These are placeholder cameras for demonstration. **Replace them with your actual Axis camera IPs.**

## Troubleshooting

### "Timeout after 5000ms"
- **Cause**: Camera not responding within timeout
- **Solutions**:
  - Verify IP address is correct
  - Check camera is powered on and connected to network
  - Ensure camera is on the same network or routable
  - For public IPs, verify firewall allows access

### "HTTP 404: Not Found"
- **Cause**: Camera doesn't have VAPIX API at this endpoint
- **Solutions**:
  - Verify it's an Axis camera (other brands won't work)
  - Check camera firmware is up to date
  - Some very old Axis cameras may not support systemready.cgi

### "Missing 'systemready' field"
- **Cause**: Response doesn't contain expected VAPIX data
- **Solutions**:
  - Device may not be an Axis camera
  - Endpoint may be returning HTML error page
  - Check rawResponsePreview to see what was actually returned

### "Invalid response format - not VAPIX systemready"
- **Cause**: Response is not in key=value format
- **Solutions**:
  - Not an Axis camera
  - Wrong endpoint
  - Camera returning error page

## What We Know About VAPIX Responses

### ✅ **What We Validate:**
1. Response contains `systemready` field
2. `systemready` value is either `yes` or `no`
3. Response format follows `key=value` pattern
4. HTTP status is 200 OK
5. Response is received within timeout

### ✅ **What We Handle Gracefully:**
1. Missing `bootid` (warns but doesn't fail)
2. Missing `uptime` (defaults to 0)
3. Extra whitespace in responses
4. Mixed line endings (Windows/Unix)
5. Case variations in keys

### ⚠️ **What We Don't Validate (Yet):**
1. Authenticity of Axis camera (could improve with vendor ID check)
2. Firmware version compatibility
3. Additional VAPIX fields beyond systemready/uptime/bootid

## Security Notes

### Why Credentials Aren't Used for systemready.cgi

The VAPIX `systemready.cgi` endpoint is **unauthenticated by design** (per Axis specification). This allows health monitoring without exposing credentials.

**Your credentials ARE stored securely:**
- Encrypted with bcryptjs before database storage
- Never sent in monitoring requests (not needed)
- Used only if/when implementing authenticated VAPIX endpoints

### Test Endpoint Security

The `/api/cameras/:id/test-connection` endpoint is secure:
- ✅ Requires authentication (session-based)
- ✅ Ownership verification (can only test your own cameras)
- ✅ No SSRF vulnerability (can't test arbitrary IPs)
- ✅ Limited response exposure (200 char preview, not full raw response)

## Next Steps

1. **Add Real Cameras**: Replace test IPs with your actual Axis camera IPs
2. **Test Connection**: Use the test endpoint to verify VAPIX responses
3. **Monitor Logs**: Watch for successful polls and any validation warnings
4. **Check Dashboard**: Verify uptime tracking is working correctly

## Questions?

If you're seeing unexpected behavior, use the test endpoint to see the exact VAPIX response your cameras are returning. This will help diagnose any parsing or compatibility issues.
